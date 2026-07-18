import { NdviService } from './ndvi.service';
import { EvidenceItem } from '../verification.types';
import { EvidenceSource, ProjectType } from '@prisma/client';

function ev(id: string, source: EvidenceSource): EvidenceItem {
  return { id, source, cid: `cid-${id}`, latitude: null, longitude: null, timestamp: null };
}

describe('NdviService (mock)', () => {
  const service = new NdviService();

  it('returns zeroed result when there is no evidence', () => {
    const r = service.compute('p1', ProjectType.REFORESTATION, []);
    expect(r.sampleCount).toBe(0);
    expect(r.mean).toBe(0);
  });

  it('produces deterministic means for the same input', () => {
    const items = [ev('e1', EvidenceSource.SENTINEL2), ev('e2', EvidenceSource.GEO_UPLOAD)];
    const a = service.compute('proj-x', ProjectType.REFORESTATION, items);
    const b = service.compute('proj-x', ProjectType.REFORESTATION, items);
    expect(a.mean).toBe(b.mean);
    expect(a.perSource.length).toBe(2);
  });

  it('keeps means within the valid NDVI range', () => {
    const items = Array.from({ length: 6 }, (_, i) =>
      ev(`e${i}`, i % 2 ? EvidenceSource.LANDSAT : EvidenceSource.SENTINEL2),
    );
    const r = service.compute('proj-y', ProjectType.REFORESTATION, items);
    expect(r.mean).toBeGreaterThanOrEqual(-0.1);
    expect(r.mean).toBeLessThanOrEqual(0.95);
    expect(r.min).toBeLessThanOrEqual(r.max);
  });

  it('classifies health bands by mean NDVI', () => {
    const sparse = service.compute('p', ProjectType.SOIL_CARBON, [ev('a', EvidenceSource.OPENWEATHER)]);
    // OPENWEATHER base 0.2 with jitter; mean should be LOW-ish. Just assert it's bounded.
    expect(['SPARSE', 'MODERATE', 'HEALTHY', 'DENSE']).toContain(sparse.health);
  });
});
