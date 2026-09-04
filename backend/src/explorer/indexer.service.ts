import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * A single decoded on-chain event, normalized into a chain-agnostic shape that
 * the ingestion pipeline can persist. Decoupling this from the Solana/Anchor
 * decoding step keeps the persistence + snapshot logic pure and unit-testable
 * (tests feed synthetic `DecodedEvent`s without ever touching RPC or Anchor).
 */
export interface DecodedEvent {
  eventType:
    | 'CREDIT_MINTED'
    | 'CREDIT_TRANSFERRED'
    | 'CREDIT_RETIRED'
    | 'ORACLE_AUTHORITY_CHANGED';
  signature: string;
  slot: bigint;
  blockTime: bigint | null;
  programId: string;
  payload: Record<string, unknown>;
  accounts: Record<string, string> | null;
}

const ROUTE_POLL_MS = 12_000;
const BACKFILL_BATCH = 1000;
const FORWARD_BATCH = 500;
const CURSOR_ID = 'singleton';

/**
 * BlockchainIndexerService — Stage 7 Solana indexer.
 *
 * Continuously synchronizes the VerdiCred Anchor program's on-chain state into
 * Supabase/PostgreSQL so the Public Transparency Explorer always reflects the
 * chain. It:
 *
 *  - Polls `getSignaturesForAddress(programId)` for every transaction that
 *    invokes the program (historical backfill + continuous catch-up after
 *    downtime). A websocket log subscription is layered on top for low latency.
 *  - Decodes Anchor `#[event]` logs (CreditMinted / CreditTransferred /
 *    CreditRetired / OracleAuthorityChanged) and persists them as idempotent
 *    `IndexedEvent` rows keyed by (signature, eventIndex).
 *  - Derives `OwnershipTransfer`, `IndexedRetirement` and `ExplorerTransaction`
 *    rows, and maintains denormalized `CreditSnapshot` / `ProjectSnapshot`
 *    rollups so public reads never need to join the whole schema or hit the
 *    chain.
 *
 * Idempotency & resync: every write uses an upsert keyed on a natural unique
 * constraint, so reprocessing the same transaction is a no-op. The `IndexerCursor`
 * records the last processed signature/slot; after downtime the next poll picks
 * up exactly where it left off. Re-running the indexer is always safe.
 *
 * The Solana/Anchor decoding path uses a dynamic import so this module never
 * loads Anchor at import time (keeps unit tests free of ESM transform issues);
 * the pure ingestion logic can be exercised directly via `ingestEvents`.
 */
@Injectable()
export class BlockchainIndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BlockchainIndexerService.name);

  private readonly programId: string;
  private readonly rpcUrl: string;
  private readonly cluster: string;
  private readonly enabled: boolean;

  // Lazy Solana connection (constructed once on first real use).
  private connection: any = null;
  // Lazy Anchor event coder (constructed once on first real decode).
  private eventCoder: any = null;

  private pollTimer: NodeJS.Timeout | null = null;
  private logSubscription: any = null;
  private running = false;
  private processing = false;
  // Guards against a poll starting before the previous one finished.
  private inFlight = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.programId = this.config.get<string>('SOLANA_PROGRAM_ID') ?? '';
    this.cluster = this.config.get<string>('SOLANA_CLUSTER', 'devnet');
    this.rpcUrl =
      this.config.get<string>('SOLANA_RPC_URL') ||
      (this.cluster === 'mainnet-beta'
        ? 'https://api.mainnet-beta.solana.com'
        : this.cluster === 'testnet'
        ? 'https://api.testnet.solana.com'
        : 'https://api.devnet.solana.com');
    // Indexer is on by default; disabled only with explicit opt-out.
    this.enabled = this.config.get<string>('EXPLORER_INDEXER_ENABLED') !== 'false';
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.log('Indexer disabled (EXPLORER_INDEXER_ENABLED=false).');
      return;
    }
    if (!this.programId) {
      this.logger.warn('SOLANA_PROGRAM_ID not set — indexer will not start.');
      return;
    }
    // In test mode we never spin up the poll loop / websocket (no network).
    if (process.env.NODE_ENV === 'test') {
      this.logger.log('Indexer loop suppressed in NODE_ENV=test.');
      this.running = false;
      return;
    }
    this.running = true;
    // Kick off an initial backfill, then begin continuous polling.
    void this.safeRun(() => this.backfill()).then(() => {
      this.startPolling();
      this.startLogSubscription();
    });
  }

  async onModuleDestroy() {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    try {
      if (this.logSubscription && typeof this.logSubscription.removeAllListeners === 'function') {
        this.logSubscription.removeAllListeners('logs');
      }
    } catch {
      /* noop */
    }
  }

  /** Begin the continuous forward poll loop. */
  private startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      void this.safeRun(() => this.pollForward());
    }, ROUTE_POLL_MS);
    // Don't keep the event loop alive solely for polling.
    if (typeof this.pollTimer.unref === 'function') this.pollTimer.unref();
  }

  /** Best-effort websocket subscription for low-latency event delivery. */
  private async startLogSubscription() {
    try {
      const conn = this.getServerConnection();
      const PublicKey = this.getPublicKeyClass();
      const pk = new PublicKey(this.programId);
      this.logSubscription = conn.onLogs(
        pk,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (logs: any) => {
          void this.safeRun(async () => {
            const sigs = Array.isArray(logs?.signatures) ? logs.signatures : [];
            for (const s of sigs) {
              await this.processSignature(String(s));
            }
          });
        },
        'confirmed',
      );
      this.logger.log('Websocket log subscription active.');
    } catch (err) {
      // Polling still covers everything; the subscription is an enhancement.
      this.logger.warn(`Log subscription unavailable: ${(err as Error).message}`);
    }
  }

  /** Run `fn` safely, never letting a throw stop the loop. */
  private async safeRun(fn: () => Promise<unknown>): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      await fn();
    } catch (err) {
      this.logger.error(`Indexer error: ${(err as Error).message}`);
    } finally {
      this.inFlight = false;
    }
  }

  /** Whether the indexer was constructed enabled (no opt-out). */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Whether the poll loop is currently active. */
  isRunning(): boolean {
    return this.running;
  }

  /** Solana cluster name (devnet / mainnet-beta / testnet). */
  getCluster(): string {
    return this.cluster;
  }

  /** The VerdiCred program id being indexed. */
  getProgramId(): string {
    return this.programId;
  }

  // ---------------------------------------------------------------------------
  // Backfill (historical) + forward catch-up
  // ---------------------------------------------------------------------------

  /**
   * Historical backfill: walk from the current chain tip backwards to genesis
   * (or until hitting an already-indexed signature, which makes re-runs after
   * downtime cheap). On first ever run `lastSignature` is null so we start at
   * the tip; after backfill completes, forward polling resumes from there.
   */
  async backfill(): Promise<{ processed: number }> {
    if (this.processing) return { processed: 0 };
    this.processing = true;
    let processed = 0;
    try {
      await this.ensureCursor();
      const cursor = await this.getCursor();
      let before: string | undefined = cursor?.lastSignature ?? undefined;
      let reachedEnd = false;
      await this.setBackfilling(true);
      while (this.running && !reachedEnd) {
        const sigs = await this.getServerConnection().getSignaturesForAddress(
          this.getProgramKey(),
          { before, limit: BACKFILL_BATCH },
          'confirmed',
        );
        if (!sigs || sigs.length === 0) {
          reachedEnd = true;
          break;
        }
        for (const s of sigs) {
          const already = await this.isSignatureIndexed(s.signature);
          if (already) {
            // We've reached previously-indexed territory — stop walking back.
            reachedEnd = true;
            break;
          }
          await this.processSignature(s.signature, BigInt(s.slot), this.toBigInt(s.blockTime));
          processed++;
        }
        before = sigs[sigs.length - 1].signature;
      }
      await this.touchBackfill();
    } finally {
      await this.setBackfilling(false);
      this.processing = false;
    }
    this.logger.log(`Backfill complete: processed ${processed} new transactions.`);
    return { processed };
  }

  /**
   * Forward catch-up: fetch transactions strictly newer than the last processed
   * signature (handles downtime — after a gap many new txs appear and each poll
   * advances the cursor until caught up, then keeps polling for live events).
   */
  async pollForward(): Promise<{ processed: number }> {
    if (!this.running || this.processing) return { processed: 0 };
    const cursor = await this.getCursor();
    if (!cursor?.lastSignature) {
      // No baseline yet; let backfill establish it.
      return { processed: 0 };
    }
    let processed = 0;
    const sigs = await this.getServerConnection().getSignaturesForAddress(
      this.getProgramKey(),
      { until: cursor.lastSignature, limit: FORWARD_BATCH },
      'confirmed',
    );
    if (sigs && sigs.length > 0) {
      for (const s of sigs) {
        const already = await this.isSignatureIndexed(s.signature);
        if (already) continue;
        await this.processSignature(s.signature, BigInt(s.slot), this.toBigInt(s.blockTime));
        processed++;
      }
    }
    return { processed };
  }

  /** Manually trigger a full resynchronization (public/admin action). */
  async resync(): Promise<{ eventsIndexed: string; txsProcessed: string }> {
    await this.backfill();
    return this.getStatus();
  }

  // ---------------------------------------------------------------------------
  // Per-transaction processing
  // ---------------------------------------------------------------------------

  /**
   * Fetch a parsed transaction, decode its Anchor events, and ingest them.
   * `slot`/`blockTime` are accepted so callers that already have the
   * signature metadata (from getSignaturesForAddress) avoid a second RPC.
   */
  async processSignature(
    signature: string,
    slot?: bigint,
    blockTime?: bigint | null,
  ): Promise<void> {
    const sig = await this.prisma.explorerTransaction.findUnique({ where: { signature } });
    if (sig) return; // idempotent

    const conn = this.getServerConnection();
    const parsed = await conn.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    const resolvedSlot = slot ?? BigInt(parsed?.slot ?? 0);
    const resolvedBlockTime =
      blockTime !== undefined ? blockTime : this.toBigInt(parsed?.blockTime);
    const logs: string[] = parsed?.meta?.logMessages ?? [];
    const success = !parsed?.meta?.err;

    const events = await this.decodeLogs(logs);
    // Enrich each event with the tx's slot/blockTime/programId.
    const decoded: DecodedEvent[] = events.map((e, i) => ({
      eventType: e.eventType,
      signature,
      slot: resolvedSlot,
      blockTime: resolvedBlockTime,
      programId: this.programId,
      payload: e.payload,
      accounts: e.accounts,
    }));

    await this.ingestEvents(decoded, { signature, slot: resolvedSlot, blockTime: resolvedBlockTime, success, logs });
  }

  // ---------------------------------------------------------------------------
  // Pure ingestion pipeline (unit-testable without any chain/RPC)
  // ---------------------------------------------------------------------------

  /**
   * Persist a batch of decoded events for one transaction atomically enough for
   * idempotency, then recompute the affected credit/project snapshots.
   *
   * Idempotent: every write targets a natural unique key, so reprocessing the
   * same transaction is a no-op. Safe to call repeatedly after downtime.
   */
  async ingestEvents(
    events: DecodedEvent[],
    meta?: {
      signature: string;
      slot: bigint;
      blockTime: bigint | null;
      success: boolean;
      logs?: string[];
    },
  ): Promise<{ events: number; mints: string[]; projects: string[] }> {
    const mints = new Set<string>();
    const projects = new Set<string>();
    let txKind = 'OTHER';
    const summaries: string[] = [];

    // 1) IndexedEvent rows (keyed by signature + eventIndex → idempotent).
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      await this.prisma.indexedEvent.upsert({
        where: { signature_eventIndex: { signature: e.signature, eventIndex: i } },
        create: {
          eventType: e.eventType,
          signature: e.signature,
          eventIndex: i,
          slot: e.slot,
          blockTime: e.blockTime,
          programId: e.programId,
          mint: strVal(e.payload.mint ?? e.payload.mintAddress),
          projectId: strVal(e.payload.projectId ?? e.payload.project_id),
          accounts: (e.accounts ?? null) as Prisma.InputJsonValue,
          payload: e.payload as Prisma.InputJsonValue,
        },
        update: {
          payload: e.payload as Prisma.InputJsonValue,
          accounts: (e.accounts ?? null) as Prisma.InputJsonValue,
        },
      });

      if (e.payload.mint) mints.add(String(e.payload.mint));
      if (e.payload.projectId ?? e.payload.project_id) {
        projects.add(String(e.payload.projectId ?? e.payload.project_id));
      }

      switch (e.eventType) {
        case 'CREDIT_MINTED': {
          txKind = 'MINT';
          mints.add(String(e.payload.mint));
          projects.add(String(e.payload.projectId ?? e.payload.project_id));
          summaries.push(
            `Mint ${e.payload.amount} credits (project ${e.payload.projectId ?? e.payload.project_id})`,
          );
          break;
        }
        case 'CREDIT_TRANSFERRED': {
          txKind = 'TRANSFER';
          mints.add(String(e.payload.mint));
          // OwnershipTransfer (keyed by signature + seq → idempotent).
          await this.prisma.ownershipTransfer.upsert({
            where: { signature_seq: { signature: e.signature, seq: i } },
            create: {
              mint: String(e.payload.mint),
              fromWallet: String(e.payload.from ?? ''),
              toWallet: String(e.payload.to ?? ''),
              amount: Number(e.payload.amount ?? 0),
              signature: e.signature,
              slot: e.slot,
              blockTime: e.blockTime,
              seq: i,
            },
            update: {},
          });
          summaries.push(
            `Transfer ${e.payload.amount} credits ${e.payload.from} → ${e.payload.to}`,
          );
          break;
        }
        case 'CREDIT_RETIRED': {
          txKind = 'RETIRE';
          mints.add(String(e.payload.mint));
          await this.prisma.indexedRetirement.upsert({
            where: { retirementRecord: String(e.payload.retirementRecord ?? e.payload.retirement_record) },
            create: {
              retirementRecord: String(e.payload.retirementRecord ?? e.payload.retirement_record),
              owner: String(e.payload.owner ?? ''),
              mint: String(e.payload.mint),
              batch: String(e.payload.batch ?? ''),
              amount: Number(e.payload.amount ?? 0),
              reason: e.payload.reason ? String(e.payload.reason) : null,
              reportRef: e.payload.reportRef ?? e.payload.report_ref ? String(e.payload.reportRef ?? e.payload.report_ref) : null,
              signature: e.signature,
              slot: e.slot,
              blockTime: e.blockTime,
              totalRetired: Number(e.payload.totalRetired ?? e.payload.total_retired ?? 0),
            },
            update: {},
          });
          summaries.push(`Retire ${e.payload.amount} credits`);
          break;
        }
        case 'ORACLE_AUTHORITY_CHANGED': {
          txKind = 'AUTHORITY';
          summaries.push(
            `Oracle authority ${e.payload.oldAuthority ?? e.payload.old_authority} → ${e.payload.newAuthority ?? e.payload.new_authority}`,
          );
          break;
        }
      }
    }

    // 2) ExplorerTransaction row (keyed by signature → idempotent).
    if (meta) {
      await this.prisma.explorerTransaction.upsert({
        where: { signature: meta.signature },
        create: {
          signature: meta.signature,
          mint: mints.size ? Array.from(mints)[0] : null,
          kind: txKind,
          summary: summaries.join('; ').slice(0, 500) || null,
          slot: meta.slot,
          blockTime: meta.blockTime,
          instructionCount: meta.logs?.length ?? 0,
          success: meta.success,
        },
        update: {
          kind: txKind,
          summary: summaries.join('; ').slice(0, 500) || undefined,
        },
      });
    }

    // 3) Recompute affected snapshots so public reads stay fresh.
    // Retirement events do not carry a projectId, so derive the affected
    // projects from the credit snapshots we just updated (keyed by mint).
    for (const mint of mints) {
      try {
        await this.rebuildCreditSnapshot(mint);
        const cs = await this.prisma.creditSnapshot.findUnique({
          where: { creditId: mint },
          select: { projectId: true },
        });
        if (cs?.projectId) projects.add(cs.projectId);
      } catch (err) {
        this.logger.warn(`Snapshot rebuild failed for mint ${mint}: ${(err as Error).message}`);
      }
    }
    for (const projectId of projects) {
      try {
        await this.rebuildProjectSnapshot(projectId);
      } catch (err) {
        this.logger.warn(`Snapshot rebuild failed for project ${projectId}: ${(err as Error).message}`);
      }
    }

    // 4) Advance the cursor.
    await this.advanceCursor(meta?.signature, meta?.slot, events.length, meta ? 1 : 0);

    return { events: events.length, mints: Array.from(mints), projects: Array.from(projects) };
  }

  // ---------------------------------------------------------------------------
  // Snapshot rebuilds (kept consistent with on-chain state)
  // ---------------------------------------------------------------------------

  /** Recompute a credit's denormalized lifecycle snapshot from indexed events. */
  async rebuildCreditSnapshot(mint: string): Promise<void> {
    const mintedEvents = await this.prisma.indexedEvent.findMany({
      where: { eventType: 'CREDIT_MINTED', mint },
      orderBy: { slot: 'desc' },
    });
    const retiredEvents = await this.prisma.indexedEvent.findMany({
      where: { eventType: 'CREDIT_RETIRED', mint },
    });
    const transfers = await this.prisma.ownershipTransfer.findMany({
      where: { mint },
      orderBy: { slot: 'desc' },
    });

    const totalMinted = mintedEvents.reduce(
      (sum, e) => sum + Number((e.payload as any).amount ?? 0),
      0,
    );
    const totalRetired = retiredEvents.reduce(
      (sum, e) => sum + Number((e.payload as any).amount ?? 0),
      0,
    );
    const circulating = Math.max(0, totalMinted - totalRetired);

    const latest = mintedEvents[0];
    const latestPayload = (latest?.payload as any) ?? {};
    const latestTransfer = transfers[0];
    const latestEvent = await this.prisma.indexedEvent.findFirst({
      where: { mint },
      orderBy: { slot: 'desc' },
    });

    const evidenceCids: string[] = Array.isArray(latestPayload.evidenceCids)
      ? latestPayload.evidenceCids.map(String)
      : Array.isArray(latestPayload.evidence_cids)
      ? latestPayload.evidence_cids.map(String)
      : [];

    await this.prisma.creditSnapshot.upsert({
      where: { creditId: mint },
      create: {
        creditId: mint,
        projectId: latestPayload.projectId ?? latestPayload.project_id ?? null,
        projectName: latestPayload.projectName ?? null,
        projectType: latestPayload.projectType ?? null,
        methodology: latestPayload.methodology ?? null,
        vintage: latestPayload.vintage ? Number(latestPayload.vintage) : null,
        totalMinted,
        totalRetired,
        circulatingSupply: circulating,
        currentOwner: latestTransfer ? latestTransfer.toWallet : (latestPayload.recipient ?? null),
        reportStatus: serializeStatus(latestPayload.reportStatus ?? latestPayload.report_status),
        reportCid: latestPayload.reportCid ?? latestPayload.report_cid ?? null,
        evidenceCids,
        transferCount: transfers.length,
        fullyRetired: totalMinted > 0 && circulating === 0,
        lastSignature: latestEvent?.signature ?? null,
        lastSlot: latestEvent?.slot ?? null,
        lastEventAt: latestEvent?.createdAt ?? null,
      },
      update: {
        projectId: latestPayload.projectId ?? latestPayload.project_id ?? undefined,
        projectName: latestPayload.projectName ?? undefined,
        projectType: latestPayload.projectType ?? undefined,
        methodology: latestPayload.methodology ?? undefined,
        vintage: latestPayload.vintage ? Number(latestPayload.vintage) : undefined,
        totalMinted,
        totalRetired,
        circulatingSupply: circulating,
        currentOwner: latestTransfer ? latestTransfer.toWallet : (latestPayload.recipient ?? undefined),
        reportStatus: serializeStatus(latestPayload.reportStatus ?? latestPayload.report_status),
        reportCid: latestPayload.reportCid ?? latestPayload.report_cid ?? undefined,
        evidenceCids,
        transferCount: transfers.length,
        fullyRetired: totalMinted > 0 && circulating === 0,
        lastSignature: latestEvent?.signature ?? undefined,
        lastSlot: latestEvent?.slot ?? undefined,
        lastEventAt: latestEvent?.createdAt ?? undefined,
      },
    });
  }

  /** Recompute a project's denormalized lifecycle snapshot. */
  async rebuildProjectSnapshot(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    const creditRows = await this.prisma.creditSnapshot.findMany({ where: { projectId } });
    const evidenceCount = await this.prisma.evidence.count({ where: { projectId } });
    const verificationCount = await this.prisma.verificationReport.count({ where: { projectId } });
    const mints = creditRows.map((c) => c.creditId);
    const retirements = mints.length
      ? await this.prisma.indexedRetirement.count({ where: { mint: { in: mints } } })
      : 0;

    const totalMinted = creditRows.reduce((s, c) => s + c.totalMinted, 0);
    const totalRetired = creditRows.reduce((s, c) => s + c.totalRetired, 0);
    const latestEvent = await this.prisma.indexedEvent.findFirst({
      where: { projectId },
      orderBy: { slot: 'desc' },
    });

    await this.prisma.projectSnapshot.upsert({
      where: { projectId },
      create: {
        projectId,
        ownerId: project?.ownerId ?? null,
        projectName: project?.projectName ?? null,
        projectType: project?.projectType ?? null,
        methodology: project?.methodology ?? null,
        expectedAnnualTonnes: project?.expectedAnnualTonnes ?? null,
        status: project?.status ?? null,
        creditIds: mints,
        totalMinted,
        totalRetired,
        circulatingSupply: Math.max(0, totalMinted - totalRetired),
        evidenceCount,
        verificationCount,
        retirementCount: retirements,
        lastSignature: latestEvent?.signature ?? null,
        lastSlot: latestEvent?.slot ?? null,
        lastEventAt: latestEvent?.createdAt ?? null,
      },
      update: {
        ownerId: project?.ownerId ?? undefined,
        projectName: project?.projectName ?? undefined,
        projectType: project?.projectType ?? undefined,
        methodology: project?.methodology ?? undefined,
        expectedAnnualTonnes: project?.expectedAnnualTonnes ?? undefined,
        status: project?.status ?? undefined,
        creditIds: mints,
        totalMinted,
        totalRetired,
        circulatingSupply: Math.max(0, totalMinted - totalRetired),
        evidenceCount,
        verificationCount,
        retirementCount: retirements,
        lastSignature: latestEvent?.signature ?? undefined,
        lastSlot: latestEvent?.slot ?? undefined,
        lastEventAt: latestEvent?.createdAt ?? undefined,
      },
    });
  }

  /** Rebuild every snapshot from scratch (public "refresh" + admin resync). */
  async rebuildAllSnapshots(): Promise<{ projects: number; credits: number }> {
    const projectIds = await this.prisma.indexedEvent.findMany({
      where: { projectId: { not: null } },
      select: { projectId: true },
      distinct: ['projectId'],
    });
    const credits = await this.prisma.indexedEvent.findMany({
      where: { mint: { not: null } },
      select: { mint: true },
      distinct: ['mint'],
    });
    for (const p of projectIds) {
      if (p.projectId) await this.rebuildProjectSnapshot(p.projectId);
    }
    for (const c of credits) {
      if (c.mint) await this.rebuildCreditSnapshot(c.mint);
    }
    return { projects: projectIds.length, credits: credits.length };
  }

  /** Public status snapshot. */
  async getStatus(): Promise<{
    eventsIndexed: string;
    txsProcessed: string;
    lastSlot: string;
    lastSignature: string | null;
    isBackfilling: boolean;
    lastPolledAt: string | null;
    lastBackfillAt: string | null;
  }> {
    const c = await this.getCursor();
    return {
      eventsIndexed: c ? c.eventsIndexed.toString() : '0',
      txsProcessed: c ? c.txsProcessed.toString() : '0',
      lastSlot: c ? c.lastSlot.toString() : '0',
      lastSignature: c?.lastSignature ?? null,
      isBackfilling: c?.isBackfilling ?? false,
      lastPolledAt: c?.lastPolledAt?.toISOString() ?? null,
      lastBackfillAt: c?.lastBackfillAt?.toISOString() ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // Anchor event decoding (dynamic import — never loaded at module import time)
  // ---------------------------------------------------------------------------

  /**
   * Decode Anchor event logs. Returns normalized events (without slot/time,
   * which are supplied by the transaction metadata). Uses a lazy BorshCoder.
   */
  async decodeLogs(logs: string[]): Promise<
    Array<{
      eventType: DecodedEvent['eventType'];
      payload: Record<string, unknown>;
      accounts: Record<string, string> | null;
    }>
  > {
    if (!logs || logs.length === 0) return [];
    const coder = await this.getEventCoder();
    const out: Array<{
      eventType: DecodedEvent['eventType'];
      payload: Record<string, unknown>;
      accounts: Record<string, string> | null;
    }> = [];

    for (const line of logs) {
      // Anchor 0.32 emits events as "Program data: <base64>" (legacy: "Program log: ").
      const m = line.match(/^Program (?:data|log):\s*(.+)$/);
      if (!m) continue;
      try {
        const buf = Buffer.from(m[1].trim(), 'base64');
        const decoded = coder.events.decode(buf);
        if (!decoded) continue;
        const name = (decoded as any).name as string;
        const data = serializeForJson((decoded as any).data) as Record<string, unknown>;
        const eventType = normalizeEventType(name);
        if (!eventType) continue;
        out.push({ eventType, payload: data, accounts: extractAccounts(eventType, data) });
      } catch {
        // Not an event log line — ignore.
      }
    }
    return out;
  }

  private async getEventCoder(): Promise<any> {
    if (this.eventCoder) return this.eventCoder;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const anchor = await import('@coral-xyz/anchor');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const idl = require('../carbon-credits/idl/carbon_credit_program.json');
    this.eventCoder = new anchor.BorshCoder(idl);
    return this.eventCoder;
  }

  // ---------------------------------------------------------------------------
  // Solana connection helpers (lazy; mocked in tests)
  // ---------------------------------------------------------------------------

  private getServerConnection(): any {
    if (this.connection) return this.connection;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const web3 = require('@solana/web3.js');
    this.connection = new web3.Connection(this.rpcUrl, 'confirmed');
    return this.connection;
  }

  private getPublicKeyClass(): any {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const web3 = require('@solana/web3.js');
    return web3.PublicKey;
  }

  private getProgramKey(): any {
    const PublicKey = this.getPublicKeyClass();
    return new PublicKey(this.programId);
  }

  // ---------------------------------------------------------------------------
  // Cursor bookkeeping
  // ---------------------------------------------------------------------------

  private async ensureCursor() {
    await this.prisma.indexerCursor.upsert({
      where: { id: CURSOR_ID },
      create: { id: CURSOR_ID },
      update: {},
    });
  }

  private async getCursor() {
    return this.prisma.indexerCursor.findUnique({ where: { id: CURSOR_ID } });
  }

  private async isSignatureIndexed(signature: string): Promise<boolean> {
    const row = await this.prisma.explorerTransaction.findUnique({ where: { signature } });
    return !!row;
  }

  private async setBackfilling(v: boolean) {
    await this.prisma.indexerCursor.upsert({
      where: { id: CURSOR_ID },
      create: { id: CURSOR_ID, isBackfilling: v },
      update: { isBackfilling: v },
    });
  }

  private async touchBackfill() {
    await this.prisma.indexerCursor.upsert({
      where: { id: CURSOR_ID },
      create: { id: CURSOR_ID, lastBackfillAt: new Date() },
      update: { lastBackfillAt: new Date() },
    });
  }

  private async advanceCursor(signature: string | undefined, slot: bigint | undefined, events: number, txs: number) {
    await this.prisma.indexerCursor.upsert({
      where: { id: CURSOR_ID },
      create: {
        id: CURSOR_ID,
        lastSignature: signature ?? null,
        lastSlot: slot ?? BigInt(0),
        eventsIndexed: BigInt(events),
        txsProcessed: BigInt(txs),
        lastPolledAt: new Date(),
      },
      update: {
        ...(signature ? { lastSignature: signature } : {}),
        ...(slot !== undefined ? { lastSlot: slot } : {}),
        eventsIndexed: { increment: BigInt(events) },
        txsProcessed: { increment: BigInt(txs) },
        lastPolledAt: new Date(),
      },
    });
  }

  private toBigInt(v: unknown): bigint | null {
    if (v === null || v === undefined) return null;
    try {
      return BigInt(v as number | string | bigint);
    } catch {
      return null;
    }
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Coerce an unknown decoded value into a string | null for the DB columns. */
function strVal(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && typeof (v as any).toBase58 === 'function') {
    return (v as any).toBase58();
  }
  return String(v);
}

/** Coerce an unknown decoded value into a number | null for the DB columns. */
function numVal(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeEventType(name: string): DecodedEvent['eventType'] | null {
  switch (name) {
    case 'CreditMinted':
      return 'CREDIT_MINTED';
    case 'CreditTransferred':
      return 'CREDIT_TRANSFERRED';
    case 'CreditRetired':
      return 'CREDIT_RETIRED';
    case 'OracleAuthorityChanged':
      return 'ORACLE_AUTHORITY_CHANGED';
    default:
      return null;
  }
}

function extractAccounts(
  eventType: DecodedEvent['eventType'],
  data: Record<string, unknown>,
): Record<string, string> | null {
  switch (eventType) {
    case 'CREDIT_MINTED':
      return {
        mint: String(data.mint),
        recipient: String(data.recipient),
        batch: String(data.batch),
        authority: String(data.authority),
      };
    case 'CREDIT_TRANSFERRED':
      return {
        mint: String(data.mint),
        from: String(data.from),
        to: String(data.to),
      };
    case 'CREDIT_RETIRED':
      return {
        mint: String(data.mint),
        owner: String(data.owner),
        batch: String(data.batch),
        retirementRecord: String(data.retirementRecord ?? data.retirement_record),
      };
    case 'ORACLE_AUTHORITY_CHANGED':
      return {
        oldAuthority: String(data.oldAuthority ?? data.old_authority),
        newAuthority: String(data.newAuthority ?? data.new_authority),
      };
    default:
      return null;
  }
}

/** Normalize an Anchor report-status enum value to a string. */
function serializeStatus(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const keys = Object.keys(v as object);
    if (keys.length) return keys[0].toUpperCase();
  }
  return null;
}

/**
 * Recursively converts Anchor-decoded values (BN, PublicKey, arrays) into plain
 * JSON-serializable primitives so they can be stored in a Json column and
 * returned by the API.
 */
function serializeForJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function') return undefined;
  // BN-like (anchor) — has toString and toNumber.
  if (
    typeof value === 'object' &&
    'toString' in (value as object) &&
    (value as any).constructor?.name === 'BN'
  ) {
    return (value as any).toString();
  }
  // PublicKey-like.
  if (
    typeof value === 'object' &&
    (value as any).constructor?.name === 'PublicKey' &&
    typeof (value as any).toBase58 === 'function'
  ) {
    return (value as any).toBase58();
  }
  if (Array.isArray(value)) {
    return value.map(serializeForJson);
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const s = serializeForJson(v);
      if (s !== undefined) out[k] = s;
    }
    return out;
  }
  return value;
}
