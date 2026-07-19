import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { VerificationService } from '../verification/verification.service';
import { VerificationReportResponse } from '../verification/verification.service';
import {
  SolanaIssuanceService,
  IssueResult,
  CreditBatchView,
  RetirementView,
} from './solana-issuance.service';
import { SolanaConfigService } from './solana-config.service';
import {
  EligibleResponseDto,
  IssueCreditDto,
  IssueCreditResponseDto,
} from './dto/carbon-credits.dto';
import {
  VERIFIED_STATUS,
  Stage3ToOnchainAdapter,
} from './adapters/stage3-to-onchain.adapter';
import { PrismaService } from '../prisma/prisma.service';

/**
 * CarbonCreditsService — Stage 4 orchestrator.
 *
 * Bridges Stage 3 (off-chain verification) to on-chain credit issuance:
 *  - `eligible` reads the latest Stage 3 report and reports whether it can be
 *    minted (status == VERIFIED) plus the 1:1 amount.
 *  - `issue` runs the automated 1:1 bridge: latest VERIFIED report →
 *    floor(verifiedTonnes) credits → oracle-signed `mintCredit` tx → persisted
 *    issuance ledger row AND a Holding record for the recipient (developer).
 *  - `transfer` / `retire` build owner-signed-ready transactions.
 *  - `getBatches` / `getRetirements` read on-chain state for the audit view.
 */
@Injectable()
export class CarbonCreditsService {
  private readonly logger = new Logger(CarbonCreditsService.name);

  constructor(
    private readonly verification: VerificationService,
    private readonly solana: SolanaIssuanceService,
    private readonly solanaConfig: SolanaConfigService,
    private readonly adapter: Stage3ToOnchainAdapter,
    private readonly prisma: PrismaService,
  ) {}

  /** Check whether a project's latest verification report is eligible for 1:1 issuance. */
  async eligible(projectId: string): Promise<EligibleResponseDto> {
    let report: VerificationReportResponse;
    try {
      report = await this.verification.latestForProject(projectId);
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw new NotFoundException(`No verification report found for project "${projectId}".`);
      }
      throw e;
    }

    const eligible = report.status === VERIFIED_STATUS;
    const amount = Math.floor(report.verifiedTonnes);
    const evidenceCids =
      (report.metadata as { evidence?: { cid: string }[] } | null)?.evidence
        ?.map((e) => e.cid)
        .filter((c): c is string => typeof c === 'string' && c.length > 0) ?? [];

    return {
      eligible,
      projectId: report.projectId,
      verifiedTonnes: report.verifiedTonnes,
      reportCid: report.reportCid,
      evidenceCid: evidenceCids[0] ?? null,
      evidenceCids,
      methodology: (report.metadata as { methodology?: string } | null)?.methodology ?? '',
      status: report.status,
      confidenceScore: report.confidenceScore,
      message: eligible
        ? `Latest VERIFIED report is ready for 1:1 issuance of ${amount} credits.`
        : 'Latest report is not VERIFIED; issuance blocked.',
    };
  }

  /**
   * Issue 1 credit per verified tonne for the project's latest VERIFIED report.
   * Only AUDITOR/ADMIN may trigger issuance (mirrors the Stage 3 verify gate).
   */
  async issue(dto: IssueCreditDto, actor: { id: string; role: Role }): Promise<IssueCreditResponseDto> {
    if (actor.role !== Role.AUDITOR && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Only AUDITOR or ADMIN may issue carbon credits.');
    }

    const report = await this.verification.latestForProject(dto.projectId);
    if (report.status !== VERIFIED_STATUS) {
      throw new BadRequestException(
        `Project ${dto.projectId} has no VERIFIED report (status=${report.status}); issuance blocked.`,
      );
    }

    // The recipient is a wallet address; map it to a VerdiCred user (if any).
    const ownerUser = await this.prisma.user.findFirst({ where: { walletAddress: dto.recipient } });
    if (!ownerUser) {
      throw new BadRequestException(
        `Recipient wallet ${dto.recipient} is not linked to any VerdiCred user. ` +
          `Connect that wallet to a VerdiCred account first.`,
      );
    }

    const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
    const projectType: string = project?.projectType ?? 'REFORESTATION';

    const result = await this.solana.issue(report, dto.recipient, dto.vintage);
    const vintage = this.adapter.toMintArgs(report, dto.vintage).vintage;

    // Create / update the off-chain Holding so the developer has a canonical
    // ownership record that mirrors the on-chain ATA balance.
    await this.upsertHolding({
      ownerId: ownerUser.id,
      walletAddress: dto.recipient,
      projectId: dto.projectId,
      tokenMint: result.mint,
      projectName: report.projectName,
      projectType,
      methodology: (report.metadata?.methodology as string) ?? '',
      vintage,
      amount: result.amount,
    });

    this.logger.log(
      `Issued ${result.amount} credits for project ${dto.projectId} by ${actor.id} (tx=${result.txSignature})`,
    );

    return {
      txSignature: result.txSignature,
      batchPda: result.batchPda,
      mint: result.mint,
      amount: result.amount,
      projectId: dto.projectId,
      vintage,
    };
  }

  /** Create or top-up a Holding for a developer after a real on-chain mint. */
  private async upsertHolding(input: {
    ownerId: string;
    walletAddress: string;
    projectId: string;
    tokenMint: string;
    projectName: string;
    projectType: string;
    methodology: string;
    vintage: number;
    amount: number;
  }) {
    // One holding per (user, mint). Top up the available balance on re-issue.
    const existing = await this.prisma.holding.findUnique({
      where: { ownerId_tokenMint: { ownerId: input.ownerId, tokenMint: input.tokenMint } },
    });
    if (existing) {
      return this.prisma.holding.update({
        where: { id: existing.id },
        data: { availableBalance: { increment: input.amount } },
      });
    }
    return this.prisma.holding.create({
      data: {
        ownerId: input.ownerId,
        walletAddress: input.walletAddress,
        projectId: input.projectId,
        tokenMint: input.tokenMint,
        projectName: input.projectName,
        projectType: input.projectType as any,
        methodology: input.methodology,
        vintage: input.vintage,
        availableBalance: input.amount,
      },
    });
  }

  /** Build an owner-signed-ready transfer transaction. */
  async transfer(mint: string, from: string, to: string, amount: number) {
    return this.solana.buildTransferTx(mint, from, to, amount);
  }

  /** Build an owner-signed-ready retire transaction. */
  async retire(mint: string, owner: string, amount: number, reason: string, reportRef: string) {
    return this.solana.buildRetireTx(mint, owner, amount, reason, reportRef);
  }

  /** Read all CreditBatch PDAs for a mint (on-chain audit). */
  async getBatches(mint: string): Promise<CreditBatchView[]> {
    return this.solana.getBatches(mint);
  }

  /** Read all RetirementRecord PDAs for a mint (retirement ledger). */
  async getRetirements(mint: string): Promise<RetirementView[]> {
    return this.solana.getRetirements(mint);
  }
}
