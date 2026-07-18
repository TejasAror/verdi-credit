import { AnomalyDetectionService } from './anomaly-detection.service';
import { EvidenceItem, NdviResult } from '../verification.types';
import { EvidenceSource, ProjectType } from '@prisma/client';

const polygon = {
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
};

function ndvi(mean: number): NdviResult {
  return {
    mean,
    median: mean,
    min: mean,
    max: mean,
    stdDev: 0,
    sampleCount: 1,
    perSource: [{ source: EvidenceSource.SENTINEL2, mean, count: 1 }],
    health: 'HEALTHY',
  };
}

function ev(id: string, source: EvidenceSource, lat = -2.95, lng = -59.95, t?: Date): EvidenceItem {
  return { id, source, cid: `cid-${id}`, latitude: lat, longitude: lng, timestamp: t ?? null };
}

describe('AnomalyDetectionService (mock)', () => {
  const service = new AnomalyDetectionService();

  const base = {
    projectId: 'p1',
    projectType: ProjectType.REFORESTATION as ProjectType,
    expectedAnnualTonnes: 1000,
    geoPolygon: polygon,
    evidence: [] as EvidenceItem[],
    ndvi: ndvi(0.6),
    carbon: { estimatedTonnes: 800, areaHa: 100, sequestrationFactorTonnesPerHa: 8, method: 'm' },
  };

  it('flags low evidence count as HIGH', () => {
    const { anomalies } = service.detect({ ...base, evidence: [ev('a', EvidenceSource.SENTINEL2)] });
    expect(anomalies.some((a) => a.type === 'EVIDENCE_COUNT_LOW')).toBe(true);
  });

  it('flags duplicate CIDs as HIGH', () => {
    const dup: EvidenceItem[] = [
      { ...ev('a', EvidenceSource.SENTINEL2), cid: 'SAME' },
      { ...ev('b', EvidenceSource.LANDSAT), cid: 'SAME' },
    ];
    const { anomalies } = service.detect({ ...base, evidence: dup });
    const found = anomalies.find((a) => a.type === 'DUPLICATE_CID');
    expect(found).toBeDefined();
    expect(found!.severity).toBe('HIGH');
  });

  it('flags carbon over-claim as HIGH', () => {
    const { anomalies } = service.detect({ ...base, carbon: { ...base.carbon, estimatedTonnes: 3000 } });
    expect(anomalies.some((a) => a.type === 'CARBON_OVERCLAIM')).toBe(true);
  });

  it('flags low NDVI on vegetation projects as MEDIUM', () => {
    const { anomalies } = service.detect({ ...base, ndvi: ndvi(0.1) });
    expect(anomalies.some((a) => a.type === 'NDVI_LOW')).toBe(true);
  });

  it('flags evidence outside the polygon as MEDIUM', () => {
    const outside = ev('z', EvidenceSource.GEO_UPLOAD, 10, 10);
    const { anomalies } = service.detect({ ...base, evidence: [outside] });
    expect(anomalies.some((a) => a.type === 'OUT_OF_POLICY_AREA')).toBe(true);
  });

  it('returns no anomalies for a clean, well-supported project', () => {
    const items = [
      ev('a', EvidenceSource.SENTINEL2, -2.95, -59.95, new Date('2026-01-01')),
      ev('b', EvidenceSource.LANDSAT, -2.96, -59.96, new Date('2026-02-01')),
      ev('c', EvidenceSource.GEO_UPLOAD, -2.94, -59.94, new Date('2026-03-01')),
    ];
    const { anomalies } = service.detect({ ...base, evidence: items });
    expect(anomalies.length).toBe(0);
  });
});
