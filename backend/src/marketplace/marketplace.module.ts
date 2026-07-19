import { Module } from '@nestjs/common';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';
import { BlockchainService } from './blockchain.service';
import { CarbonCreditsModule } from '../carbon-credits/carbon-credits.module';

/**
 * MarketplaceModule (Stage 5).
 *
 * Wires the marketplace controller/service and the BlockchainService seam.
 * CarbonCreditsModule is imported because BlockchainService now performs real
 * on-chain `transferCredit` settlements via SolanaIssuanceService.
 */
@Module({
  imports: [CarbonCreditsModule],
  controllers: [MarketplaceController],
  providers: [MarketplaceService, BlockchainService],
  exports: [MarketplaceService, BlockchainService],
})
export class MarketplaceModule {}
