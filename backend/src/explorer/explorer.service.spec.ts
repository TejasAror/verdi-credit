import { Test, TestingModule } from '@nestjs/testing';
import { BlockchainIndexerService, DecodedEvent } from './indexer.service';
import { ExplorerService } from './explorer.service';
import { ExplorerController } from './explorer.controller';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Integration tests for the Explorer read layer against the real Supabase /
 * Postgres database. Seeds a project, evidence, verification report, and a
 * chain-indexed credit (via the indexer's pure ingestion pipeline), then
 * asserts the public explorer aggregations and lifecycle timeline. Writes are
 * scoped to a unique project id and cleaned up afterwards so the suite is
 * repeatable.
 */
describe('ExplorerService + Controller (integration)', () => {
  let explorer: ExplorerService;
  let controller: ExplorerController;
  let indexer: BlockchainIndexerService;
  let prisma: PrismaService;

  const projectId = `explorer-test-${Date.now()}`;
  const mint = `MintTest${Date.now().toString(36).padEnd(38, 'X').slice(0, 43)}`;
  const recipient = 'RecipientTest111111111111111111111111111';
  const owner = 'OwnerTest1111111111111111111111111111111';

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExplorerController],
      providers: [
        ExplorerService,
        BlockchainIndexerService,
        PrismaService,
        { provide: ConfigService, useValue: { get: () => 'devnet' } },
      ],
    }).compile();
    explorer = module.get(ExplorerService);
    controller = module.get(ExplorerController);
    indexer = module.get(BlockchainIndexerService);
    prisma = module.get(PrismaService);
  });

  beforeAll(async () => {
    // Seed the off-chain Stage 1–3 records that the explorer aggregates.
    await prisma.user.upsert({
      where: { supabaseId: owner },
      create: {
        supabaseId: owner,
        email: `${owner}@example.com`,
        role: 'DEVELOPER',
        walletAddress: owner,
      },
      update: {},
    });
    await prisma.project.create({
      data: {
        id: projectId,
        ownerId: owner,
        projectName: 'Explorer Test Reforestation',
        projectType: 'REFORESTATION',
        methodology: 'VM0036',
        expectedAnnualTonnes: 1500,
        geoPolygon: { type: 'Polygon', coordinates: [] },
        status: 'VERIFIED',
      },
    });
    await prisma.evidence.create({
      data: {
        id: `ev-${projectId}`,
        projectId,
        source: 'SENTINEL2',
        status: 'VERIFIED',
        cid: 'bafyevidence1',
        ipfsUrl: 'https://ipfs.io/ipfs/bafyevidence1',
      },
    });
    await prisma.verificationReport.create({
      data: {
        id: `vr-${projectId}`,
        projectId,
        verifiedTonnes: 1200,
        confidenceScore: 88,
        status: 'VERIFIED',
        reportCid: 'bafyreport1',
        reportUrl: 'https://ipfs.io/ipfs/bafyreport1',
        ndviScore: 0.64,
      },
    });

    // Index a mint + transfer + retirement through the pure pipeline.
    const mintEvent: DecodedEvent = {
      eventType: 'CREDIT_MINTED',
      signature: 'sigMint',
      slot: 100n,
      blockTime: 100n,
      programId: 'prog',
      payload: {
        batch: 'batchPk',
        mint,
        projectId,
        vintage: 2026,
        methodology: 'VM0036',
        evidenceCids: ['bafyevidence1'],
        reportCid: 'bafyreport1',
        reportStatus: { verified: {} },
        verifiedTonnesScaled: 1200,
        totalMinted: 1200,
        recipient,
        authority: 'authPk',
        amount: 1200,
      },
      accounts: { mint, recipient, batch: 'batchPk', authority: 'authPk' },
    };
    await indexer.ingestEvents([mintEvent], {
      signature: 'sigMint',
      slot: 100n,
      blockTime: 100n,
      success: true,
      logs: [],
    });
    await indexer.ingestEvents(
      [
        {
          eventType: 'CREDIT_TRANSFERRED',
          signature: 'sigXfer',
          slot: 110n,
          blockTime: 110n,
          programId: 'prog',
          payload: { mint, from: recipient, to: owner, amount: 500 },
          accounts: { mint, from: recipient, to: owner },
        },
      ],
      { signature: 'sigXfer', slot: 110n, blockTime: 110n, success: true, logs: [] },
    );
    await indexer.ingestEvents(
      [
        {
          eventType: 'CREDIT_RETIRED',
          signature: 'sigRetire',
          slot: 120n,
          blockTime: 120n,
          programId: 'prog',
          payload: {
            owner,
            batch: 'batchPk',
            mint,
            amount: 300,
            reason: 'Net zero',
            reportRef: projectId,
            retirementRecord: 'retPk',
            timestamp: 120,
            totalRetired: 300,
          },
          accounts: { mint, owner, batch: 'batchPk', retirementRecord: 'retPk' },
        },
      ],
      { signature: 'sigRetire', slot: 120n, blockTime: 120n, success: true, logs: [] },
    );
  });

  afterAll(async () => {
    // Clean up all seeded rows.
    await prisma.indexedEvent.deleteMany({ where: { mint } });
    await prisma.ownershipTransfer.deleteMany({ where: { mint } });
    await prisma.indexedRetirement.deleteMany({ where: { mint } });
    await prisma.explorerTransaction.deleteMany({ where: { mint } });
    await prisma.creditSnapshot.deleteMany({ where: { creditId: mint } });
    await prisma.projectSnapshot.deleteMany({ where: { projectId } });
    await prisma.verificationReport.deleteMany({ where: { id: `vr-${projectId}` } });
    await prisma.evidence.deleteMany({ where: { id: `ev-${projectId}` } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { supabaseId: owner } });
    await prisma.$disconnect();
  });

  it('getCredit returns the aggregated lifecycle with all Stages', async () => {
    const res = await explorer.getCredit(mint);
    expect(res.found).toBe(true);
    expect(res.credit?.totalMinted).toBe(1200);
    expect(res.credit?.totalRetired).toBe(300);
    expect(res.credit?.circulatingSupply).toBe(900);
    expect(res.credit?.currentOwner).toBe(owner);
    expect(res.credit?.transferCount).toBe(1);
    expect(res.evidence).toHaveLength(1);
    expect(res.verificationReports).toHaveLength(1);
    expect(res.ownershipHistory).toHaveLength(1);
    expect(res.retirements).toHaveLength(1);

    // Lifecycle timeline includes every Stage 1–6 stage.
    const stages = res.lifecycle.map((l) => l.stage);
    expect(stages).toContain('PROJECT_REGISTERED');
    expect(stages).toContain('EVIDENCE_UPLOADED');
    expect(stages).toContain('AI_VERIFIED');
    expect(stages).toContain('CREDIT_ISSUED');
    expect(stages).toContain('TRANSFERRED');
    expect(stages).toContain('RETIRED');
  });

  it('search resolves a credit mint to a CREDIT result', async () => {
    const res = await explorer.search(mint);
    expect(res.kind).toBe('CREDIT');
    expect(res.credit?.found).toBe(true);
  });

  it('search resolves a project uuid to a PROJECT result', async () => {
    const res = await explorer.search(projectId);
    expect(res.kind).toBe('PROJECT');
    expect(res.project?.found).toBe(true);
  });

  it('listCredits is paginated and searchable', async () => {
    const page = await explorer.listCredits({ page: 1, limit: 10, q: mint.slice(0, 8) });
    expect(page.total).toBeGreaterThanOrEqual(1);
    expect(page.items.some((c) => c.creditId === mint)).toBe(true);
  });

  it('listProjects includes the seeded project with chain-derived supply', async () => {
    const page = await explorer.listProjects({ page: 1, limit: 50 });
    const proj = page.items.find((p) => p.projectId === projectId);
    expect(proj).toBeDefined();
    expect(proj?.totalMinted).toBe(1200);
    expect(proj?.totalRetired).toBe(300);
    expect(proj?.creditIds).toContain(mint);
  });

  it('controller health/status endpoint returns indexer stats', async () => {
    const status = await controller.status();
    expect(typeof status.enabled).toBe('boolean');
    expect(status.creditCount).toBeGreaterThanOrEqual(1);
    expect(status.projectCount).toBeGreaterThanOrEqual(1);
  });

  it('search with an unknown id returns NONE without throwing', async () => {
    const res = await explorer.search('does-not-exist-1234567890');
    expect(res.kind).toBe('NONE');
  });
});
