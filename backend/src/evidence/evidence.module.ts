import { Module } from '@nestjs/common';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';
import { PinataModule } from './pinata/pinata.module';
import { AdapterRegistryService } from './adapters/adapter-registry.service';
import { Sentinel2Adapter } from './adapters/sentinel2.adapter';
import { LandsatAdapter } from './adapters/landsat.adapter';
import { NASAEarthDataAdapter } from './adapters/nasa-earthdata.adapter';
import { OpenWeatherAdapter } from './adapters/openweather.adapter';
import { GeoUploadAdapter } from './adapters/geo-upload.adapter';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [PinataModule, AuditLogModule],
  controllers: [EvidenceController],
  providers: [
    EvidenceService,
    AdapterRegistryService,
    Sentinel2Adapter,
    LandsatAdapter,
    NASAEarthDataAdapter,
    OpenWeatherAdapter,
    GeoUploadAdapter,
  ],
  exports: [EvidenceService],
})
export class EvidenceModule {}
