import { Module } from '@nestjs/common';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';
import { BlockchainService } from './blockchain.service';
import { SellerKeyService } from './seller-key.service';
import { CarbonCreditsModule } from '../carbon-credits/carbon-credits.module';

/**
 * MarketplaceModule (Stage 5).
 *
 * Wires the marketplace controller/service and the BlockchainService seam.
 * CarbonCreditsModule is imported because BlockchainService performs real
 * on-chain `transferCredit` settlements via SolanaIssuanceService, and
 * SellerKeyService provisions + stores the server-side settlement (custody)
 * keypairs used by the Design A buy flow.
 */
@Module({
  imports: [CarbonCreditsModule],
  controllers: [MarketplaceController],
  providers: [MarketplaceService, BlockchainService, SellerKeyService],
  exports: [MarketplaceService, BlockchainService, SellerKeyService],
})
export class MarketplaceModule {}
