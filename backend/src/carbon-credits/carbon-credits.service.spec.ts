import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CarbonCreditsService } from './carbon-credits.service';
import { SolanaIssuanceService } from './solana-issuance.service';
import { Stage3ToOnchainAdapter } from './adapters/stage3-to-onchain.adapter';
import { VerificationService } from '../verification/verification.service';

// Mock the Solana service with a factory so Jest never loads @coral-xyz/anchor
// (an ESM package that ts-jest cannot transform). The real class is replaced by
// a manual mock; we inject our own stub implementation in beforeEach.
jest.mock('./solana-issuance.service', () => ({
  SolanaIssuanceService: jest.fn().mockImplementation(() => ({
    issue: jest.fn(),
    buildTransferTx: jest.fn(),
    buildRetireTx: jest.fn(),
    getBatches: jest.fn(),
    getRetirements: jest.fn(),
  })),
}));

const mockReport = {
  id: 'rep-1',
  projectId: 'proj-abc',
  projectName: 'Amazon Reforestation',
  verifiedTonnes: 1250.7,
  confidenceScore: 82,
  status: 'VERIFIED' as const,
  reportCid: 'bafyreportcid',
  reportUrl: null,
  ndviScore: 0.61,
  anomalyCount: 0,
  anomalies: [],
  createdAt: '2026-07-16T12:00:00.000Z',
  metadata: { methodology: 'VM0036', evidence: [{ id: 'e1', cid: 'bafyev1' }] },
};

describe('CarbonCreditsService', () => {
  let service: CarbonCreditsService;
  let verification: { latestForProject: jest.Mock };
  let solana: { issue: jest.Mock };

  beforeEach(async () => {
    verification = { latestForProject: jest.fn() };
    solana = { issue: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CarbonCreditsService,
        { provide: VerificationService, useValue: verification },
        { provide: SolanaIssuanceService, useValue: solana },
        Stage3ToOnchainAdapter,
      ],
    }).compile();

    service = module.get(CarbonCreditsService);
  });

  it('eligible returns the floored 1:1 amount for a VERIFIED report', async () => {
    verification.latestForProject.mockResolvedValue(mockReport);
    const res = await service.eligible('proj-abc');
    expect(res.eligible).toBe(true);
    expect(res.status).toBe('VERIFIED');
    expect(res.verifiedTonnes).toBe(1250.7);
    expect(res.evidenceCid).toBe('bafyev1');
    expect(res.methodology).toBe('VM0036');
  });

  it('eligible reports ineligible for a PENDING report', async () => {
    verification.latestForProject.mockResolvedValue({
      ...mockReport,
      status: 'PENDING_VERIFICATION',
    });
    const res = await service.eligible('proj-abc');
    expect(res.eligible).toBe(false);
  });

  it('issue blocks non-AUDITOR/ADMIN roles (RBAC)', async () => {
    await expect(
      service.issue(
        { projectId: 'proj-abc', recipient: '11111111111111111111111111111111' },
        { id: 'u1', role: Role.DEVELOPER },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('issue blocks when the latest report is not VERIFIED', async () => {
    verification.latestForProject.mockResolvedValue({
      ...mockReport,
      status: 'REJECTED',
    });
    await expect(
      service.issue(
        { projectId: 'proj-abc', recipient: '11111111111111111111111111111111' },
        { id: 'u1', role: Role.AUDITOR },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('issue runs the 1:1 bridge for an AUDITOR on a VERIFIED report', async () => {
    verification.latestForProject.mockResolvedValue(mockReport);
    solana.issue.mockResolvedValue({
      txSignature: 'sigXYZ',
      batchPda: 'batchPda',
      mint: 'mintPk',
      amount: 1250,
    });
    const res = await service.issue(
      { projectId: 'proj-abc', recipient: '11111111111111111111111111111111' },
      { id: 'u1', role: Role.AUDITOR },
    );
    expect(res.amount).toBe(1250); // floored verifiedTonnes
    expect(res.txSignature).toBe('sigXYZ');
    expect(solana.issue).toHaveBeenCalledTimes(1);
    // The report passed to solana.issue carries the VERIFIED status.
    expect(solana.issue.mock.calls[0][0].status).toBe('VERIFIED');
  });

  it('transfer and retire delegate to the Solana service', async () => {
    const transferSpy = jest.spyOn(service, 'transfer').mockResolvedValue({
      transaction: 'base64tx',
      requiresSigner: 'fromPk',
    });
    await service.transfer('mint', 'from', 'to', 10);
    expect(transferSpy).toHaveBeenCalledWith('mint', 'from', 'to', 10);
  });
});
