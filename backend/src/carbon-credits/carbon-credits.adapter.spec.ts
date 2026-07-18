import { Test, TestingModule } from '@nestjs/testing';
import { Stage3ToOnchainAdapter } from './adapters/stage3-to-onchain.adapter';
import {
  VERIFIED_STATUS,
  PENDING_STATUS,
  REJECTED_STATUS,
} from './adapters/stage3-to-onchain.adapter';
import { VerificationReportSummary } from './adapters/stage3-to-onchain.adapter';

function makeReport(overrides: Partial<VerificationReportSummary> = {}): VerificationReportSummary {
  return {
    id: 'rep-1',
    projectId: 'proj-abc',
    projectName: 'Amazon Reforestation',
    verifiedTonnes: 1250.7,
    confidenceScore: 82,
    status: VERIFIED_STATUS,
    reportCid: 'bafyreportcid',
    reportUrl: null,
    ndviScore: 0.61,
    createdAt: '2026-07-16T12:00:00.000Z',
    metadata: {
      methodology: 'VM0036',
      evidence: [
        { id: 'e1', cid: 'bafyev1', source: 'SENTINEL2' },
        { id: 'e2', cid: 'bafyev2', source: 'GEO_UPLOAD' },
      ],
    },
    ...overrides,
  };
}

describe('Stage3ToOnchainAdapter', () => {
  let adapter: Stage3ToOnchainAdapter;

  beforeEach(() => {
    adapter = new Stage3ToOnchainAdapter();
  });

  it('maps a VERIFIED report to on-chain mint args with the 1:1 floored amount', () => {
    const args = adapter.toMintArgs(makeReport());
    expect(args.projectId).toBe('proj-abc');
    expect(args.reportCid).toBe('bafyreportcid');
    expect(args.methodology).toBe('VM0036');
    expect(args.evidenceCids).toEqual(['bafyev1', 'bafyev2']);
    // 1:1 — floor(1250.7) = 1250 credits.
    expect(args.verifiedTonnesScaled).toBe(1250);
    expect(args.reportStatus).toEqual({ verified: {} });
    // vintage defaults to the report year (2026).
    expect(args.vintage).toBe(2026);
  });

  it('honours an explicit vintage override', () => {
    const args = adapter.toMintArgs(makeReport(), 2025);
    expect(args.vintage).toBe(2025);
  });

  it('maps PENDING and REJECTED statuses to the correct enum discriminant', () => {
    expect(adapter.toMintArgs(makeReport({ status: PENDING_STATUS })).reportStatus).toEqual({
      pendingVerification: {},
    });
    expect(adapter.toMintArgs(makeReport({ status: REJECTED_STATUS })).reportStatus).toEqual({
      rejected: {},
    });
  });

  it('falls back to an empty methodology / evidence list when metadata is missing', () => {
    const args = adapter.toMintArgs(makeReport({ metadata: null }));
    expect(args.methodology).toBe('');
    expect(args.evidenceCids).toEqual([]);
  });

  it('isEligible is true only for VERIFIED reports', () => {
    expect(adapter.isEligible(makeReport({ status: VERIFIED_STATUS }))).toBe(true);
    expect(adapter.isEligible(makeReport({ status: PENDING_STATUS }))).toBe(false);
    expect(adapter.isEligible(makeReport({ status: REJECTED_STATUS }))).toBe(false);
  });
});
