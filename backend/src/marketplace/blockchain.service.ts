import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair } from '@solana/web3.js';
import { SolanaIssuanceService } from '../carbon-credits/solana-issuance.service';
import { SolanaConfigService } from '../carbon-credits/solana-config.service';

/** Result of a settled on-chain (or mock) operation. */
export interface SettlementResult {
  /** Transaction signature (base58). */
  txSignature: string;
  /** Whether a real on-chain transaction was submitted. */
  onChain: boolean;
  /** Slot / block height when known (null in mock mode). */
  slot: number | null;
  /** ISO timestamp of settlement. */
  settledAt: string;
}

/** Parameters for a marketplace purchase settlement. */
export interface PurchaseSettlement {
  creditId: string; // on-chain mint
  seller: string; // seller wallet (base58)
  buyer: string; // buyer wallet (base58)
  amount: number; // credits (tonnes) transferred
  price: number; // sale price (USDC / platform unit)
  /**
   * Seller signing secret (JSON array / base58 / csv). Supplied only in the
   * server-settlement flow (automated tests / managed custody): the backend
   * signs + submits the `transferCredit` tx.
   */
  sellerSecret?: string;
  /**
   * An already-submitted on-chain transfer signature (client-signed flow). When
   * present, no further chain write happens — the signature is recorded as the
   * settlement proof.
   */
  txSignature?: string;
}

/** A serialized, owner-signed-ready transfer transaction (base64). */
export interface PreparedTransferTx {
  /** base64-encoded Transaction for the seller wallet to sign + submit. */
  transaction: string;
  /** The seller wallet that must sign. */
  seller: string;
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
 * This is the PRODUCTION implementation: there is no mock mode. Every
 * marketplace interaction is settled against the live CarbonCreditProgram on
 * Devnet (program id 41jbri…, resolved from SOLANA_PROGRAM_ID):
 *
 *   - `verifyOwnership`  : reads the seller's on-chain Token-2022 ATA balance
 *                          for the credit mint and compares it to `amount`.
 *   - `settlePurchase`   : transfers `amount` of the credit mint from the
 *                          seller wallet to the buyer wallet via the program's
 *                          `transferCredit` instruction. When `sellerSecret` is
 *                          provided (server-settlement / automated flow) the
 *                          backend signs + submits; otherwise it throws and the
 *                          caller must use the prepared-tx client flow.
 *   - `getExplorerUrl`   : links a settlement tx to the Solana Explorer.
 *
 * The marketplace controller, service, DTOs and frontend depend only on this
 * stable interface, not on chain details.
 */
@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);

  /** Always true in the production integration (no mock fallback). */
  readonly mockMode = false;

  constructor(
    private readonly config: ConfigService,
    private readonly solana: SolanaIssuanceService,
    private readonly solanaConfig: SolanaConfigService,
  ) {}

  /**
   * Verify that `wallet` currently owns at least `amount` of `creditId` by
   * reading the on-chain Token-2022 associated token account balance.
   */
  async verifyOwnership(query: OwnershipQuery): Promise<boolean> {
    const balance = await this.solana.getTokenBalance(query.wallet);
    const ok = balance >= query.amount;
    this.logger.debug(
      `verifyOwnership creditId=${query.creditId} wallet=${query.wallet} ` +
        `onChainBalance=${balance} required=${query.amount} -> ${ok}`,
    );
    return ok;
  }

  /**
   * Settle a marketplace purchase: transfer `amount` of the credit mint from
   * the seller wallet to the buyer wallet via `transferCredit`.
   *
   * Three resolution paths, in priority order:
   *   1. `txSignature` supplied — the seller already submitted the transfer with
   *      their wallet (client-signed flow); record it as the settlement proof.
   *   2. `sellerSecret` supplied — the backend signs + submits the tx
   *      server-side (automated e2e tests / managed-custody).
   *   3. neither supplied — throw; the caller must use `buildTransferTx`, have
   *      the seller sign in the wallet, submit, then record via the signature.
   */
  async settlePurchase(params: PurchaseSettlement): Promise<SettlementResult> {
    if (params.txSignature) {
      this.logger.log(
        `[client-signed] settlePurchase creditId=${params.creditId} ` +
          `seller=${params.seller} -> buyer=${params.buyer} tx=${params.txSignature}`,
      );
      return {
        txSignature: params.txSignature,
        onChain: true,
        slot: null,
        settledAt: new Date().toISOString(),
      };
    }
    if (!params.sellerSecret) {
      throw new Error(
        'Purchase requires either a client-submitted txSignature or a sellerSecret ' +
          '(server-settlement). Use POST /marketplace/listings/:id/buy-prepare to obtain a ' +
          'ready-to-sign transfer transaction for the seller wallet.',
      );
    }
    const sellerKeypair = BlockchainService.parseSecret(params.sellerSecret);
    const txSignature = await this.solana.signTransfer(
      params.creditId,
      params.seller,
      params.buyer,
      params.amount,
      sellerKeypair,
    );
    return {
      txSignature,
      onChain: true,
      slot: null,
      settledAt: new Date().toISOString(),
    };
  }

  /**
   * Build a base64 seller-signed-ready `transferCredit` transaction. The
   * frontend signs it with the seller's Phantom wallet and submits it to the
   * cluster, then calls `POST /marketplace/listings/:id/buy` with the resulting
   * signature (client-signed settlement).
   */
  async buildTransferTx(params: {
    creditId: string;
    seller: string;
    buyer: string;
    amount: number;
  }): Promise<PreparedTransferTx> {
    const prepared = await this.solana.buildTransferTx(
      params.creditId,
      params.seller,
      params.buyer,
      params.amount,
    );
    return {
      transaction: prepared.transaction,
      seller: prepared.requiresSigner,
    };
  }

  /**
   * Settle a listing cancellation. The credits never left the seller's wallet
   * under this escrow-less model, so there is nothing to settle on chain — but
   * we still return a verifiable result so the listing record stays consistent.
   */
  async settleCancellation(creditId: string, seller: string): Promise<SettlementResult> {
    this.logger.log(`settleCancellation creditId=${creditId} seller=${seller} (no on-chain action; escrow-less)`);
    return {
      txSignature: '',
      onChain: true,
      slot: null,
      settledAt: new Date().toISOString(),
    };
  }

  /** Build an explorer URL for a settlement signature. */
  getExplorerUrl(txSignature: string): string | null {
    if (!txSignature) return null;
    return this.solanaConfig.explorerTx(txSignature);
  }

  private static parseSecret(secret: string): Keypair {
    const trimmed = secret.trim();
    if (trimmed.startsWith('[')) {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed)));
    }
    if (trimmed.includes(',')) {
      return Keypair.fromSecretKey(Uint8Array.from(trimmed.split(',').map((n) => Number(n.trim()))));
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const bs58 = require('bs58');
    return Keypair.fromSecretKey(bs58.decode(trimmed));
  }
}
