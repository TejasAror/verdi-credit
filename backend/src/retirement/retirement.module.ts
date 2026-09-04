import { Module } from '@nestjs/common';
import { RetirementController } from './retirement.controller';
import { RetirementService } from './retirement.service';
import { RetirementBlockchainService } from './retirement-blockchain.service';
import { CertificateGeneratorService } from './certificate-generator.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { CarbonCreditsModule } from '../carbon-credits/carbon-credits.module'; // <-- ADD

@Module({
  imports: [
    AuditLogModule,
    CarbonCreditsModule, // <-- ADD
  ],
  controllers: [RetirementController],
  providers: [
    RetirementService,
    RetirementBlockchainService,
    CertificateGeneratorService,
  ],
  exports: [RetirementService],
})
export class RetirementModule {}