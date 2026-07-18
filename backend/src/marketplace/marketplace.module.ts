import { Module } from '@nestjs/common';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';
import { BlockchainService } from './blockchain.service';

/**
 * MarketplaceModule (Stage 5).
 *
 * Wires the marketplace controller/service and the BlockchainService seam.
 * PrismaModule is global; ConfigModule is global (see AppModule). When the
 * Stage 4 program is deployed, only BlockchainService changes — this module,
 * the controller, and the service stay the same.
 */
@Module({
  controllers: [MarketplaceController],
  providers: [MarketplaceService, BlockchainService],
  exports: [MarketplaceService, BlockchainService],
})
export class MarketplaceModule {}
