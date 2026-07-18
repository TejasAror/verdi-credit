import { EvidenceSource } from '@prisma/client';
import { Sentinel2Adapter } from './sentinel2.adapter';
import { LandsatAdapter } from './landsat.adapter';
import { NASAEarthDataAdapter } from './nasa-earthdata.adapter';
import { OpenWeatherAdapter } from './openweather.adapter';
import { GeoUploadAdapter } from './geo-upload.adapter';
import { AdapterContext } from './evidence-adapter.interface';

const ctx = (over: Partial<AdapterContext> = {}): AdapterContext => ({
  projectId: 'proj-1',
  latitude: -3.4653,
  longitude: -62.2159,
  ...over,
});

describe('Evidence adapters (interface contract)', () => {
  const cases: Array<{
    name: string;
    adapter: any;
    ctor: new (...a: any[]) => any;
  }> = [
    { name: 'Sentinel2Adapter', adapter: new Sentinel2Adapter(), ctor: Sentinel2Adapter },
    { name: 'LandsatAdapter', adapter: new LandsatAdapter(), ctor: LandsatAdapter },
    {
      name: 'NASAEarthDataAdapter',
      adapter: new NASAEarthDataAdapter({ get: () => undefined } as any),
      ctor: NASAEarthDataAdapter,
    },
    {
      name: 'OpenWeatherAdapter',
      adapter: new OpenWeatherAdapter({ get: () => undefined } as any),
      ctor: OpenWeatherAdapter,
    },
    { name: 'GeoUploadAdapter', adapter: new GeoUploadAdapter(), ctor: GeoUploadAdapter },
  ];

  // GeoUpload needs a file, so it is exercised separately below.
  const fileLess = cases.filter((c) => c.name !== 'GeoUploadAdapter');

  it.each(fileLess)('$name exposes a unique source + fetch/normalize', async ({ adapter }) => {
    expect(typeof adapter.source).toBe('string');
    expect(typeof adapter.fetch).toBe('function');
    expect(typeof adapter.normalize).toBe('function');
    const raw = await adapter.fetch(ctx());
    const normalized = await adapter.normalize(raw, ctx());
    expect(normalized.source).toBe(adapter.source);
    // Spatial temporal context is preserved through normalize().
    expect(normalized.latitude).toBeCloseTo(-3.4653);
    expect(normalized.longitude).toBeCloseTo(-62.2159);
    expect(normalized.metadata).toBeDefined();
  });

  it('all five sources are distinct', () => {
    const sources = cases.map((c) => c.adapter.source).sort();
    expect(sources).toEqual(
      [
        EvidenceSource.GEO_UPLOAD,
        EvidenceSource.LANDSAT,
        EvidenceSource.NASA_EARTHDATA,
        EvidenceSource.OPENWEATHER,
        EvidenceSource.SENTINEL2,
      ].sort(),
    );
  });
});

describe('GeoUploadAdapter', () => {
  const adapter = new GeoUploadAdapter();

  it('uses the uploaded file buffer as the raw payload', async () => {
    const buf = Buffer.from('hello geo evidence');
    const raw = await adapter.fetch(
      ctx({
        file: { buffer: buf, filename: 'plotA.png', mimeType: 'image/png' },
      }),
    );
    expect(Buffer.isBuffer(raw.payload)).toBe(true);
    expect(raw.payload).toBe(buf);
    expect(raw.mimeType).toBe('image/png');
    expect(raw.filename).toBe('plotA.png');
  });

  it('throws when no file is supplied', async () => {
    await expect(adapter.fetch(ctx({ file: undefined }))).rejects.toThrow(
      /requires a file/,
    );
  });
});

describe('OpenWeatherAdapter (no key → descriptor fallback)', () => {
  it('emits a reproducible descriptor when no API key is set', async () => {
    const adapter = new OpenWeatherAdapter({ get: () => '' } as any);
    const raw = await adapter.fetch(ctx());
    expect(raw.mimeType).toBe('application/json');
    expect((raw.payload as any).provider).toBe('OpenWeather');
    expect((raw.payload as any).apiKeyPresent).toBe(false);
  });

  it('throws when latitude/longitude are missing', async () => {
    const adapter = new OpenWeatherAdapter({ get: () => 'key' } as any);
    await expect(adapter.fetch(ctx({ latitude: undefined, longitude: undefined }))).rejects.toThrow(
      /requires latitude and longitude/,
    );
  });
});
