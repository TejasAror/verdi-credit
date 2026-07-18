import { CarbonEstimationService } from './carbon-estimation.service';
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
    min: mean - 0.1,
    max: mean + 0.1,
    stdDev: 0.05,
    sampleCount: 1,
    perSource: [{ source: EvidenceSource.SENTINEL2, mean, count: 1 }],
    health: 'HEALTHY',
  };
}

describe('CarbonEstimationService (mock)', () => {
  const service = new CarbonEstimationService();

  it('estimates positive tonnes for a real polygon and healthy NDVI', () => {
    const r = service.estimate(
      'p1',
      ProjectType.REFORESTATION,
      polygon,
      1000,
      ndvi(0.6),
    );
    expect(r.areaHa).toBeGreaterThan(0);
    expect(r.estimatedTonnes).toBeGreaterThan(0);
    expect(r.sequestrationFactorTonnesPerHa).toBeGreaterThan(0);
    expect(r.method).toContain('estimatedTonnes');
  });

  it('scales the factor with NDVI', () => {
    const low = service.estimate('p', ProjectType.REFORESTATION, polygon, 1000, ndvi(0.3));
    const high = service.estimate('p', ProjectType.REFORESTATION, polygon, 1000, ndvi(0.8));
    expect(high.estimatedTonnes).toBeGreaterThan(low.estimatedTonnes);
  });

  it('falls back to an area-derived estimate when polygon is unusable', () => {
    const r = service.estimate('p', ProjectType.REFORESTATION, null, 500, ndvi(0.6));
    expect(r.areaHa).toBeGreaterThan(0);
    expect(r.estimatedTonnes).toBeGreaterThan(0);
  });

  it('keeps the factor within a sane clamp (<= 2x anchor)', () => {
    const r = service.estimate('p', ProjectType.REFORESTATION, polygon, 1000, ndvi(0.95));
    expect(r.sequestrationFactorTonnesPerHa).toBeLessThanOrEqual(10);
  });
});
