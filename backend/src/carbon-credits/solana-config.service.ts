import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublicKey } from '@solana/web3.js';

/**
 * SolanaConfigService — single source of truth for the on-chain VerdiCred
 * deployment. Every Solana-touching service resolves its program id, credit
 * mint, cluster and RPC from here so there is exactly ONE place that decides
 * which deployed program the backend talks to.
 *
 * Program id precedence:
 *   1. SOLANA_PROGRAM_ID from the environment (the live deployed program).
 *   2. The `address` embedded in the IDL (kept in sync, but env wins).
 *
 * Because the deployed program is `41jbriQNyaJLuUfJWennbwVqGTQeBDc94Ywj4pGBarnv`
 * and the historical IDL shipped with a stale `address`, the env value always
 * wins. See END_TO_END_WORKFLOW.md for the full authority analysis.
 */
@Injectable()
export class SolanaConfigService {
  /** The deployed VerdiCred program id. */
  readonly programId: PublicKey;
  /** The SPL Token-2022 mint for carbon credits (set once `create_credit_mint` runs). */
  readonly creditMint: PublicKey | null;
  /** Solana cluster name used to build explorer URLs. */
  readonly cluster: string;
  /** RPC endpoint (defaults to devnet). */
  readonly rpcUrl: string;
  /** True once a live program id + (optionally) a mint are configured. */
  readonly onChainEnabled: boolean;

  constructor(private readonly config: ConfigService) {
    const envProgram = this.config.get<string>('SOLANA_PROGRAM_ID');
    const idlProgram = this.config.get<string>('SOLANA_IDL_PROGRAM_ID');
    const programStr = envProgram || idlProgram;
    if (!programStr) {
      throw new Error(
        'SOLANA_PROGRAM_ID is not configured — the VerdiCred backend cannot run without the deployed program.',
      );
    }
    this.programId = new PublicKey(programStr);

    const mintStr = this.config.get<string>('VERDICRED_CREDIT_MINT');
    this.creditMint = mintStr ? new PublicKey(mintStr) : null;

    this.cluster = this.config.get<string>('SOLANA_CLUSTER', 'devnet');
    this.rpcUrl =
      this.config.get<string>('SOLANA_RPC_URL') ||
      (this.cluster === 'mainnet-beta'
        ? 'https://api.mainnet-beta.solana.com'
        : this.cluster === 'testnet'
          ? 'https://api.testnet.solana.com'
          : 'https://api.devnet.solana.com');

    this.onChainEnabled = true;
  }

  /** Build a Solana Explorer URL for a transaction signature. */
  explorerTx(signature: string): string {
    return `https://explorer.solana.com/tx/${signature}?cluster=${this.cluster}`;
  }

  /** Build a Solana Explorer URL for an account (mint / PDA). */
  explorerAccount(address: string): string {
    return `https://explorer.solana.com/address/${address}?cluster=${this.cluster}`;
  }
}
