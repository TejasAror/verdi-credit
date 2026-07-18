import { Injectable, Logger } from '@nestjs/common';
import { EvidenceSource } from '@prisma/client';
import { EvidenceAdapter } from './evidence-adapter.interface';
import { Sentinel2Adapter } from './sentinel2.adapter';
import { LandsatAdapter } from './landsat.adapter';
import { NASAEarthDataAdapter } from './nasa-earthdata.adapter';
import { OpenWeatherAdapter } from './openweather.adapter';
import { GeoUploadAdapter } from './geo-upload.adapter';

/**
 * Resolves the correct {@link EvidenceAdapter} for a given source type.
 * Adapters are injected via Nest DI and registered in a lookup map.
 */
@Injectable()
export class AdapterRegistryService {
  private readonly logger = new Logger(AdapterRegistryService.name);
  private readonly registry = new Map<EvidenceSource, EvidenceAdapter>();

  constructor(
    private readonly sentinel2: Sentinel2Adapter,
    private readonly landsat: LandsatAdapter,
    private readonly nasa: NASAEarthDataAdapter,
    private readonly openWeather: OpenWeatherAdapter,
    private readonly geoUpload: GeoUploadAdapter,
  ) {
    this.register(this.sentinel2);
    this.register(this.landsat);
    this.register(this.nasa);
    this.register(this.openWeather);
    this.register(this.geoUpload);
  }

  private register(adapter: EvidenceAdapter) {
    this.registry.set(adapter.source, adapter);
    this.logger.log(`Registered evidence adapter: ${adapter.source}`);
  }

  get(source: EvidenceSource): EvidenceAdapter {
    const adapter = this.registry.get(source);
    if (!adapter) {
      throw new Error(`No adapter registered for source "${source}".`);
    }
    return adapter;
  }

  list(): EvidenceSource[] {
    return Array.from(this.registry.keys());
  }
}
