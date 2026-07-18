import { AdapterRegistryService } from './adapter-registry.service';
import { Sentinel2Adapter } from './sentinel2.adapter';
import { LandsatAdapter } from './landsat.adapter';
import { NASAEarthDataAdapter } from './nasa-earthdata.adapter';
import { OpenWeatherAdapter } from './openweather.adapter';
import { GeoUploadAdapter } from './geo-upload.adapter';
import { EvidenceSource } from '@prisma/client';

describe('AdapterRegistryService', () => {
  let registry: AdapterRegistryService;

  beforeEach(() => {
    registry = new AdapterRegistryService(
      new Sentinel2Adapter(),
      new LandsatAdapter(),
      new NASAEarthDataAdapter({ get: () => undefined } as any),
      new OpenWeatherAdapter({ get: () => undefined } as any),
      new GeoUploadAdapter(),
    );
  });

  it('registers all five source adapters on construction', () => {
    expect(registry.list().sort()).toEqual(
      [
        EvidenceSource.SENTINEL2,
        EvidenceSource.LANDSAT,
        EvidenceSource.NASA_EARTHDATA,
        EvidenceSource.OPENWEATHER,
        EvidenceSource.GEO_UPLOAD,
      ].sort(),
    );
  });

  it('resolves the correct adapter per source', () => {
    expect(registry.get(EvidenceSource.SENTINEL2)).toBeInstanceOf(Sentinel2Adapter);
    expect(registry.get(EvidenceSource.GEO_UPLOAD)).toBeInstanceOf(GeoUploadAdapter);
    expect(registry.get(EvidenceSource.OPENWEATHER)).toBeInstanceOf(OpenWeatherAdapter);
  });

  it('throws for an unregistered source', () => {
    // Cast to any because an arbitrary string is not a valid enum at compile time.
    expect(() => registry.get('UNKNOWN_SOURCE' as EvidenceSource)).toThrow(
      /No adapter registered/,
    );
  });
});
