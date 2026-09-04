import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BlockchainIndexerService, DecodedEvent } from './indexer.service';
import {
  CreditExplorerResultDto,
  CreditSnapshotDto,
  ExplorerPageDto,
  ExplorerPageQueryDto,
  ExplorerSearchResultDto,
  EvidenceRefDto,
  ExplorerTransactionDto,
  IndexedEventDto,
  IndexedRetirementDto,
  LifecycleEventDto,
  OwnershipTransferDto,
  ProjectExplorerResultDto,
  ProjectSnapshotDto,
  VerificationReportRefDto,
} from './dto/explorer.dto';

/** A BASE58-ish identifier (Solana pubkey). Used to classify a query. */
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * ExplorerService — Stage 7 Public Transparency Explorer read layer.
 *
 * Aggregates the chain-indexed tables (kept current by the
 * {@link BlockchainIndexerService}) with the off-chain Stage 1–6 records
 * (Project / Evidence / VerificationReport / Retirement) into a single, fully
 * transparent view of a carbon credit's lifecycle. All methods are read-only
 * and safe for anonymous callers; the controller marks the routes `@Public()`.
 */
@Injectable()
export class ExplorerService {
  private readonly logger = new Logger(ExplorerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly indexer: BlockchainIndexerService,
  ) {}

  // ---------------------------------------------------------------------------
  // Unified search
  // ---------------------------------------------------------------------------

  /**
   * Resolve a free-form query into either a CREDIT (on-chain mint) or a PROJECT
   * (VerdiCred project uuid). A base58 string is always tried as a credit mint;
   * if no credit snapshot exists we still check whether it is a project id and
   * whether any on-chain event references it. A uuid is matched to a project.
   */
  async search(query: string): Promise<ExplorerSearchResultDto> {
    const q = (query ?? '').trim();
    if (!q) {
      return { kind: 'NONE', query: q, credit: null, project: null };
    }

    const looksLikeMint = BASE58_RE.test(q);

    if (looksLikeMint) {
      const credit = await this.getCredit(q);
      if (credit.found) {
        return { kind: 'CREDIT', query: q, credit, project: null };
      }
    }

    // Try project resolution by id (uuid) or by credit's projectId.
    const project = await this.getProject(q);
    if (project.found) {
      return { kind: 'PROJECT', query: q, project, credit: null };
    }

    // Mint-like string that matched nothing on-chain yet: still resolve the
    // project if any indexed event references it as a projectId.
    if (looksLikeMint) {
      const ev = await this.prisma.indexedEvent.findFirst({
        where: { projectId: q },
        orderBy: { slot: 'desc' },
      });
      if (ev) {
        const project2 = await this.getProject(q);
        if (project2.found) return { kind: 'PROJECT', query: q, project: project2, credit: null };
      }
    }

    return { kind: 'NONE', query: q, credit: null, project: null };
  }

  // ---------------------------------------------------------------------------
  // Credits
  // ---------------------------------------------------------------------------

  async getCredit(creditId: string): Promise<CreditExplorerResultDto> {
    const snapshot = await this.prisma.creditSnapshot.findUnique({ where: { creditId } });
    if (!snapshot) {
      return {
        found: false,
        credit: null,
        lifecycle: [],
        events: [],
        ownershipHistory: [],
        transactions: [],
        retirements: [],
        evidence: [],
        verificationReports: [],
      };
    }

    const [events, transfers, txs, retirements, project] = await Promise.all([
      this.prisma.indexedEvent.findMany({
        where: { mint: creditId },
        orderBy: { slot: 'asc' },
        take: 500,
      }),
      this.prisma.ownershipTransfer.findMany({
        where: { mint: creditId },
        orderBy: { slot: 'asc' },
      }),
      this.prisma.explorerTransaction.findMany({
        where: { mint: creditId },
        orderBy: { slot: 'asc' },
      }),
      this.prisma.indexedRetirement.findMany({ where: { mint: creditId }, orderBy: { slot: 'asc' } }),
      snapshot.projectId
        ? this.prisma.project.findUnique({ where: { id: snapshot.projectId } })
        : null,
    ]);

    const evidence = project
      ? await this.prisma.evidence.findMany({
          where: { projectId: project.id },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const verificationReports = project
      ? await this.prisma.verificationReport.findMany({
          where: { projectId: project.id },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    const lifecycle = this.buildCreditLifecycle({
      snapshot,
      events,
      transfers,
      retirements,
      project,
      evidence,
      verificationReports,
    });

    return {
      found: true,
      credit: this.toCreditDto(snapshot),
      lifecycle,
      events: events.map((e) => this.toEventDto(e)),
      ownershipHistory: transfers.map((t) => this.toTransferDto(t)),
      transactions: txs.map((t) => this.toTxDto(t)),
      retirements: retirements.map((r) => this.toRetirementDto(r)),
      evidence: evidence.map((e) => this.toEvidenceDto(e)),
      verificationReports: verificationReports.map((v) => this.toVerificationDto(v)),
    };
  }

  async listCredits(query: ExplorerPageQueryDto): Promise<ExplorerPageDto<CreditSnapshotDto>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.CreditSnapshotWhereInput = {};
    if (query.q) {
      const s = query.q.trim();
      where.OR = [
        { creditId: { contains: s, mode: 'insensitive' } },
        { projectName: { contains: s, mode: 'insensitive' } },
        { projectId: { contains: s, mode: 'insensitive' } },
        { currentOwner: { contains: s, mode: 'insensitive' } },
        { reportCid: { contains: s, mode: 'insensitive' } },
      ];
    }
    if (query.projectId) where.projectId = query.projectId;

    const orderBy = this.creditOrderBy(query.sortBy ?? 'updatedAt', query.order ?? 'desc');

    const [total, rows] = await Promise.all([
      this.prisma.creditSnapshot.count({ where }),
      this.prisma.creditSnapshot.findMany({ where, orderBy, skip, take: limit }),
    ]);

    return {
      items: rows.map((r) => this.toCreditDto(r)),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ---------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------

  async getProject(projectId: string): Promise<ProjectExplorerResultDto> {
    const snapshot = await this.prisma.projectSnapshot.findUnique({ where: { projectId } });
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!snapshot && !project) {
      return {
        found: false,
        project: null,
        lifecycle: [],
        credits: [],
        evidence: [],
        verificationReports: [],
        retirements: [],
      };
    }

    const credits = await this.prisma.creditSnapshot.findMany({ where: { projectId } });
    const evidence = await this.prisma.evidence.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
    const verificationReports = await this.prisma.verificationReport.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
    const creditIds = credits.map((c) => c.creditId);
    const retirements = creditIds.length
      ? await this.prisma.indexedRetirement.findMany({ where: { mint: { in: creditIds } } })
      : [];

    const lifecycle = this.buildProjectLifecycle({
      project,
      snapshot: snapshot ?? null,
      credits,
      evidence,
      verificationReports,
      retirements,
    });

    return {
      found: true,
      project: snapshot
        ? this.toProjectDto(snapshot)
        : project
        ? this.toProjectFromModel(project)
        : null,
      lifecycle,
      credits: credits.map((c) => this.toCreditDto(c)),
      evidence: evidence.map((e) => this.toEvidenceDto(e)),
      verificationReports: verificationReports.map((v) => this.toVerificationDto(v)),
      retirements: retirements.map((r) => this.toRetirementDto(r)),
    };
  }

  async listProjects(query: ExplorerPageQueryDto): Promise<ExplorerPageDto<ProjectSnapshotDto>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ProjectSnapshotWhereInput = {};
    if (query.q) {
      const s = query.q.trim();
      where.OR = [
        { projectId: { contains: s, mode: 'insensitive' } },
        { projectName: { contains: s, mode: 'insensitive' } },
        { ownerId: { contains: s, mode: 'insensitive' } },
      ];
    }
    if (query.status) where.status = query.status;

    const orderBy = this.projectOrderBy(query.sortBy ?? 'updatedAt', query.order ?? 'desc');

    const [total, rows] = await Promise.all([
      this.prisma.projectSnapshot.count({ where }),
      this.prisma.projectSnapshot.findMany({ where, orderBy, skip, take: limit }),
    ]);

    return {
      items: rows.map((r) => this.toProjectDto(r)),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ---------------------------------------------------------------------------
  // Sub-resources (events / transfers / transactions / retirements)
  // ---------------------------------------------------------------------------

  async listEvents(mint: string | undefined, query: ExplorerPageQueryDto): Promise<ExplorerPageDto<IndexedEventDto>> {
    return this.paged(
      (where, orderBy, skip, take) =>
        this.prisma.indexedEvent.findMany({ where, orderBy, skip, take }),
      (where) => this.prisma.indexedEvent.count({ where }),
      mint ? { mint } : {},
      query,
      (e) => this.toEventDto(e),
      'slot',
    );
  }

  async listTransfers(mint: string | undefined, query: ExplorerPageQueryDto): Promise<ExplorerPageDto<OwnershipTransferDto>> {
    return this.paged(
      (where, orderBy, skip, take) =>
        this.prisma.ownershipTransfer.findMany({ where, orderBy, skip, take }),
      (where) => this.prisma.ownershipTransfer.count({ where }),
      mint ? { mint } : {},
      query,
      (t) => this.toTransferDto(t),
      'slot',
    );
  }

  async listTransactions(mint: string | undefined, query: ExplorerPageQueryDto): Promise<ExplorerPageDto<ExplorerTransactionDto>> {
    return this.paged(
      (where, orderBy, skip, take) =>
        this.prisma.explorerTransaction.findMany({ where, orderBy, skip, take }),
      (where) => this.prisma.explorerTransaction.count({ where }),
      mint ? { mint } : {},
      query,
      (t) => this.toTxDto(t),
      'slot',
    );
  }

  async listRetirements(mint: string | undefined, query: ExplorerPageQueryDto): Promise<ExplorerPageDto<IndexedRetirementDto>> {
    return this.paged(
      (where, orderBy, skip, take) =>
        this.prisma.indexedRetirement.findMany({ where, orderBy, skip, take }),
      (where) => this.prisma.indexedRetirement.count({ where }),
      mint ? { mint } : {},
      query,
      (r) => this.toRetirementDto(r),
      'slot',
    );
  }

  // ---------------------------------------------------------------------------
  // Indexer status + manual resync
  // ---------------------------------------------------------------------------

  async getStatus(): Promise<{
    enabled: boolean;
    running: boolean;
    cluster: string;
    programId: string;
    creditCount: number;
    projectCount: number;
  } & Awaited<ReturnType<BlockchainIndexerService['getStatus']>>> {
    const idx = await this.indexer.getStatus();
    const creditCount = await this.prisma.creditSnapshot.count();
    const projectCount = await this.prisma.projectSnapshot.count();
    return {
      enabled: this.indexer.isEnabled(),
      running: this.indexer.isRunning(),
      cluster: this.indexer.getCluster(),
      programId: this.indexer.getProgramId(),
      creditCount,
      projectCount,
      ...idx,
    };
  }

  async resync(): Promise<{ eventsIndexed: string; txsProcessed: string }> {
    return this.indexer.resync();
  }

  async refresh(): Promise<{ projects: number; credits: number }> {
    return this.indexer.rebuildAllSnapshots();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle builders (visual timeline)
  // ---------------------------------------------------------------------------

  private buildCreditLifecycle(args: {
    snapshot: Prisma.CreditSnapshotGetPayload<true>;
    events: Prisma.IndexedEventGetPayload<true>[];
    transfers: Prisma.OwnershipTransferGetPayload<true>[];
    retirements: Prisma.IndexedRetirementGetPayload<true>[];
    project: Prisma.ProjectGetPayload<true> | null;
    evidence: Prisma.EvidenceGetPayload<true>[];
    verificationReports: Prisma.VerificationReportGetPayload<true>[];
  }): LifecycleEventDto[] {
    const events: LifecycleEventDto[] = [];

    if (args.project) {
      events.push({
        stage: 'PROJECT_REGISTERED',
        title: 'Project registered',
        description: args.project.projectName,
        timestamp: args.project.createdAt.toISOString(),
        refId: args.project.id,
      });
    }
    for (const e of args.evidence) {
      events.push({
        stage: 'EVIDENCE_UPLOADED',
        title: `Evidence uploaded (${e.source})`,
        description: e.cid,
        timestamp: e.createdAt.toISOString(),
        refId: e.id,
        link: e.ipfsUrl ?? `https://ipfs.io/ipfs/${e.cid}`,
      });
    }
    for (const v of args.verificationReports) {
      events.push({
        stage: 'AI_VERIFIED',
        title: `AI verification — ${v.status}`,
        description: `Confidence ${v.confidenceScore}, ${v.verifiedTonnes} tCO₂e`,
        timestamp: v.createdAt.toISOString(),
        refId: v.id,
        link: `https://ipfs.io/ipfs/${v.reportCid}`,
      });
    }
    for (const ev of args.events.filter((e) => e.eventType === 'CREDIT_MINTED')) {
      const p = ev.payload as any;
      events.push({
        stage: 'CREDIT_ISSUED',
        title: 'Credits issued on-chain',
        description: `${p.amount} credits minted (vintage ${p.vintage ?? '?'})`,
        timestamp: ev.createdAt.toISOString(),
        txSignature: ev.signature,
        refId: ev.id,
        link: `https://explorer.solana.com/tx/${ev.signature}?cluster=${this.indexer.getCluster()}`,
      });
    }
    for (const t of args.transfers) {
      events.push({
        stage: 'TRANSFERRED',
        title: 'Ownership transferred',
        description: `${t.amount} credits: ${short(t.fromWallet)} → ${short(t.toWallet)}`,
        timestamp: t.blockTime ? new Date(Number(t.blockTime) * 1000).toISOString() : t.createdAt.toISOString(),
        txSignature: t.signature,
        refId: t.id,
        link: `https://explorer.solana.com/tx/${t.signature}?cluster=${this.indexer.getCluster()}`,
      });
    }
    for (const r of args.retirements) {
      events.push({
        stage: 'RETIRED',
        title: 'Credits retired (burned)',
        description: `${r.amount} credits permanently retired`,
        timestamp: r.blockTime ? new Date(Number(r.blockTime) * 1000).toISOString() : r.createdAt.toISOString(),
        txSignature: r.signature,
        refId: r.id,
        link: `https://explorer.solana.com/tx/${r.signature}?cluster=${this.indexer.getCluster()}`,
      });
    }

    return events.sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));
  }

  private buildProjectLifecycle(args: {
    project: Prisma.ProjectGetPayload<true> | null;
    snapshot: Prisma.ProjectSnapshotGetPayload<true> | null;
    credits: Prisma.CreditSnapshotGetPayload<true>[];
    evidence: Prisma.EvidenceGetPayload<true>[];
    verificationReports: Prisma.VerificationReportGetPayload<true>[];
    retirements: Prisma.IndexedRetirementGetPayload<true>[];
  }): LifecycleEventDto[] {
    const events: LifecycleEventDto[] = [];
    if (args.project) {
      events.push({
        stage: 'PROJECT_REGISTERED',
        title: 'Project registered',
        description: args.project.projectName,
        timestamp: args.project.createdAt.toISOString(),
        refId: args.project.id,
      });
    }
    for (const e of args.evidence) {
      events.push({
        stage: 'EVIDENCE_UPLOADED',
        title: `Evidence uploaded (${e.source})`,
        description: e.cid,
        timestamp: e.createdAt.toISOString(),
        refId: e.id,
        link: e.ipfsUrl ?? `https://ipfs.io/ipfs/${e.cid}`,
      });
    }
    for (const v of args.verificationReports) {
      events.push({
        stage: 'AI_VERIFIED',
        title: `AI verification — ${v.status}`,
        description: `Confidence ${v.confidenceScore}, ${v.verifiedTonnes} tCO₂e`,
        timestamp: v.createdAt.toISOString(),
        refId: v.id,
        link: `https://ipfs.io/ipfs/${v.reportCid}`,
      });
    }
    for (const c of args.credits) {
      const firstMint = c.lastEventAt ?? c.updatedAt;
      events.push({
        stage: 'CREDIT_ISSUED',
        title: `Credits issued (${c.totalMinted} tCO₂e)`,
        description: `Mint ${short(c.creditId)} — ${c.totalRetired} retired`,
        timestamp: firstMint?.toISOString?.() ?? undefined,
        refId: c.creditId,
        link: `/explorer/credits/${c.creditId}`,
      });
    }
    for (const r of args.retirements) {
      events.push({
        stage: 'RETIRED',
        title: 'Credits retired (burned)',
        description: `${r.amount} credits permanently retired`,
        timestamp: r.blockTime ? new Date(Number(r.blockTime) * 1000).toISOString() : r.createdAt.toISOString(),
        txSignature: r.signature,
        refId: r.id,
        link: `https://explorer.solana.com/tx/${r.signature}?cluster=${this.indexer.getCluster()}`,
      });
    }
    return events.sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));
  }

  // ---------------------------------------------------------------------------
  // DTO mappers
  // ---------------------------------------------------------------------------

  private toCreditDto(r: Prisma.CreditSnapshotGetPayload<true>): CreditSnapshotDto {
    return {
      creditId: r.creditId,
      projectId: r.projectId,
      projectName: r.projectName,
      projectType: r.projectType,
      methodology: r.methodology,
      vintage: r.vintage,
      totalMinted: r.totalMinted,
      totalRetired: r.totalRetired,
      circulatingSupply: r.circulatingSupply,
      currentOwner: r.currentOwner,
      reportStatus: r.reportStatus,
      reportCid: r.reportCid,
      evidenceCids: r.evidenceCids,
      transferCount: r.transferCount,
      fullyRetired: r.fullyRetired,
      lastSignature: r.lastSignature,
      lastSlot: r.lastSlot?.toString() ?? null,
      lastEventAt: r.lastEventAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private toProjectDto(r: Prisma.ProjectSnapshotGetPayload<true>): ProjectSnapshotDto {
    return {
      projectId: r.projectId,
      ownerId: r.ownerId,
      projectName: r.projectName,
      projectType: r.projectType,
      methodology: r.methodology,
      expectedAnnualTonnes: r.expectedAnnualTonnes,
      status: r.status,
      creditIds: r.creditIds,
      totalMinted: r.totalMinted,
      totalRetired: r.totalRetired,
      circulatingSupply: r.circulatingSupply,
      evidenceCount: r.evidenceCount,
      verificationCount: r.verificationCount,
      retirementCount: r.retirementCount,
      lastSignature: r.lastSignature,
      lastSlot: r.lastSlot?.toString() ?? null,
      lastEventAt: r.lastEventAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private toProjectFromModel(p: Prisma.ProjectGetPayload<true>): ProjectSnapshotDto {
    return {
      projectId: p.id,
      ownerId: p.ownerId,
      projectName: p.projectName,
      projectType: p.projectType,
      methodology: p.methodology,
      expectedAnnualTonnes: p.expectedAnnualTonnes,
      status: p.status,
      creditIds: [],
      totalMinted: 0,
      totalRetired: 0,
      circulatingSupply: 0,
      evidenceCount: 0,
      verificationCount: 0,
      retirementCount: 0,
      lastSignature: null,
      lastSlot: null,
      lastEventAt: null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  private toEventDto(e: Prisma.IndexedEventGetPayload<true>): IndexedEventDto {
    return {
      id: e.id,
      eventType: e.eventType,
      signature: e.signature,
      eventIndex: e.eventIndex,
      slot: e.slot.toString(),
      blockTime: e.blockTime?.toString() ?? null,
      programId: e.programId,
      mint: e.mint,
      projectId: e.projectId,
      accounts: (e.accounts as Record<string, string>) ?? null,
      payload: (e.payload as Record<string, unknown>) ?? {},
      createdAt: e.createdAt.toISOString(),
    };
  }

  private toTransferDto(t: Prisma.OwnershipTransferGetPayload<true>): OwnershipTransferDto {
    return {
      id: t.id,
      mint: t.mint,
      fromWallet: t.fromWallet,
      toWallet: t.toWallet,
      amount: t.amount,
      signature: t.signature,
      slot: t.slot.toString(),
      blockTime: t.blockTime?.toString() ?? null,
      seq: t.seq,
      createdAt: t.createdAt.toISOString(),
    };
  }

  private toTxDto(t: Prisma.ExplorerTransactionGetPayload<true>): ExplorerTransactionDto {
    return {
      signature: t.signature,
      mint: t.mint,
      kind: t.kind,
      summary: t.summary,
      signer: t.signer,
      slot: t.slot.toString(),
      blockTime: t.blockTime?.toString() ?? null,
      instructionCount: t.instructionCount,
      success: t.success,
      createdAt: t.createdAt.toISOString(),
    };
  }

  private toRetirementDto(r: Prisma.IndexedRetirementGetPayload<true>): IndexedRetirementDto {
    return {
      id: r.id,
      retirementRecord: r.retirementRecord,
      owner: r.owner,
      mint: r.mint,
      batch: r.batch,
      amount: r.amount,
      reason: r.reason,
      reportRef: r.reportRef,
      signature: r.signature,
      slot: r.slot.toString(),
      blockTime: r.blockTime?.toString() ?? null,
      totalRetired: r.totalRetired,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private toEvidenceDto(e: Prisma.EvidenceGetPayload<true>): EvidenceRefDto {
    return {
      id: e.id,
      source: e.source,
      status: e.status,
      cid: e.cid,
      ipfsUrl: e.ipfsUrl ?? `https://ipfs.io/ipfs/${e.cid}`,
      latitude: e.latitude,
      longitude: e.longitude,
      createdAt: e.createdAt.toISOString(),
    };
  }

  private toVerificationDto(v: Prisma.VerificationReportGetPayload<true>): VerificationReportRefDto {
    return {
      id: v.id,
      verifiedTonnes: v.verifiedTonnes,
      confidenceScore: v.confidenceScore,
      status: v.status,
      reportCid: v.reportCid,
      reportUrl: v.reportUrl,
      ndviScore: v.ndviScore,
      createdAt: v.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Generic paged helper
  // ---------------------------------------------------------------------------

  private async paged<TModel, TDto, TWhere extends Prisma.IndexedEventWhereInput | Prisma.OwnershipTransferWhereInput | Prisma.ExplorerTransactionWhereInput | Prisma.IndexedRetirementWhereInput>(
    find: (where: TWhere, orderBy: any, skip: number, take: number) => Promise<TModel[]>,
    count: (where: TWhere) => Promise<number>,
    baseWhere: TWhere,
    query: ExplorerPageQueryDto,
    map: (m: TModel) => TDto,
    defaultSort: string,
  ): Promise<ExplorerPageDto<TDto>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: TWhere = { ...baseWhere } as TWhere;
    if (query.q) {
      const s = query.q.trim();
      (where as any).OR = [
        { signature: { contains: s, mode: 'insensitive' } },
        { mint: { contains: s, mode: 'insensitive' } },
        { projectId: { contains: s, mode: 'insensitive' } },
        { payload: { path: ['$'], string_contains: s } } as any,
      ];
    }

    // All event-like tables share slot/createdAt sortable fields.
    const orderBy: any = {};
    const sortBy = query.sortBy === 'createdAt' ? 'createdAt' : query.sortBy === 'slot' ? 'slot' : defaultSort;
    orderBy[sortBy] = query.order ?? 'desc';

    const [total, rows] = await Promise.all([
      count(where),
      find(where, orderBy, skip, limit),
    ]);

    return {
      items: rows.map(map),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private creditOrderBy(sortBy: string, order: 'asc' | 'desc') {
    switch (sortBy) {
      case 'totalMinted':
      case 'totalRetired':
      case 'projectName':
      case 'mint':
      case 'slot':
        return { [sortBy]: order } as Prisma.CreditSnapshotOrderByWithRelationInput;
      case 'createdAt':
        return { createdAt: order } as Prisma.CreditSnapshotOrderByWithRelationInput;
      default:
        return { updatedAt: order } as Prisma.CreditSnapshotOrderByWithRelationInput;
    }
  }

  private projectOrderBy(sortBy: string, order: 'asc' | 'desc') {
    switch (sortBy) {
      case 'totalMinted':
      case 'totalRetired':
      case 'projectName':
      case 'slot':
        return { [sortBy]: order } as Prisma.ProjectSnapshotOrderByWithRelationInput;
      case 'createdAt':
        return { createdAt: order } as Prisma.ProjectSnapshotOrderByWithRelationInput;
      default:
        return { updatedAt: order } as Prisma.ProjectSnapshotOrderByWithRelationInput;
    }
  }
}

function short(s: string, n = 6): string {
  return s.length > n * 2 ? `${s.slice(0, n)}…${s.slice(-n)}` : s;
}
