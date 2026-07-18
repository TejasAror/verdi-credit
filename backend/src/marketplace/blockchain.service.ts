import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

/**
 * Result of a settled on-chain (or mock) operation.
 */
export interface SettlementResult {
  /** Transaction signature (base58-ish). Mock signatures are prefixed `mock_`. */
  txSignature: string;
  /** Whether a real on-chain transaction was submitted (false in mock mode). */
  onChain: boolean;
  /** Slot / block height when known (null in mock mode). */
  slot: number | null;
  /** ISO timestamp of settlement. */
  settledAt: string;
}

/** Parameters for a marketplace purchase settlement. */
export interface PurchaseSettlement {
  creditId: string; // on-chain mint / batch id
  seller: string; // seller wallet (base58)
  buyer: string; // buyer wallet (base58)
  amount: number; // credits (tonnes) transferred
  price: number; // sale price (USDC / platform unit)
}

/** Parameters for verifying a wallet owns a credit before listing. */
export interface OwnershipQuery {
  creditId: string;
  wallet: string;
  amount: number;
}

/**
 * BlockchainService — the single seam between the marketplace and Solana.
 *
 * Stage 5 ships a MOCK implementation so the marketplace works end-to-end
 * without the Stage 4 program being deployed. Every blockchain interaction the
 * marketplace needs is funneled through this service:
 *
 *   - `verifyOwnership`  : does `wallet` hold `amount` of `creditId`?
 *   - `settlePurchase`   : transfer credits seller → buyer + settle payment.
 *   - `getExplorerUrl`   : link a settlement tx to an explorer.
 *
 * When the Stage 4 program is deployed, ONLY this class changes: the mock
 * bodies are replaced with real SPL Token-2022 transfer + settlement calls
 * (reusing the PDA / oracle plumbing already in SolanaIssuanceService). The
 * marketplace controller, service, DTOs and the entire frontend remain
 * untouched because they depend on this stable interface, not on chain details.
 *
 * Mock vs real is selected by `MARKETPLACE_ONCHAIN=true` + a configured
 * `SOLANA_PROGRAM_ID`. Absent those, the service stays in mock mode and logs a
 * clear warning so nobody mistakes a mock signature for a real settlement.
 */
@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);

  /** True when running the mock settlement layer (no real chain writes). */
  readonly mockMode: boolean;

  constructor(private readonly config: ConfigService) {
    const onChain =
      this.config.get<string>('MARKETPLACE_ONCHAIN', 'false') === 'true';
    const programId = this.config.get<string>('SOLANA_PROGRAM_ID');
    this.mockMode = !onChain || !programId;

    if (this.mockMode) {
      this.logger.warn(
        'BlockchainService running in MOCK mode: marketplace settlements are ' +
          'simulated (no real SPL Token-2022 transfer). Set MARKETPLACE_ONCHAIN=true ' +
          'and SOLANA_PROGRAM_ID to enable on-chain settlement once Stage 4 is deployed.',
      );
    } else {
      this.logger.log(
        `BlockchainService ready for on-chain settlement (program=${programId}).`,
      );
    }
  }

  /**
   * Verify that `wallet` currently owns at least `amount` of `creditId`.
   *
   * MOCK: always returns true (any wallet may list). REAL: read the owner's
   * Token-2022 associated token account balance for the mint and compare.
   */
  async verifyOwnership(query: OwnershipQuery): Promise<boolean> {
    if (this.mockMode) {
      this.logger.debug(
        `[mock] verifyOwnership creditId=${query.creditId} wallet=${query.wallet} amount=${query.amount} -> true`,
      );
      return true;
    }
    // REAL implementation (Stage 4 deployed) — replace mock above:
    //   const ata = getAssociatedTokenAddressSync(mintPk, walletPk, false, TOKEN_2022_PROGRAM_ID);
    //   const bal = await connection.getTokenAccountBalance(ata);
    //   return Number(bal.value.amount) >= query.amount;
    throw new Error('On-chain verifyOwnership not yet implemented.');
  }

  /**
   * Settle a marketplace purchase: transfer `amount` of `creditId` from the
   * seller wallet to the buyer wallet and settle the `price` payment.
   *
   * MOCK: returns a synthetic settlement result immediately. REAL: build,
   * (oracle- or buyer-) sign and submit the Token-2022 transfer + payment
   * transaction, then return the confirmed signature + slot.
   */
  async settlePurchase(params: PurchaseSettlement): Promise<SettlementResult> {
    if (this.mockMode) {
      const txSignature = `mock_${randomBytes(24).toString('hex')}`;
      this.logger.log(
        `[mock] settlePurchase creditId=${params.creditId} ` +
          `${params.seller} -> ${params.buyer} amount=${params.amount} ` +
          `price=${params.price} tx=${txSignature}`,
      );
      return {
        txSignature,
        onChain: false,
        slot: null,
        settledAt: new Date().toISOString(),
      };
    }
    // REAL implementation (Stage 4 deployed) — replace mock above:
    //   const tx = await program.methods.transferCredit(new BN(params.amount))...
    //   const sig = await sendAndConfirm(tx);
    //   return { txSignature: sig, onChain: true, slot, settledAt };
    throw new Error('On-chain settlePurchase not yet implemented.');
  }

  /**
   * Settle a listing cancellation. In mock mode this is a no-op record; in the
   * real implementation there is typically nothing to settle on chain for a
   * cancel (the credits never left the seller's wallet under an escrow-less
   * model), but the hook exists for escrow-based designs.
   */
  async settleCancellation(creditId: string, seller: string): Promise<SettlementResult> {
    if (this.mockMode) {
      const txSignature = `mock_cancel_${randomBytes(16).toString('hex')}`;
      this.logger.log(
        `[mock] settleCancellation creditId=${creditId} seller=${seller} tx=${txSignature}`,
      );
      return {
        txSignature,
        onChain: false,
        slot: null,
        settledAt: new Date().toISOString(),
      };
    }
    // REAL: release escrow / close listing PDA if an escrow model is used.
    return {
      txSignature: '',
      onChain: true,
      slot: null,
      settledAt: new Date().toISOString(),
    };
  }

  /** Build an explorer URL for a settlement signature (null for mock txs). */
  getExplorerUrl(txSignature: string): string | null {
    if (!txSignature || txSignature.startsWith('mock')) return null;
    const cluster = this.config.get<string>('SOLANA_CLUSTER', 'devnet');
    return `https://explorer.solana.com/tx/${txSignature}?cluster=${cluster}`;
  }
}
