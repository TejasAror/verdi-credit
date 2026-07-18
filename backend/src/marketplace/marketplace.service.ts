import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Listing, ListingStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BlockchainService } from './blockchain.service';
import {
  BuyListingDto,
  CancelListingDto,
  CreateListingDto,
  ListingResponseDto,
} from './dto/marketplace.dto';

/** The authenticated actor resolved by SupabaseAuthGuard. */
export interface Actor {
  id: string;
  role: Role;
  email?: string;
}

/**
 * MarketplaceService — Stage 5 orchestrator.
 *
 * Owns the listing lifecycle (create → active → sold | cancelled) and delegates
 * every blockchain interaction to {@link BlockchainService} so the settlement
 * layer can be swapped from mock to real without touching this class.
 *
 * Authorization rules:
 *  - Only the owner (the seller wallet AND the listing's VerdiCred user) may
 *    create or cancel a listing.
 *  - A listing may only be bought while ACTIVE; a buyer cannot buy their own
 *    listing. On purchase, ownership transfers (buyer recorded, status=SOLD)
 *    and the credits are transferred via BlockchainService.settlePurchase.
 */
@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blockchain: BlockchainService,
  ) {}

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  /** All ACTIVE listings (marketplace browse), newest first. */
  async findActive(): Promise<ListingResponseDto[]> {
    const rows = await this.prisma.listing.findMany({
      where: { status: ListingStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  /** Every listing regardless of status (admin / history view). */
  async findAll(): Promise<ListingResponseDto[]> {
    const rows = await this.prisma.listing.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  /** A single listing by id (credit details page). */
  async findOne(id: string): Promise<ListingResponseDto> {
    const row = await this.prisma.listing.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Listing "${id}" not found.`);
    }
    return this.toDto(row);
  }

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  /**
   * Create an ACTIVE listing. The caller must be authenticated; the seller
   * wallet must currently own the credit (checked via BlockchainService).
   */
  async create(dto: CreateListingDto, actor: Actor): Promise<ListingResponseDto> {
    const amount = dto.amount ?? 1;

    const owns = await this.blockchain.verifyOwnership({
      creditId: dto.creditId,
      wallet: dto.seller,
      amount,
    });
    if (!owns) {
      throw new ForbiddenException(
        `Wallet ${dto.seller} does not own ${amount} of credit ${dto.creditId}.`,
      );
    }

    // Prevent duplicate active listings for the same credit by the same seller.
    const existing = await this.prisma.listing.findFirst({
      where: {
        creditId: dto.creditId,
        seller: dto.seller,
        status: ListingStatus.ACTIVE,
      },
    });
    if (existing) {
      throw new BadRequestException(
        'An active listing for this credit by this seller already exists.',
      );
    }

    const row = await this.prisma.listing.create({
      data: {
        creditId: dto.creditId,
        seller: dto.seller,
        price: dto.price,
        amount,
        status: ListingStatus.ACTIVE,
        sellerUserId: actor.id,
        projectId: dto.projectId ?? null,
        projectName: dto.projectName ?? null,
        projectType: dto.projectType ?? null,
        methodology: dto.methodology ?? null,
        vintage: dto.vintage ?? null,
        verifiedTonnes: dto.verifiedTonnes ?? null,
        reportCid: dto.reportCid ?? null,
        metadata: (dto as { metadata?: Prisma.InputJsonValue }).metadata ?? Prisma.JsonNull,
      },
    });

    this.logger.log(
      `Listing ${row.id} created by user ${actor.id} (seller ${dto.seller}, credit ${dto.creditId}, price ${dto.price}).`,
    );
    return this.toDto(row);
  }

  // ---------------------------------------------------------------------------
  // Buy
  // ---------------------------------------------------------------------------

  /**
   * Purchase a listing. Transfers ownership to the buyer and settles the
   * transfer via BlockchainService. Idempotency: only ACTIVE listings buyable.
   */
  async buy(id: string, dto: BuyListingDto, actor: Actor): Promise<ListingResponseDto> {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) {
      throw new NotFoundException(`Listing "${id}" not found.`);
    }
    if (listing.status !== ListingStatus.ACTIVE) {
      throw new BadRequestException(
        `Listing is ${listing.status}; only ACTIVE listings can be purchased.`,
      );
    }
    if (dto.buyer === listing.seller) {
      throw new BadRequestException('You cannot buy your own listing.');
    }

    const settlement = await this.blockchain.settlePurchase({
      creditId: listing.creditId,
      seller: listing.seller,
      buyer: dto.buyer,
      amount: listing.amount,
      price: listing.price,
    });

    const row = await this.prisma.listing.update({
      where: { id },
      data: {
        status: ListingStatus.SOLD,
        buyer: dto.buyer,
        txSignature: settlement.txSignature,
        settledAt: new Date(settlement.settledAt),
      },
    });

    this.logger.log(
      `Listing ${id} SOLD to ${dto.buyer} by user ${actor.id} (tx ${settlement.txSignature}).`,
    );
    return this.toDto(row);
  }

  // ---------------------------------------------------------------------------
  // Cancel
  // ---------------------------------------------------------------------------

  /**
   * Cancel a listing. Only the owner (the listing's VerdiCred user AND the
   * seller wallet) may cancel, and only while ACTIVE.
   */
  async cancel(id: string, dto: CancelListingDto, actor: Actor): Promise<ListingResponseDto> {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) {
      throw new NotFoundException(`Listing "${id}" not found.`);
    }
    if (listing.status !== ListingStatus.ACTIVE) {
      throw new BadRequestException(
        `Listing is ${listing.status}; only ACTIVE listings can be cancelled.`,
      );
    }

    // Ownership: the caller's user must own the listing (unless ADMIN), and the
    // supplied wallet must match the seller wallet on record.
    const isOwnerUser =
      listing.sellerUserId === actor.id || actor.role === Role.ADMIN;
    if (!isOwnerUser) {
      throw new ForbiddenException('Only the listing owner may cancel it.');
    }
    if (dto.seller !== listing.seller && actor.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'The provided wallet does not match the listing seller.',
      );
    }

    const settlement = await this.blockchain.settleCancellation(
      listing.creditId,
      listing.seller,
    );

    const row = await this.prisma.listing.update({
      where: { id },
      data: {
        status: ListingStatus.CANCELLED,
        txSignature: settlement.txSignature || listing.txSignature,
      },
    });

    this.logger.log(`Listing ${id} CANCELLED by user ${actor.id}.`);
    return this.toDto(row);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private toDto(row: Listing): ListingResponseDto {
    return {
      id: row.id,
      creditId: row.creditId,
      seller: row.seller,
      buyer: row.buyer,
      price: row.price,
      amount: row.amount,
      status: row.status,
      projectId: row.projectId,
      projectName: row.projectName,
      projectType: row.projectType,
      methodology: row.methodology,
      vintage: row.vintage,
      verifiedTonnes: row.verifiedTonnes,
      reportCid: row.reportCid,
      txSignature: row.txSignature,
      explorerUrl: row.txSignature
        ? this.blockchain.getExplorerUrl(row.txSignature)
        : null,
      settledAt: row.settledAt ? row.settledAt.toISOString() : null,
      metadata: row.metadata ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
