import { Module } from '@nestjs/common';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { NdviService } from './services/ndvi.service';
import { CarbonEstimationService } from './services/carbon-estimation.service';
import { AnomalyDetectionService } from './services/anomaly-detection.service';
import { ReportGeneratorService } from './report/report-generator.service';
import { EvidenceModule } from '../evidence/evidence.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [EvidenceModule, AuditLogModule],
  controllers: [VerificationController],
  providers: [
    VerificationService,
    NdviService,
    CarbonEstimationService,
    AnomalyDetectionService,
    ReportGeneratorService,
  ],
  exports: [VerificationService],
})
export class VerificationModule {}
