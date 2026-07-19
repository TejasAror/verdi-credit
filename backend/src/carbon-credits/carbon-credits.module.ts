import { Module } from '@nestjs/common';
import { CarbonCreditsController } from './carbon-credits.controller';
import { CarbonCreditsService } from './carbon-credits.service';
import { SolanaIssuanceService } from './solana-issuance.service';
import { SolanaConfigService } from './solana-config.service';
import { Stage3ToOnchainAdapter } from './adapters/stage3-to-onchain.adapter';
import { VerificationModule } from '../verification/verification.module';

@Module({
  imports: [VerificationModule],
  controllers: [CarbonCreditsController],
  providers: [
    CarbonCreditsService,
    SolanaIssuanceService,
    SolanaConfigService,
    Stage3ToOnchainAdapter,
  ],
  exports: [CarbonCreditsService, SolanaIssuanceService, SolanaConfigService],
})
export class CarbonCreditsModule {}
