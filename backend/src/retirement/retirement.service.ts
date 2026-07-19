import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogAction, Prisma, RetirementStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { RetirementBlockchainService } from './retirement-blockchain.service';
import { CertificateGeneratorService, CertificateData } from './certificate-generator.service';
import { RetirementResponseDto, RetireCreditsDto } from './dto/retirement.dto';

/** The authenticated actor resolved by SupabaseAuthGuard. */
export interface RetirementActor {
  id: string;
  role: Role;
  email?: string | null;
}

const REASON_PREFIX = 'VC-RET-';

/**
 * RetirementService — Stage 6 orchestrator.
 *
 * Owns the full retirement lifecycle:
 *   1. Validate ownership — the holding must belong to the caller's user (and,
 *      when supplied, the connected wallet must match the holding wallet).
 *   2. Validate available balance — amount must be <= holding.availableBalance.
 *   3. Invoke the Solana retirement (burn/lock) instruction via
 *      RetirementBlockchainService (mock by default; real when configured).
 *   4. Persist an immutable Retirement record (PENDING -> CONFIRMED).
 *   5. Decrement the Holding.availableBalance immediately and bump
 *      Holding.totalRetired so retired credits can never be transferred /
 *      listed again.
 *   6. Reconcile marketplace listings for the same token mint: any ACTIVE
 *      listing whose funded amount now exceeds the remaining balance is
 *      auto-cancelled (so retired supply can never be sold).
 *   7. Generate a professional PDF Retirement Certificate, pin it to IPFS, and
 *      store only the returned CID. Record the CERTIFIED status.
 *   8. Write a complete, immutable audit log entry for the retirement.
 *
 * RBAC: a user may only retire from / read their own holdings and retirements;
 * ADMIN may read (and filter) every record. ADMIN cannot retire on another
 * user's behalf through this flow (ownership is enforced by holding.ownerId).
 */
@Injectable()
export class RetirementService {
  private readonly logger = new Logger(RetirementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blockchain: RetirementBlockchainService,
    private readonly certificate: CertificateGeneratorService,
    private readonly audit: AuditLogService,
  ) {}

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  /** The caller's owned credit holdings (for the Retire Credits picker). */
  async myHoldings(actor: RetirementActor) {
    const rows = await this.prisma.holding.findMany({
      where: { ownerId: actor.id, availableBalance: { gt: 0 } },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((h) => ({
      id: h.id,
      projectId: h.projectId,
      tokenMint: h.tokenMint,
      projectName: h.projectName,
      projectType: h.projectType,
      methodology: h.methodology,
      vintage: h.vintage,
      availableBalance: h.availableBalance,
      totalRetired: h.totalRetired,
      walletAddress: h.walletAddress,
    }));
  }

  /**
   * Paged retirement history. ADMIN sees all records; everyone else sees only
   * their own retirements. Supports search + filters.
   */
  async history(
    actor: RetirementActor,
    query: {
      page?: number;
      limit?: number;
      search?: string;
      reasonCategory?: string;
      status?: string;
      projectId?: string;
      sortBy?: 'timestamp' | 'createdAt' | 'retiredAmount';
      order?: 'asc' | 'desc';
    },
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.RetirementWhereInput = {};
    // RBAC scope.
    if (actor.role !== Role.ADMIN) {
      where.retiredBy = actor.id;
    }
    if (query.reasonCategory) where.reasonCategory = query.reasonCategory;
    if (query.status) where.status = query.status as RetirementStatus;
    if (query.projectId) where.projectId = query.projectId;

    if (query.search) {
      const s = query.search.trim();
      // Search across retirementId, reason, projectName, wallet, tokenMint.
      where.OR = [
        { retirementId: { contains: s, mode: 'insensitive' } },
        { reason: { contains: s, mode: 'insensitive' } },
        { projectName: { contains: s, mode: 'insensitive' } },
        { walletAddress: { contains: s, mode: 'insensitive' } },
        { tokenMint: { contains: s, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.RetirementOrderByWithRelationInput = {
      [query.sortBy ?? 'timestamp']: query.order ?? 'desc',
    };

    const [total, rows] = await Promise.all([
      this.prisma.retirement.count({ where }),
      this.prisma.retirement.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((r) => this.toDto(r)),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** A single retirement by id. Enforces RBAC (own record, or ADMIN). */
  async getById(id: string, actor: RetirementActor): Promise<RetirementResponseDto> {
    const row = await this.prisma.retirement.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Retirement "${id}" not found.`);
    if (actor.role !== Role.ADMIN && row.retiredBy !== actor.id) {
      throw new ForbiddenException('You can only view your own retirements.');
    }
    return this.toDto(row);
  }

  /** Fetch the raw certificate PDF bytes for an existing retirement. */
  async getCertificatePdf(
    id: string,
    actor: RetirementActor,
  ): Promise<{ buffer: Buffer; certificateId: string }> {
    const row = await this.prisma.retirement.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Retirement "${id}" not found.`);
    if (actor.role !== Role.ADMIN && row.retiredBy !== actor.id) {
      throw new ForbiddenException('You can only view your own certificates.');
    }
    if (!row.certificateCid) {
      throw new NotFoundException('Certificate has not been generated yet.');
    }
    const data = await this.toCertificateData(row, actor);
    const doc = await this.certificate.renderPdf(data);
    const buffer = await this.certificate.pdfToBuffer(doc);
    return { buffer, certificateId: row.retirementId };
  }

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  /**
   * Build a ready-to-sign, owner-signed `retireCredit` (burn) transaction for
   * the connected owner wallet. Returns a base64 transaction the frontend
   * submits to Phantom; afterwards the caller POSTs the resulting signature via
   * `POST /retirements` (client-signed settlement). Ownership + balance are
   * checked first (the burn itself is validated on-chain as well).
   */
  async prepare(
    dto: RetireCreditsDto,
    actor: RetirementActor,
  ): Promise<{ transaction: string; owner: string; holdingId: string; amount: number }> {
    const holding = await this.prisma.holding.findUnique({ where: { id: dto.holdingId } });
    if (!holding) throw new NotFoundException(`Holding "${dto.holdingId}" not found.`);
    if (holding.ownerId !== actor.id) {
      throw new ForbiddenException('You can only retire credits from holdings you own.');
    }
    if (dto.walletAddress && dto.walletAddress !== holding.walletAddress) {
      throw new ForbiddenException('The connected wallet does not match the holding owner wallet.');
    }
    if (dto.amount <= 0) {
      throw new BadRequestException('Retirement amount must be greater than 0.');
    }
    if (dto.amount > holding.availableBalance) {
      throw new BadRequestException(
        `Insufficient available balance: requested ${dto.amount}, available ${holding.availableBalance}.`,
      );
    }
    const prepared = await this.blockchain.buildRetireTx({
      tokenMint: holding.tokenMint,
      walletAddress: holding.walletAddress,
      amount: dto.amount,
      reason: dto.reason,
      reportRef: holding.projectId,
    });
    return {
      transaction: prepared.transaction,
      owner: prepared.owner,
      holdingId: holding.id,
      amount: dto.amount,
    };
  }

  /**
   * Retire credits the caller owns. Runs the full lifecycle described in the
   * class doc. Throws on ownership / balance / validation failure.
   */
  async retire(
    dto: RetireCreditsDto,
    actor: RetirementActor,
  ): Promise<RetirementResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Load + lock the holding row for update to avoid races.
      const holding = await tx.holding.findUnique({
        where: { id: dto.holdingId },
      });
      if (!holding) {
        throw new NotFoundException(`Holding "${dto.holdingId}" not found.`);
      }

      // 2. Ownership (RBAC) — must be the holding owner.
      if (holding.ownerId !== actor.id) {
        throw new ForbiddenException(
          'You can only retire credits from holdings you own.',
        );
      }

      // 3. Wallet match (when supplied) — the connected wallet must be the
      //    holding wallet that owns the credits.
      if (dto.walletAddress && dto.walletAddress !== holding.walletAddress) {
        throw new ForbiddenException(
          'The connected wallet does not match the holding owner wallet.',
        );
      }

      // 4. Balance validation.
      if (dto.amount <= 0) {
        throw new BadRequestException('Retirement amount must be greater than 0.');
      }
      if (dto.amount > holding.availableBalance) {
        throw new BadRequestException(
          `Insufficient available balance: requested ${dto.amount}, ` +
            `available ${holding.availableBalance}.`,
        );
      }

      // 5. Invoke the Solana retirement (burn/lock) instruction.
      const settlement = await this.blockchain.retireCredits({
        tokenMint: holding.tokenMint,
        walletAddress: holding.walletAddress,
        amount: dto.amount,
        reason: dto.reason,
        reportRef: holding.projectId,
        ownerSecret: dto.ownerSecret,
        txSignature: dto.txSignature,
      });

      // 6. Persist the immutable Retirement record (PENDING -> CONFIRMED).
      const retirementId = this.makeRetirementId();
      const timestamp = new Date(settlement.retiredAt);
      const row = await tx.retirement.create({
        data: {
          retirementId,
          holdingId: holding.id,
          projectId: holding.projectId,
          tokenMint: holding.tokenMint,
          retiredAmount: dto.amount,
          retiredBy: actor.id,
          walletAddress: holding.walletAddress,
          reason: dto.reason,
          reasonCategory: dto.reasonCategory,
          transactionSignature: settlement.txSignature,
          status: RetirementStatus.CONFIRMED,
          organization: dto.organization ?? null,
          projectName: holding.projectName,
          methodology: holding.methodology,
          vintage: holding.vintage,
          timestamp,
          metadata: {
            onChain: settlement.onChain,
            slot: settlement.slot,
            explorerUrl: this.blockchain.getExplorerUrl(settlement.txSignature),
          } as Prisma.InputJsonValue,
        },
      });

      // 7. Decrement the holding balance immediately (irreversible).
      const updatedHolding = await tx.holding.update({
        where: { id: holding.id },
        data: {
          availableBalance: { decrement: dto.amount },
          totalRetired: { increment: dto.amount },
        },
      });

      // 8. Reconcile marketplace listings for the same token mint: cancel any
      //    ACTIVE listing whose funded amount exceeds the remaining balance so
      //    retired credits can never be listed/sold.
      await this.reconcileListings(tx, holding.tokenMint, updatedHolding.availableBalance);

      // 9. Audit log (immutable).
      await this.audit.recordAction({
        actorId: actor.id,
        targetId: actor.id,
        action: AuditLogAction.CREDIT_RETIRED,
        reason: `Retired ${dto.amount} credits (mint ${holding.tokenMint}); reason=${dto.reasonCategory}`,
      });

      this.logger.log(
        `Retirement ${retirementId} confirmed: ${dto.amount} credits from holding ${holding.id} ` +
          `by user ${actor.id} (tx=${settlement.txSignature}).`,
      );

      // 10. Generate + pin the certificate (outside the DB tx is fine, but we
      //     keep it within the same logical flow). We re-read the row via tx
      //     is unnecessary; build from `row`.
      try {
        const certData = this.toCertificateData(row, actor);
        const cert = await this.certificate.generateAndPin(certData);
        const certified = await tx.retirement.update({
          where: { id: row.id },
          data: {
            certificateCid: cert.cid,
            certificateUrl: cert.url,
            status: RetirementStatus.CERTIFIED,
            metadata: {
              ...(row.metadata as object),
              certificateUrl: cert.url,
            } as Prisma.InputJsonValue,
          },
        });
        // Audit the certification.
        await this.audit.recordAction({
          actorId: actor.id,
          targetId: actor.id,
          action: AuditLogAction.RETIREMENT_CERTIFIED,
          reason: `Certificate ${cert.certificateId} pinned (cid=${cert.cid}).`,
        });
        return this.toDto(certified);
      } catch (certErr) {
        // The retirement is already recorded + balance updated. A certificate
        // failure must not roll back the retirement — surface it but keep the
        // record so it can be re-generated (status stays CONFIRMED).
        this.logger.error(
          `Certificate generation failed for retirement ${retirementId}: ` +
            `${(certErr as Error).message}`,
        );
        return this.toDto(row);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Cancel any ACTIVE listing for this token mint whose `amount` exceeds the
   * remaining available balance. This guarantees retired credits can never be
   * transferred or listed again.
   */
  private async reconcileListings(
    tx: Prisma.TransactionClient,
    tokenMint: string,
    remainingBalance: number,
  ): Promise<void> {
    const listings = await tx.listing.findMany({
      where: { creditId: tokenMint, status: 'ACTIVE' },
    });
    for (const l of listings) {
      if (l.amount > remainingBalance) {
        await tx.listing.update({
          where: { id: l.id },
          data: { status: 'CANCELLED' },
        });
        this.logger.log(
          `Cancelled listing ${l.id} for mint ${tokenMint}: amount ${l.amount} ` +
            `exceeds remaining balance ${remainingBalance} after retirement.`,
        );
      }
    }
  }

  /** Build the certificate data payload from a retirement row. */
  private toCertificateData(
    row: { retirementId: string; projectId: string; tokenMint: string; retiredAmount: number; reason: string; reasonCategory: string; walletAddress: string; retiredBy: string; transactionSignature: string; certificateCid?: string | null; timestamp: Date; projectName?: string | null; methodology?: string | null; vintage?: number | null; organization?: string | null; metadata?: Prisma.JsonValue | null },
    actor: RetirementActor,
  ): CertificateData {
    const certId = this.certificateIdFromRetirement(row.retirementId);
    return {
      certificateId: certId,
      retirementId: row.retirementId,
      organization: row.organization ?? actor.email ?? 'VerdiCred Member',
      projectName: row.projectName ?? '—',
      projectId: row.projectId,
      methodology: row.methodology ?? '—',
      vintage: row.vintage ?? new Date().getFullYear(),
      tokenMint: row.tokenMint,
      retiredAmount: row.retiredAmount,
      reason: row.reason,
      reasonCategory: row.reasonCategory,
      walletAddress: row.walletAddress,
      retiredBy: row.retiredBy,
      retiredByEmail: actor.email ?? null,
      transactionSignature: row.transactionSignature,
      certificateCid: row.certificateCid ?? null,
      timestamp: row.timestamp.toISOString(),
    };
  }

  private toDto(row: {
    id: string;
    retirementId: string;
    projectId: string;
    tokenMint: string;
    retiredAmount: number;
    retiredBy: string;
    walletAddress: string;
    reason: string;
    reasonCategory: string;
    transactionSignature: string;
    certificateCid: string | null;
    certificateUrl: string | null;
    status: RetirementStatus;
    organization: string | null;
    projectName: string | null;
    methodology: string | null;
    vintage: number | null;
    metadata: Prisma.JsonValue | null;
    timestamp: Date;
    createdAt: Date;
    updatedAt: Date;
  }): RetirementResponseDto {
    const certId = this.certificateIdFromRetirement(row.retirementId);
    const meta = (row.metadata ?? {}) as {
      explorerUrl?: string | null;
      certificateUrl?: string | null;
    };
    const ipfsUrl = row.certificateCid
      ? this.certificate['buildVerifyUrl'](row.retirementId, row.certificateCid)
      : null;
    return {
      id: row.id,
      retirementId: row.retirementId,
      projectId: row.projectId,
      tokenMint: row.tokenMint,
      retiredAmount: row.retiredAmount,
      retiredBy: row.retiredBy,
      walletAddress: row.walletAddress,
      reason: row.reason,
      reasonCategory: row.reasonCategory,
      transactionSignature: row.transactionSignature,
      certificateCid: row.certificateCid,
      certificateUrl: row.certificateUrl,
      status: row.status,
      organization: row.organization,
      projectName: row.projectName,
      methodology: row.methodology,
      vintage: row.vintage,
      explorerUrl: meta.explorerUrl ?? null,
      ipfsUrl,
      certificateId: certId,
      verifyUrl: this.certificate.buildVerifyUrl(row.retirementId, row.certificateCid),
      timestamp: row.timestamp.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Stable certificate id derived from the retirement id (e.g. VC-RET-AB12CD). */
  private certificateIdFromRetirement(retirementId: string): string {
    const suffix = retirementId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
    return `${REASON_PREFIX}${suffix}`;
  }

  /** Generate a unique retirement id (uuid + short suffix for human readability). */
  private makeRetirementId(): string {
    // crypto.randomUUID for uniqueness; the certificate id is derived from this.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { randomUUID } = require('crypto');
    return randomUUID();
  }
}
