import { ReportGeneratorService } from './report-generator.service';
import { VerificationResult, Anomaly } from '../verification.types';
import { ProjectType, ProjectStatus, EvidenceSource } from '@prisma/client';

describe('ReportGeneratorService (pdfkit)', () => {
  const service = new ReportGeneratorService();

  const result: VerificationResult = {
    projectId: 'p1',
    projectName: 'Amazon Reforestation',
    projectType: ProjectType.REFORESTATION,
    methodology: 'VM0033',
    expectedAnnualTonnes: 1000,
    areaHa: 257,
    evidence: [
      { id: 'e1', source: EvidenceSource.SENTINEL2, cid: 'c1', latitude: -2.95, longitude: -59.95, timestamp: new Date('2026-01-01'), metadata: null },
      { id: 'e2', source: EvidenceSource.GEO_UPLOAD, cid: 'c2', latitude: -2.96, longitude: -59.96, timestamp: new Date('2026-02-01'), metadata: null },
    ],
    ndvi: {
      mean: 0.61,
      median: 0.6,
      min: 0.5,
      max: 0.7,
      stdDev: 0.05,
      sampleCount: 2,
      perSource: [{ source: EvidenceSource.SENTINEL2, mean: 0.65, count: 1 }],
      health: 'HEALTHY',
    },
    carbon: { estimatedTonnes: 1284.6, areaHa: 257, sequestrationFactorTonnesPerHa: 5.0, method: 'm' },
    anomalies: [] as Anomaly[],
    confidenceScore: 82,
    status: ProjectStatus.VERIFIED,
    verifiedTonnes: 1284.6,
    notes: ['+10: evidence coverage (2 item(s)).'],
  };

  it('produces a non-empty PDF buffer', async () => {
    const buf = await service.generatePdf(result);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    // PDF magic header.
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  });

  it('renders anomalies when present', async () => {
    const withAnomalies: VerificationResult = {
      ...result,
      anomalies: [
        { type: 'DUPLICATE_CID', severity: 'HIGH', message: 'dup', refs: ['c1'] },
      ],
    };
    const buf = await service.generatePdf(withAnomalies);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  });
});
