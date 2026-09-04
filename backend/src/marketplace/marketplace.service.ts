import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Listing, ListingStatus, Prisma, Role, SellerKeyStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BlockchainService } from './blockchain.service';
import { SellerKeyService } from './seller-key.service';
import {
  BuyListingDto,
  CancelListingDto,
  CreateListingDto,
  DepositCheckDto,
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
    private readonly sellerKeys: SellerKeyService,
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
    return this.enrichWithSellerKey(row, this.toDto(row));
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
  // Prepare (client-signed transfer)
  // ---------------------------------------------------------------------------

  /**
   * Build a ready-to-sign, seller-signed `transferCredit` transaction for the
   * ACTIVE listing. Returns a base64 transaction the frontend submits to
   * Phantom; afterwards the caller POSTs the resulting signature to `buy`
   * (client-signed settlement). Ownership/status are checked first.
   */
  async prepareBuy(id: string, actor: Actor, buyer: string): Promise<{ transaction: string; seller: string; listingId: string; amount: number }> {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException(`Listing "${id}" not found.`);
    if (listing.status !== ListingStatus.ACTIVE) {
      throw new BadRequestException(`Listing is ${listing.status}; only ACTIVE listings can be purchased.`);
    }
    if (buyer === listing.seller) {
      throw new BadRequestException('You cannot buy your own listing.');
    }
    const prepared = await this.blockchain.buildTransferTx({
      creditId: listing.creditId,
      seller: listing.seller,
      buyer,
      amount: listing.amount,
    });
    return {
      transaction: prepared.transaction,
      seller: prepared.seller,
      listingId: listing.id,
      amount: listing.amount,
    };
  }

  // ---------------------------------------------------------------------------
  // Buy
  // ---------------------------------------------------------------------------

  /**
   * Purchase a listing. Settles server-side via the seller's custody key (Design A):
   * the buyer's wallet is NEVER asked to sign the seller's `transferCredit` transaction.
   * The backend resolves the seller's confirmed settlement key, verifies the custody ATA
   * holds the listed amount, ensures the buyer's Token-2022 ATA exists, then signs +
   * submits the transfer with the custody keypair. Legacy callers may still submit the
   * signature of an already-submitted client-signed transfer via `txSignature`.
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

    if (!dto.txSignature) {
      // Server-settlement path: resolve the seller's custody key and settle with it.
      const custody = await this.sellerKeys.resolveActiveSecret(listing.seller, listing.sellerUserId);
      const custodyOk = await this.blockchain.verifyOwnership({
        creditId: listing.creditId,
        wallet: custody.publicKey,
        amount: listing.amount,
      });
      if (!custodyOk) {
        throw new BadRequestException(
          `The seller's settlement wallet is not funded for this listing. ` +
            'The seller must deposit the listed credits into their custody ATA before the purchase can complete.',
        );
      }
      // Guarantee the buyer's Token-2022 ATA exists so `transferCredit` can settle.
      await this.blockchain.ensureTokenAccount(listing.creditId, dto.buyer);

      const settlement = await this.blockchain.settlePurchase({
        creditId: listing.creditId,
        seller: custody.publicKey,
        buyer: dto.buyer,
        amount: listing.amount,
        price: listing.price,
        sellerSecret: custody.secret,
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
      await this.upsertBuyerHolding(listing, dto.buyer);
      this.logger.log(
        `Listing ${id} SOLD (server-settled) to ${dto.buyer} by user ${actor.id} via custody ${custody.publicKey} (tx ${settlement.txSignature}).`,
      );
      return this.toDto(row);
    }

    // Legacy client-signed settlement: the transfer was already submitted by the
    // seller wallet; record the provided signature as the settlement proof.
    const settlement = await this.blockchain.settlePurchase({
      creditId: listing.creditId,
      seller: listing.seller,
      buyer: dto.buyer,
      amount: listing.amount,
      price: listing.price,
      sellerSecret: dto.sellerSecret,
      txSignature: dto.txSignature,
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

    // Keep the off-chain ownership ledger in sync with the on-chain transfer:
    // create / top-up the buyer's Holding for this mint so they can later
    // retire the credits they just purchased.
    await this.upsertBuyerHolding(listing, dto.buyer);

    this.logger.log(
      `Listing ${id} SOLD to ${dto.buyer} by user ${actor.id} (tx ${settlement.txSignature}).`,
    );
    return this.toDto(row);
  }

  // ---------------------------------------------------------------------------
  // Deposit (fund the custody ATA)
  // ---------------------------------------------------------------------------

  /**
   * Build a ready-to-sign `transferCredit` deposit transaction moving the listed
   * credits from the seller's main wallet into their custody ATA. The seller
   * signs once with Phantom and confirms via {@link confirmDeposit}.
   */
  async prepareDeposit(
    id: string,
    actor: Actor,
  ): Promise<{ transaction: string; seller: string; listingId: string; amount: number; custodyPublicKey: string; custodyAta: string }> {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException(`Listing "${id}" not found.`);
    this.assertSellerAuthorized(listing, actor);

    const custody = await this.sellerKeys.resolveActiveSecret(listing.seller, listing.sellerUserId);
    const prepared = await this.blockchain.buildTransferTx({
      creditId: listing.creditId,
      seller: listing.seller,
      buyer: custody.publicKey,
      amount: listing.amount,
    });
    return {
      transaction: prepared.transaction,
      seller: prepared.seller,
      listingId: listing.id,
      amount: listing.amount,
      custodyPublicKey: custody.publicKey,
      custodyAta: this.sellerKeys.ataForPublicKey(custody.publicKey),
    };
  }

  /**
   * Verify that a deposit landed: re-read the on-chain custody ATA balance and
   * compare it to the listing amount. No chain write is performed.
   */
  async confirmDeposit(id: string, actor: Actor, _txSignature: string): Promise<DepositCheckDto> {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException(`Listing "${id}" not found.`);
    this.assertSellerAuthorized(listing, actor);

    const custody = await this.sellerKeys.resolveActiveSecret(listing.seller, listing.sellerUserId);
    const custodyBalance = await this.sellerKeys.getCustodyBalance(custody.publicKey);
    const funded = custodyBalance >= listing.amount;
    this.logger.log(
      `Deposit check for listing ${id}: custody ${custody.publicKey} balance=${custodyBalance} required=${listing.amount} -> ${funded ? 'FUNDED' : 'NOT FUNDED'}.`,
    );
    return { funded, custodyBalance, amount: listing.amount };
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

  /** The listing owner's VerdiCred user (or an ADMIN) may manage its custody. */
  private assertSellerAuthorized(listing: Listing, actor: Actor): void {
    const isOwnerUser =
      listing.sellerUserId === actor.id || actor.role === Role.ADMIN;
    if (!isOwnerUser) {
      throw new ForbiddenException('Only the listing owner may manage its settlement wallet.');
    }
  }

  /** Attach the seller's custody-key overview + funding state to a listing DTO. */
  private async enrichWithSellerKey(row: Listing, dto: ListingResponseDto): Promise<ListingResponseDto> {
    const key = await this.prisma.sellerMarketplaceKey.findFirst({
      where: { walletAddress: row.seller, status: SellerKeyStatus.ACTIVE },
    });
    if (!key) return dto;
    dto.custodyPublicKey = key.publicKey;
    dto.custodyAta = this.sellerKeys.ataForPublicKey(key.publicKey);
    dto.sellerKeyReady = key.confirmedAt !== null;
    if (key.confirmedAt) {
      const balance = await this.sellerKeys.getCustodyBalance(key.publicKey);
      dto.custodyFunded = balance >= row.amount;
    } else {
      dto.custodyFunded = false;
    }
    return dto;
  }

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

  /**
   * Create / top-up the buyer's Holding for a mint after a successful
   * on-chain purchase, so backend ownership state mirrors the chain. One row
   * per (user, mint); the buyer wallet is linked to the VerdiCred user when
   * known, otherwise the wallet is recorded for later reconciliation.
   */
  private async upsertBuyerHolding(
    listing: Listing,
    buyerWallet: string,
  ): Promise<void> {
    const buyerUser = await this.prisma.user.findFirst({
      where: { walletAddress: buyerWallet },
    });
    if (!buyerUser) return; // no linked user yet; reconcile later

    const existing = await this.prisma.holding.findUnique({
      where: { ownerId_tokenMint: { ownerId: buyerUser.id, tokenMint: listing.creditId } },
    });
    if (existing) {
      await this.prisma.holding.update({
        where: { id: existing.id },
        data: { availableBalance: { increment: listing.amount } },
      });
      return;
    }
    await this.prisma.holding.create({
      data: {
        ownerId: buyerUser.id,
        walletAddress: buyerWallet,
        projectId: listing.projectId ?? 'unknown',
        tokenMint: listing.creditId,
        projectName: listing.projectName ?? 'Purchased Credit',
        projectType: listing.projectType ?? 'REFORESTATION',
        methodology: listing.methodology ?? '—',
        vintage: listing.vintage ?? new Date().getFullYear(),
        availableBalance: listing.amount,
      },
    });
  }
}
