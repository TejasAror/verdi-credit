import { Global, Module } from '@nestjs/common';
import { BlockchainIndexerService } from './indexer.service';
import { ExplorerService } from './explorer.service';
import { ExplorerController } from './explorer.controller';

/**
 * ExplorerModule (Stage 7) — Public Transparency Explorer.
 *
 * Wires the Solana blockchain indexer (which continuously synchronizes the
 * VerdiCred Anchor program's on-chain state into Postgres) with the read-only
 * ExplorerService + public REST controller.
 *
 * The indexer depends ONLY on Prisma and config (no oracle-key-dependent
 * service), so it boots and runs independent of the issuance mint signer.
 * ExplorerService is exported so the indexer's snapshot rebuilds can be
 * reused, and so admin tooling can refresh views on demand.
 *
 * `Global` so any other module (admin, docs) can trigger a refresh/resync.
 */
@Global()
@Module({
  controllers: [ExplorerController],
  providers: [BlockchainIndexerService, ExplorerService],
  exports: [ExplorerService, BlockchainIndexerService],
})
export class ExplorerModule {}
