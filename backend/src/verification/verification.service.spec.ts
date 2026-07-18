import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ProjectStatus, Role } from '@prisma/client';
import { VerificationService } from './verification.service';
import { PrismaService } from '../prisma/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';
import { PinataService } from '../evidence/pinata/pinata.service';
import { NdviService } from './services/ndvi.service';
import { CarbonEstimationService } from './services/carbon-estimation.service';
import { AnomalyDetectionService } from './services/anomaly-detection.service';
import { ReportGeneratorService } from './report/report-generator.service';

function buildService(mocks: {
  prisma: Partial<PrismaService>;
  evidence: Partial<EvidenceService>;
  pinata: Partial<PinataService>;
}) {
  return new VerificationService(
    mocks.prisma as PrismaService,
    mocks.evidence as EvidenceService,
    mocks.pinata as PinataService,
    new NdviService(),
    new CarbonEstimationService(),
    new AnomalyDetectionService(),
    new ReportGeneratorService(),
  );
}

const project = {
  id: 'proj-1',
  ownerId: 'owner-1',
  projectName: 'Amazon Reforestation',
  projectType: 'REFORESTATION' as const,
  methodology: 'VM0033',
  expectedAnnualTonnes: 1000,
  geoPolygon: {
    type: 'Polygon',
    coordinates: [
      [
        [-60.0, -3.0],
        [-59.9, -3.0],
        [-59.9, -2.9],
        [-60.0, -2.9],
        [-60.0, -3.0],
      ],
    ],
  },
};

const evidenceRows = [
  { id: 'e1', source: 'SENTINEL2' as const, cid: 'c1', latitude: -2.95, longitude: -59.95, timestamp: new Date('2026-01-01'), metadata: null },
  { id: 'e2', source: 'LANDSAT' as const, cid: 'c2', latitude: -2.96, longitude: -59.96, timestamp: new Date('2026-02-01'), metadata: null },
  { id: 'e3', source: 'GEO_UPLOAD' as const, cid: 'c3', latitude: -2.94, longitude: -59.94, timestamp: new Date('2026-03-01'), metadata: null },
];

describe('VerificationService (orchestrator wiring)', () => {
  it('throws 404 when the project is missing', async () => {
    const svc = buildService({
      prisma: { project: { findUnique: async () => null } } as any, evidence: {}, pinata: {},
    });
    await expect(
      svc.verify({ projectId: 'nope', actorId: 'owner-1', actorRole: Role.ADMIN }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('forbids a developer from verifying another owner’s project', async () => {
    const svc = buildService({
      prisma: { project: { findUnique: async () => project } } as any, evidence: {}, pinata: {},
    });
    await expect(
      svc.verify({ projectId: 'proj-1', actorId: 'someone-else', actorRole: Role.DEVELOPER }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('runs the full pipeline and persists a VERIFIED report', async () => {
    const created: any[] = [];
    const svc = buildService({
      prisma: {
        project: {
          findUnique: async () => project,
          update: async () => project,
        },
        verificationReport: {
          create: async (args: any) => {
            created.push(args.data);
            return { id: 'rep-1', createdAt: new Date(), ...args.data };
          },
        },
      } as any,
      evidence: { listByProject: async () => evidenceRows } as any,
      pinata: { pinFile: async () => ({ cid: 'bafyTEST', ipfsUrl: 'https://gw/ipfs/bafyTEST' }) } as any,
    });

    const res = await svc.verify({ projectId: 'proj-1', actorId: 'owner-1', actorRole: Role.DEVELOPER });

    expect(res.status).toBe(ProjectStatus.VERIFIED);
    expect(res.reportCid).toBe('bafyTEST');
    expect(res.verifiedTonnes).toBeGreaterThan(0);
    expect(res.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(created.length).toBe(1);
    expect(created[0].reportCid).toBe('bafyTEST');
    expect(created[0].verifiedTonnes).toBe(res.verifiedTonnes);
    expect(created[0].confidenceScore).toBe(res.confidenceScore);
  });

  it('rejects a project with duplicate CIDs (hard fail)', async () => {
    const dupRows = evidenceRows.map((e, i) => ({ ...e, id: `e${i}`, cid: 'SAME_CID' }));
    const svc = buildService({
      prisma: {
        project: {
          findUnique: async () => project,
          update: async () => project,
        },
        verificationReport: {
          create: async (args: any) => ({ id: 'rep-2', createdAt: new Date(), ...args.data }),
        },
      } as any,
      evidence: { listByProject: async () => dupRows } as any,
      pinata: { pinFile: async () => ({ cid: 'bafyDUP', ipfsUrl: 'https://gw/ipfs/bafyDUP' }) } as any,
    });

    const res = await svc.verify({ projectId: 'proj-1', actorId: 'owner-1', actorRole: Role.DEVELOPER });
    expect(res.status).toBe(ProjectStatus.REJECTED);
    expect(res.anomalyCount).toBeGreaterThan(0);
  });

  it('lists reports and returns 404 when none exist', async () => {
    const svc = buildService({
      prisma: {
        project: { findUnique: async () => project },
        verificationReport: { findMany: async () => [] },
      } as any,
      evidence: {}, pinata: {},
    });
    await expect(svc.latestForProject('proj-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
