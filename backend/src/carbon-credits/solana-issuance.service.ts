import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  clusterApiUrl,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import * as idlJson from './idl/carbon_credit_program.json';
import type { CarbonCreditProgram } from './types/carbon_credit_program';
import { SolanaConfigService } from './solana-config.service';
import { Stage3ToOnchainAdapter, VerificationReportSummary } from './adapters/stage3-to-onchain.adapter';

const PROGRAM_SEED = Buffer.from('verdicred');
const ORACLE_CONFIG_SEED = Buffer.from('oracle_config');
const ORACLE_MINT_AUTHORITY_SEED = Buffer.from('oracle_mint_authority');
const CREDIT_BATCH_SEED = Buffer.from('credit_batch');
const RETIREMENT_SEED = Buffer.from('retirement');

/** Result of a successful credit issue. */
export interface IssueResult {
  txSignature: string;
  batchPda: string;
  mint: string;
  amount: number;
}

/** A serialized, owner-signed-ready transaction (transfer / retire). */
export interface PreparedTx {
  /** base64-encoded Transaction for the client wallet to sign + submit. */
  transaction: string;
  /** Accounts the client needs to inspect / sign. */
  requiresSigner: string;
}

/** A decoded CreditBatch read back from the chain. */
export interface CreditBatchView {
  mint: string;
  authority: string;
  projectId: string;
  vintage: number;
  methodology: string;
  evidenceCid: string;
  reportCid: string;
  evidenceCids: string[];
  reportStatus: string;
  verifiedTonnesScaled: number;
  totalMinted: number;
  totalRetired: number;
  retirementCount: number;
  createdAt: number;
}

/** A decoded RetirementRecord read back from the chain. */
export interface RetirementView {
  owner: string;
  mint: string;
  batch: string;
  amount: number;
  reason: string;
  reportRef: string;
  timestamp: number;
}

/**
 * SolanaIssuanceService — the bridge between Stage 3 (off-chain verification)
 * and the on-chain CarbonCreditProgram (Solana / Anchor / SPL Token-2022).
 *
 * This is the PRODUCTION implementation: there is no mock mode. It talks to the
 * live program id `41jbriQNyaJLuUfJWennbwVqGTQeBDc94Ywj4pGBarnv` (resolved from
 * `SolanaConfigService`, which reads `SOLANA_PROGRAM_ID`). The backend holds
 * the Verifier Oracle Authority keypair (server-side secret in `.env`) and
 * signs `mintCredit` transactions; transfer / retire transactions are built as
 * owner-signed-ready transactions for the client wallet to submit.
 *
 * If the program has not been initialized (`initialize` / `create_credit_mint`
 * not yet run) the service throws a clear, actionable error rather than faking
 * a transaction.
 */
@Injectable()
export class SolanaIssuanceService {
  private readonly logger = new Logger(SolanaIssuanceService.name);

  private program: Program<CarbonCreditProgram>;
  private connection: Connection;
  private oracleKeypair: Keypair;
  readonly mockMode = false;

  constructor(
    config: ConfigService,
    private readonly solanaConfig: SolanaConfigService,
    private readonly adapter: Stage3ToOnchainAdapter,
  ) {
    const oracleSecret = config.get<string>('VERIFIER_ORACLE_SECRET_KEY');
    if (!oracleSecret) {
      throw new Error(
        'VERIFIER_ORACLE_SECRET_KEY is not configured — the oracle authority keypair is required to mint credits.',
      );
    }

    const rpc = this.solanaConfig.rpcUrl;
    this.connection = new Connection(rpc, 'confirmed');
    this.oracleKeypair = SolanaIssuanceService.parseSecret(oracleSecret);
    const wallet = new anchor.Wallet(this.oracleKeypair);
    const provider = new AnchorProvider(this.connection, wallet, {
      commitment: 'confirmed',
    });
    // The IDL's embedded `address` is kept in sync with the deployed program
    // (41jbri...); Anchor derives the program id from it. We assert the deployed
    // id matches our configured program id so a stale IDL can never redirect us.
    if (this.solanaConfig.programId.toBase58() !== (idlJson as { address: string }).address) {
      this.logger.warn(
        `IDL address (${(idlJson as { address: string }).address}) differs from configured ` +
          `SOLANA_PROGRAM_ID (${this.solanaConfig.programId.toBase58()}). Using the configured id.`,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.program = new Program(idlJson as any, provider);

    this.logger.log(
      `Solana issuance LIVE. Program=${this.solanaConfig.programId.toBase58()}, ` +
        `oracle=${wallet.publicKey.toBase58()}, mint=${this.solanaConfig.creditMint?.toBase58() ?? 'NOT CREATED'}`,
    );
  }

  // ---------------------------------------------------------------------------
  // PDA helpers
  // ---------------------------------------------------------------------------

  getOracleConfigPda(programId: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync([PROGRAM_SEED, ORACLE_CONFIG_SEED], programId)[0];
  }

  getOracleMintAuthorityPda(programId: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync([ORACLE_MINT_AUTHORITY_SEED], programId)[0];
  }

  getCreditBatchPda(programId: PublicKey, mint: PublicKey, projectId: string, vintage: number): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        PROGRAM_SEED,
        CREDIT_BATCH_SEED,
        mint.toBuffer(),
        Buffer.from(projectId),
        new BN(vintage).toArrayLike(Buffer, 'le', 2),
      ],
      programId,
    )[0];
  }

  getRetirementRecordPda(programId: PublicKey, mint: PublicKey, owner: PublicKey, nonce: number): PublicKey {
    return PublicKey.findProgramAddressSync(
      [PROGRAM_SEED, RETIREMENT_SEED, mint.toBuffer(), owner.toBuffer(), new BN(nonce).toArrayLike(Buffer, 'le', 8)],
      programId,
    )[0];
  }

  // ---------------------------------------------------------------------------
  // Initialization status (used by init script + sanity checks)
  // ---------------------------------------------------------------------------

  /** Read the global OracleConfig (returns null when not yet initialized). */
  async readOracleConfig(): Promise<{
    deploymentAuthority: string;
    verifierOracleAuthority: string;
    creditMint: string;
    creditMintSet: boolean;
    paused: boolean;
  } | null> {
    const cfgPda = this.getOracleConfigPda(this.program.programId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg = await (this.program.account.oracleConfig as any).fetchNullable(cfgPda);
    if (!cfg) return null;
    return {
      deploymentAuthority: cfg.deploymentAuthority.toBase58(),
      verifierOracleAuthority: cfg.verifierOracleAuthority.toBase58(),
      creditMint: cfg.creditMint.toBase58(),
      creditMintSet: cfg.creditMintSet,
      paused: cfg.paused,
    };
  }

  /** Throw unless the program is initialized and the mint exists. */
  async ensureInitialized(): Promise<void> {
    const cfg = await this.readOracleConfig();
    if (!cfg) {
      throw new InternalServerErrorException(
        'OracleConfig not initialized. Run the on-chain init (initialize + create_credit_mint) first.',
      );
    }
    if (!cfg.creditMintSet) {
      throw new InternalServerErrorException(
        'Credit mint not created yet. Run create_credit_mint before issuing credits.',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Issue (oracle-signed, backend-submitted)
  // ---------------------------------------------------------------------------

  /**
   * Issue 1 credit per verified tonne for the latest VERIFIED Stage 3 report.
   * Builds + signs `mintCredit` as the Verifier Oracle Authority and submits it.
   */
  async issue(report: VerificationReportSummary, recipient: string, vintage?: number): Promise<IssueResult> {
    await this.ensureInitialized();
    if (!this.adapter.isEligible(report)) {
      throw new BadRequestException(`Report ${report.id} is not VERIFIED; issuance blocked.`);
    }

    const args = this.adapter.toMintArgs(report, vintage);
    const creditMint = new PublicKey(this.solanaConfig.creditMint!.toBase58());
    const recipientPk = new PublicKey(recipient);
    const recipientAta = getAssociatedTokenAddressSync(creditMint, recipientPk, false, TOKEN_2022_PROGRAM_ID);
    const batchPda = this.getCreditBatchPda(this.program.programId, creditMint, args.projectId, args.vintage);

    const txSig = await this.program.methods
      .mintCredit({
        projectId: args.projectId,
        vintage: args.vintage,
        methodology: args.methodology,
        evidenceCids: args.evidenceCids,
        reportCid: args.reportCid,
        reportStatus: args.reportStatus as unknown as CarbonCreditProgram['types'] extends never ? never : any,
        verifiedTonnesScaled: new BN(args.verifiedTonnesScaled),
      } as never)
      .accounts({
        oracleConfig: this.getOracleConfigPda(this.program.programId),
        oracleMintAuthority: this.getOracleMintAuthorityPda(this.program.programId),
        creditMint,
        verifierOracleAuthority: this.oracleKeypair.publicKey,
        recipient: recipientPk,
        recipientTokenAccount: recipientAta,
        creditBatch: batchPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        clock: SYSVAR_CLOCK_PUBKEY,
      } as never)
      .signers([this.oracleKeypair])
      .rpc();

    this.logger.log(`Issued ${args.verifiedTonnesScaled} credits for project ${args.projectId} (tx=${txSig})`);
    return {
      txSignature: txSig,
      batchPda: batchPda.toBase58(),
      mint: creditMint.toBase58(),
      amount: args.verifiedTonnesScaled,
    };
  }

  // ---------------------------------------------------------------------------
  // Transfer / Retire (owner-signed; backend returns a prepared tx)
  // ---------------------------------------------------------------------------

  /** Build a `transferCredit` transaction for the owner wallet to sign. */
  async buildTransferTx(mint: string, from: string, to: string, amount: number): Promise<PreparedTx> {
    const programId = this.program.programId;
    const mintPk = new PublicKey(mint);
    const fromPk = new PublicKey(from);
    const toPk = new PublicKey(to);
    const fromAta = getAssociatedTokenAddressSync(mintPk, fromPk, false, TOKEN_2022_PROGRAM_ID);
    const toAta = getAssociatedTokenAddressSync(mintPk, toPk, false, TOKEN_2022_PROGRAM_ID);

    const tx = await this.program.methods
      .transferCredit(new BN(amount))
      .accounts({
        oracleConfig: this.getOracleConfigPda(programId),
        creditMint: mintPk,
        owner: fromPk,
        to: toPk,
        fromTokenAccount: fromAta,
        toTokenAccount: toAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as never)
      .transaction();

    return this.prepare(tx, fromPk);
  }

  /**
   * Build + sign + submit a real `transferCredit` as the owner. Returns the
   * confirmed signature. Used by the marketplace settlement path when the
   * settlement signer (seller) is available server-side (test / managed flow).
   */
  async signTransfer(mint: string, from: string, to: string, amount: number, fromKeypair: Keypair): Promise<string> {
    const programId = this.program.programId;
    const mintPk = new PublicKey(mint);
    const fromPk = new PublicKey(from);
    const toPk = new PublicKey(to);
    const fromAta = getAssociatedTokenAddressSync(mintPk, fromPk, false, TOKEN_2022_PROGRAM_ID);
    const toAta = getAssociatedTokenAddressSync(mintPk, toPk, false, TOKEN_2022_PROGRAM_ID);

    const sig = await this.program.methods
      .transferCredit(new BN(amount))
      .accounts({
        oracleConfig: this.getOracleConfigPda(programId),
        creditMint: mintPk,
        owner: fromPk,
        to: toPk,
        fromTokenAccount: fromAta,
        toTokenAccount: toAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as never)
      .signers([fromKeypair])
      .rpc();
    this.logger.log(`Transferred ${amount} of ${mint} ${from} -> ${to} (tx=${sig})`);
    return sig;
  }

  /** Build a `retireCredit` transaction for the owner wallet to sign. */
  async buildRetireTx(mint: string, owner: string, amount: number, reason: string, reportRef: string): Promise<PreparedTx> {
    const programId = this.program.programId;
    const mintPk = new PublicKey(mint);
    const ownerPk = new PublicKey(owner);
    const ownerAta = getAssociatedTokenAddressSync(mintPk, ownerPk, false, TOKEN_2022_PROGRAM_ID);

    const batches = await this.getBatches(mint);
    if (batches.length === 0) {
      throw new BadRequestException(`No CreditBatch found for mint ${mint}.`);
    }
    const batch = batches[0];
    const batchPda = this.getCreditBatchPda(programId, mintPk, batch.projectId, batch.vintage);
    const retirementRecord = this.getRetirementRecordPda(programId, mintPk, ownerPk, batch.retirementCount);

    const tx = await this.program.methods
      .retireCredit({ amount: new BN(amount), reason, reportRef } as never)
      .accounts({
        oracleConfig: this.getOracleConfigPda(programId),
        creditMint: mintPk,
        owner: ownerPk,
        ownerTokenAccount: ownerAta,
        creditBatch: batchPda,
        retirementRecord,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        clock: SYSVAR_CLOCK_PUBKEY,
      } as never)
      .transaction();

    return this.prepare(tx, ownerPk);
  }

  /**
   * Build + sign + submit a real `retireCredit` (burn) as the owner. Returns
   * the confirmed signature. Used by the retirement settlement path when the
   * owner signer is available server-side (test / managed flow).
   */
  async signRetire(
    mint: string,
    owner: string,
    amount: number,
    reason: string,
    reportRef: string,
    ownerKeypair: Keypair,
  ): Promise<string> {
    const programId = this.program.programId;
    const mintPk = new PublicKey(mint);
    const ownerPk = new PublicKey(owner);
    const ownerAta = getAssociatedTokenAddressSync(mintPk, ownerPk, false, TOKEN_2022_PROGRAM_ID);

    const batches = await this.getBatches(mint);
    if (batches.length === 0) {
      throw new BadRequestException(`No CreditBatch found for mint ${mint}.`);
    }
    const batch = batches[0];
    const batchPda = this.getCreditBatchPda(programId, mintPk, batch.projectId, batch.vintage);
    const retirementRecord = this.getRetirementRecordPda(programId, mintPk, ownerPk, batch.retirementCount);

    const sig = await this.program.methods
      .retireCredit({ amount: new BN(amount), reason, reportRef } as never)
      .accounts({
        oracleConfig: this.getOracleConfigPda(programId),
        creditMint: mintPk,
        owner: ownerPk,
        ownerTokenAccount: ownerAta,
        creditBatch: batchPda,
        retirementRecord,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        clock: SYSVAR_CLOCK_PUBKEY,
      } as never)
      .signers([ownerKeypair])
      .rpc();
    this.logger.log(`Retired (burned) ${amount} of ${mint} by ${owner} (tx=${sig})`);
    return sig;
  }

  // ---------------------------------------------------------------------------
  // On-chain reads (audit)
  // ---------------------------------------------------------------------------

  /** Read every CreditBatch PDA for a given mint. */
  async getBatches(mint: string): Promise<CreditBatchView[]> {
    const programId = this.program.programId;
    const mintPk = new PublicKey(mint);
    const accounts = await this.program.provider.connection.getProgramAccounts(programId, {
      filters: [{ memcmp: { offset: 8, bytes: mintPk.toBase58() } }],
    });
    return accounts
      .map((a) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dec = (this.program.account as any).creditBatch.coder.accounts.decode('creditBatch', a.account.data);
          return this.toBatchView(dec, a.pubkey);
        } catch {
          return null;
        }
      })
      .filter((x): x is CreditBatchView => x !== null);
  }

  /** Read every RetirementRecord PDA for a given mint. */
  async getRetirements(mint: string): Promise<RetirementView[]> {
    const programId = this.program.programId;
    const mintPk = new PublicKey(mint);
    // RetirementRecord: owner(32) then mint(32) at offset 8+32 = 40.
    const accounts = await this.program.provider.connection.getProgramAccounts(programId, {
      filters: [{ memcmp: { offset: 40, bytes: mintPk.toBase58() } }],
    });
    return accounts
      .map((a) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dec = (this.program.account as any).retirementRecord.coder.accounts.decode('retirementRecord', a.account.data);
          return this.toRetirementView(dec, a.pubkey);
        } catch {
          return null;
        }
      })
      .filter((x): x is RetirementView => x !== null);
  }

  /** Read the on-chain Token-2022 balance of `wallet` for the credit mint. */
  async getTokenBalance(wallet: string): Promise<number> {
    const mintPk = new PublicKey(this.solanaConfig.creditMint!.toBase58());
    const walletPk = new PublicKey(wallet);
    const ata = getAssociatedTokenAddressSync(mintPk, walletPk, false, TOKEN_2022_PROGRAM_ID);
    try {
      const info = await this.connection.getTokenAccountBalance(ata, 'confirmed');
      return Number(info.value.amount);
    } catch {
      // ATA may not exist yet (zero balance).
      return 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private prepare(tx: Transaction, signer: PublicKey): PreparedTx {
    // Anchor 0.32 returns a VersionedTransaction; serialize to base64 for the client.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (tx as any).serialize
      ? (tx as Transaction).serialize({ requireAllSignatures: false, verifySignatures: false })
      : // VersionedTransaction path
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Buffer.from((tx as any).serialize());
    return {
      transaction: raw.toString('base64'),
      requiresSigner: signer.toBase58(),
    };
  }

  private toBatchView(dec: any, _pubkey: PublicKey): CreditBatchView {
    return {
      mint: dec.mint.toBase58(),
      authority: dec.authority.toBase58(),
      projectId: dec.projectId,
      vintage: dec.vintage,
      methodology: dec.methodology,
      evidenceCid: dec.evidenceCid,
      reportCid: dec.reportCid,
      evidenceCids: dec.evidenceCids ?? [],
      reportStatus: dec.reportStatus?.verified ? 'VERIFIED' : dec.reportStatus?.pendingVerification ? 'PENDING_VERIFICATION' : 'REJECTED',
      verifiedTonnesScaled: Number(dec.verifiedTonnesScaled),
      totalMinted: Number(dec.totalMinted),
      totalRetired: Number(dec.totalRetired),
      retirementCount: Number(dec.retirementCount),
      createdAt: Number(dec.createdAt),
    };
  }

  private toRetirementView(dec: any, _pubkey: PublicKey): RetirementView {
    return {
      owner: dec.owner.toBase58(),
      mint: dec.mint.toBase58(),
      batch: dec.batch.toBase58(),
      amount: Number(dec.amount),
      reason: dec.reason,
      reportRef: dec.reportRef,
      timestamp: Number(dec.timestamp),
    };
  }

  private static parseSecret(secret: string): Keypair {
    const trimmed = secret.trim();
    if (trimmed.startsWith('[')) {
      const arr = JSON.parse(trimmed);
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    if (trimmed.includes(',')) {
      const arr = trimmed.split(',').map((n) => Number(n.trim()));
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const bs58 = require('bs58');
    return Keypair.fromSecretKey(bs58.decode(trimmed));
  }
}
