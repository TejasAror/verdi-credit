import { Module } from '@nestjs/common';
import { RetirementController } from './retirement.controller';
import { RetirementService } from './retirement.service';
import { RetirementBlockchainService } from './retirement-blockchain.service';
import { CertificateGeneratorService } from './certificate-generator.service';
import { AuditLogModule } from '../audit-log/audit-log.module';

/**
 * RetirementModule (Stage 6).
 *
 * Wires the retirement controller/service plus the two seams it depends on:
 *  - RetirementBlockchainService — the Solana retirement (burn) seam, mock by
 *    default and real when RETIREMENT_ONCHAIN is configured.
 *  - CertificateGeneratorService — renders + pins the PDF Retirement
 *    Certificate to IPFS (PinataService is @Global, no import needed).
 *
 * PrismaModule is global; AuditLogModule is imported for immutable audit logs.
 */
@Module({
  imports: [AuditLogModule],
  controllers: [RetirementController],
  providers: [
    RetirementService,
    RetirementBlockchainService,
    CertificateGeneratorService,
  ],
  exports: [RetirementService],
})
export class RetirementModule {}
