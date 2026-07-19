import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair } from '@solana/web3.js';
import { SolanaIssuanceService } from '../carbon-credits/solana-issuance.service';
import { SolanaConfigService } from '../carbon-credits/solana-config.service';

/**
 * Result of a retirement (burn) operation submitted to the chain.
 */
export interface RetirementSettlement {
  /** Transaction signature (base58). */
  txSignature: string;
  /** Whether a real on-chain transaction was submitted (always true here). */
  onChain: boolean;
  /** Slot / block height when known (null until confirmed). */
  slot: number | null;
  /** ISO timestamp of the retirement. */
  retiredAt: string;
}

/** A serialized, owner-signed-ready burn transaction (base64). */
export interface PreparedRetireTx {
  /** base64-encoded Transaction for the owner wallet to sign + submit. */
  transaction: string;
  /** The owner wallet that must sign. */
  owner: string;
}

/**
 * Parameters describing a credit retirement to persist on-chain.
 */
export interface RetirementParams {
  /** On-chain credit mint (base58). */
  tokenMint: string;
  /** Owner wallet (base58) authorizing the retirement — must sign in real mode. */
  walletAddress: string;
  /** Number of credits (tonnes) to retire (burn / lock). */
  amount: number;
  /** Mandatory human-readable retirement reason. */
  reason: string;
  /** Reference to the originating verification report CID (optional). */
  reportRef?: string;
  /**
   * Owner signing secret (JSON array / base58 / csv). Supplied only in the
   * server-settlement flow (automated e2e tests / managed custody) where the
   * backend signs + submits the burn transaction. When `txSignature` is
   * supplied instead, the burn was already submitted client-side and we only
   * record it. When neither is supplied, callers must use `buildRetireTx`.
   */
  ownerSecret?: string;
  /**
   * A real on-chain burn signature submitted by the owner's wallet
   * (client-signed flow). When present, no further chain write happens — the
   * signature is recorded as the settlement proof.
   */
  txSignature?: string;
}

/**
 * RetirementBlockchainService — the single seam between the retirement module
 * and Solana.
 *
 * This is the PRODUCTION implementation: there is no mock mode. Every
 * retirement is settled against the live CarbonCreditProgram on Devnet (program
 * id 41jbri…, resolved from `SOLANA_PROGRAM_ID` via `SolanaConfigService`):
 *
 *   - `retireCredits` : burn/lock `amount` of `tokenMint` owned by
 *                       `walletAddress` and return the confirmed signature.
 *                       When `ownerSecret` is provided the backend signs +
 *                       submits (server-settlement / automated e2e / managed
 *                       custody). Otherwise it throws and the caller must use
 *                       the `buildRetireTx` → client-signed → signature flow.
 *   - `buildRetireTx` : build a base64 transfer-ready `retireCredit`
 *                       transaction for the owner wallet to sign in the
 *                       browser (Phantom) and submit to the cluster.
 *
 * The controller, service, DTOs and frontend depend only on this stable
 * interface, not on chain details.
 */
@Injectable()
export class RetirementBlockchainService {
  private readonly logger = new Logger(RetirementBlockchainService.name);

  /** Always true in the production integration (no mock fallback). */
  readonly mockMode = false;

  constructor(
    private readonly config: ConfigService,
    private readonly solana: SolanaIssuanceService,
    private readonly solanaConfig: SolanaConfigService,
  ) {
    this.logger.log(
      `RetirementBlockchainService LIVE (program=${this.solanaConfig.programId.toBase58()}, ` +
        `mint=${this.solanaConfig.creditMint?.toBase58() ?? 'NOT SET'}).`,
    );
  }

  /**
   * Retire (burn / lock) `amount` of `tokenMint` held by `walletAddress`.
   *
   * Three resolution paths, in priority order:
   *   1. `txSignature` supplied — the owner already submitted the burn with
   *      their wallet (client-signed flow); record it as the settlement proof.
   *   2. `ownerSecret` supplied — sign + submit the `retireCredit` instruction
   *      as the owner (server-settlement: automated e2e / managed custody).
   *   3. neither supplied — throw; the caller must use `buildRetireTx`, have the
   *      owner sign in the wallet, submit, and then call with `txSignature`.
   */
  async retireCredits(params: RetirementParams): Promise<RetirementSettlement> {
    if (params.txSignature) {
      // Client-signed settlement: the burn is already on chain.
      this.logger.log(
        `[client-signed] retireCredits tokenMint=${params.tokenMint} ` +
          `wallet=${params.walletAddress} amount=${params.amount} tx=${params.txSignature}`,
      );
      return {
        txSignature: params.txSignature,
        onChain: true,
        slot: null,
        retiredAt: new Date().toISOString(),
      };
    }
    if (!params.ownerSecret) {
      throw new Error(
        'Retirement requires either a client-submitted txSignature or an ownerSecret ' +
          '(server-settlement). Use POST /retirements/prepare to obtain a ready-to-sign ' +
          'transaction for the owner wallet.',
      );
    }
    const ownerKeypair = RetirementBlockchainService.parseSecret(params.ownerSecret);
    const txSignature = await this.solana.signRetire(
      params.tokenMint,
      params.walletAddress,
      params.amount,
      params.reason,
      params.reportRef ?? '',
      ownerKeypair,
    );
    return {
      txSignature,
      onChain: true,
      slot: null,
      retiredAt: new Date().toISOString(),
    };
  }

  /**
   * Build a base64 owner-signed-ready `retireCredit` (burn) transaction. The
   * frontend signs it with the owner's Phantom wallet and submits it to the
   * cluster, then calls `POST /retirements` with the resulting signature.
   */
  async buildRetireTx(params: RetirementParams): Promise<PreparedRetireTx> {
    const prepared = await this.solana.buildRetireTx(
      params.tokenMint,
      params.walletAddress,
      params.amount,
      params.reason,
      params.reportRef ?? '',
    );
    return {
      transaction: prepared.transaction,
      owner: prepared.requiresSigner,
    };
  }

  /** Build an explorer URL for a retirement signature. */
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
