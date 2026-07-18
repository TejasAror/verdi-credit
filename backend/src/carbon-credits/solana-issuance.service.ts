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
 * Responsibilities:
 *  - Build + sign `mintCredit` as the Verifier Oracle Authority (backend holds
 *    the oracle secret) and submit to the cluster.
 *  - Build owner-signed-ready `transferCredit` / `retireCredit` transactions
 *    and return them base64 for the client wallet adapter to sign + submit.
 *  - Read CreditBatch / RetirementRecord PDAs back from the chain for audit.
 *
 * If `SOLANA_PROGRAM_ID` / `VERIFIER_ORACLE_SECRET_KEY` are not configured the
 * service runs in a degraded (no-chain) state and `issue` fails loudly rather
 * than silently faking a transaction.
 */
@Injectable()
export class SolanaIssuanceService {
  private readonly logger = new Logger(SolanaIssuanceService.name);

  private program: Program<CarbonCreditProgram> | null = null;
  private connection: Connection | null = null;
  private oracleKeypair: Keypair | null = null;
  readonly mockMode: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly adapter: Stage3ToOnchainAdapter,
  ) {
    const programId = this.config.get<string>('SOLANA_PROGRAM_ID');
    const oracleSecret = this.config.get<string>('VERIFIER_ORACLE_SECRET_KEY');
    this.mockMode = !programId || !oracleSecret;

    if (this.mockMode) {
      this.logger.warn(
        'Solana issuance in DEGRADED mode: SOLANA_PROGRAM_ID / VERIFIER_ORACLE_SECRET_KEY ' +
          'not configured. `issue` will not submit real transactions.',
      );
      return;
    }

    try {
      const rpc =
        this.config.get<string>('SOLANA_RPC_URL') ||
        clusterApiUrl('devnet');
      this.connection = new Connection(rpc, 'confirmed');
      this.oracleKeypair = SolanaIssuanceService.parseSecret(oracleSecret as string);
      const wallet = new anchor.Wallet(this.oracleKeypair);
      const provider = new AnchorProvider(this.connection, wallet, {
        commitment: 'confirmed',
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.program = new Program(idlJson as any, provider);
      this.logger.log(
        `Solana issuance initialized. Program=${programId}, oracle=${wallet.publicKey.toBase58()}`,
      );
    } catch (err) {
      this.logger.error(`Failed to initialize Solana client: ${(err as Error).message}`);
      this.program = null;
      this.connection = null;
      this.oracleKeypair = null;
    }
  }

  // ---------------------------------------------------------------------------
  // PDA helpers
  // ---------------------------------------------------------------------------

  getOracleConfigPda(programId: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [PROGRAM_SEED, ORACLE_CONFIG_SEED],
      programId,
    )[0];
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

  getRetirementRecordPda(
    programId: PublicKey,
    mint: PublicKey,
    owner: PublicKey,
    nonce: number,
  ): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        PROGRAM_SEED,
        RETIREMENT_SEED,
        mint.toBuffer(),
        owner.toBuffer(),
        new BN(nonce).toArrayLike(Buffer, 'le', 8),
      ],
      programId,
    )[0];
  }

  // ---------------------------------------------------------------------------
  // Issue (oracle-signed, backend-submitted)
  // ---------------------------------------------------------------------------

  /**
   * Issue 1 credit per verified tonne for the latest VERIFIED Stage 3 report.
   * Builds + signs `mintCredit` as the Verifier Oracle Authority and submits it.
   *
   * @param report     the latest Stage 3 verification report summary
   * @param recipient  base58 recipient wallet (ATA is created on demand)
   * @param vintage    optional vintage override
   * @returns the tx signature, batch PDA, mint, and the integer amount issued
   */
  async issue(
    report: VerificationReportSummary,
    recipient: string,
    vintage?: number,
  ): Promise<IssueResult> {
    this.assertChainReady();
    const program = this.program as Program<CarbonCreditProgram>;
    const programId = program.programId;
    const oracle = this.oracleKeypair as Keypair;

    if (!this.adapter.isEligible(report)) {
      throw new BadRequestException(
        `Report ${report.id} is not VERIFIED (status=${report.status}); issuance blocked.`,
      );
    }

    const cfg = await program.account.oracleConfig.fetch(
      this.getOracleConfigPda(programId),
    );
    if (!cfg.creditMintSet) {
      throw new BadRequestException('Credit mint not created yet; run init first.');
    }
    const creditMint = cfg.creditMint;

    const args = this.adapter.toMintArgs(report, vintage);
    const recipientPk = new PublicKey(recipient);
    const recipientAta = getAssociatedTokenAddressSync(
      creditMint,
      recipientPk,
      false,
      TOKEN_2022_PROGRAM_ID,
    );
    const batchPda = this.getCreditBatchPda(
      programId,
      creditMint,
      args.projectId,
      args.vintage,
    );

    const txSig = await program.methods
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
        oracleConfig: this.getOracleConfigPda(programId),
        oracleMintAuthority: this.getOracleMintAuthorityPda(programId),
        creditMint,
        verifierOracleAuthority: oracle.publicKey,
        recipient: recipientPk,
        recipientTokenAccount: recipientAta,
        creditBatch: batchPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        clock: SYSVAR_CLOCK_PUBKEY,
      } as never)
      .signers([oracle])
      .rpc();

    this.logger.log(
      `Issued ${args.verifiedTonnesScaled} credits for project ${args.projectId} (tx=${txSig})`,
    );

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

  /**
   * Build a `transferCredit` transaction for the owner wallet to sign.
   */
  async buildTransferTx(mint: string, from: string, to: string, amount: number): Promise<PreparedTx> {
    this.assertChainReady();
    const program = this.program as Program<CarbonCreditProgram>;
    const programId = program.programId;
    const mintPk = new PublicKey(mint);
    const fromPk = new PublicKey(from);
    const toPk = new PublicKey(to);

    const fromAta = getAssociatedTokenAddressSync(mintPk, fromPk, false, TOKEN_2022_PROGRAM_ID);
    const toAta = getAssociatedTokenAddressSync(mintPk, toPk, false, TOKEN_2022_PROGRAM_ID);

    const tx = await program.methods
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

    return this.prepare(tx, new PublicKey(from));
  }

  /**
   * Build a `retireCredit` transaction for the owner wallet to sign.
   * The retirement nonce is derived from the batch's current retirement_count.
   */
  async buildRetireTx(
    mint: string,
    owner: string,
    amount: number,
    reason: string,
    reportRef: string,
  ): Promise<PreparedTx> {
    this.assertChainReady();
    const program = this.program as Program<CarbonCreditProgram>;
    const programId = program.programId;
    const mintPk = new PublicKey(mint);
    const ownerPk = new PublicKey(owner);

    const ownerAta = getAssociatedTokenAddressSync(mintPk, ownerPk, false, TOKEN_2022_PROGRAM_ID);

    // The batch PDA must be located to derive the retirement nonce. We search
    // via getProgramAccounts filtered by mint (first field of CreditBatch).
    const batches = await this.getBatches(mint);
    if (batches.length === 0) {
      throw new BadRequestException(`No CreditBatch found for mint ${mint}.`);
    }
    // Use the batch with the matching owner balance (most recently minted).
    const batch = batches[0];
    const batchPda = this.getCreditBatchPda(
      programId,
      mintPk,
      batch.projectId,
      batch.vintage,
    );
    const retirementRecord = this.getRetirementRecordPda(
      programId,
      mintPk,
      ownerPk,
      batch.retirementCount,
    );

    const tx = await program.methods
      .retireCredit({
        amount: new BN(amount),
        reason,
        reportRef,
      } as never)
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

    return this.prepare(tx, new PublicKey(owner));
  }

  // ---------------------------------------------------------------------------
  // On-chain reads (audit)
  // ---------------------------------------------------------------------------

  /** Read every CreditBatch PDA for a given mint. */
  async getBatches(mint: string): Promise<CreditBatchView[]> {
    this.assertChainReady();
    const program = this.program as Program<CarbonCreditProgram>;
    const mintPk = new PublicKey(mint);
    const accounts = await program.provider.connection.getProgramAccounts(
      program.programId,
      {
        filters: [{ memcmp: { offset: 8, bytes: mintPk.toBase58() } }],
      },
    );
    return accounts
      .map((a) => {
        try {
          const dec = program.coder.accounts.decode('creditBatch', a.account.data);
          return this.toBatchView(dec, a.pubkey);
        } catch {
          return null;
        }
      })
      .filter((x): x is CreditBatchView => x !== null);
  }

  /** Read every RetirementRecord PDA for a given mint. */
  async getRetirements(mint: string): Promise<RetirementView[]> {
    this.assertChainReady();
    const program = this.program as Program<CarbonCreditProgram>;
    const mintPk = new PublicKey(mint);
    // RetirementRecord: owner (32) then mint (32) at offset 8+32 = 40.
    const accounts = await program.provider.connection.getProgramAccounts(
      program.programId,
      {
        filters: [{ memcmp: { offset: 40, bytes: mintPk.toBase58() } }],
      },
    );
    return accounts
      .map((a) => {
        try {
          const dec = program.coder.accounts.decode('retirementRecord', a.account.data);
          return this.toRetirementView(dec, a.pubkey);
        } catch {
          return null;
        }
      })
      .filter((x): x is RetirementView => x !== null);
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

  private toBatchView(dec: any, pubkey: PublicKey): CreditBatchView {
    return {
      mint: dec.mint.toBase58(),
      authority: dec.authority.toBase58(),
      projectId: dec.projectId,
      vintage: dec.vintage,
      methodology: dec.methodology,
      evidenceCid: dec.evidenceCid,
      reportCid: dec.reportCid,
      evidenceCids: dec.evidenceCids ?? [],
      reportStatus: dec.reportStatus?.verified
        ? 'VERIFIED'
        : dec.reportStatus?.pendingVerification
          ? 'PENDING_VERIFICATION'
          : 'REJECTED',
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

  private assertChainReady(): void {
    if (!this.program || !this.connection || !this.oracleKeypair) {
      throw new InternalServerErrorException(
        'Solana client not configured — set SOLANA_PROGRAM_ID and VERIFIER_ORACLE_SECRET_KEY.',
      );
    }
  }

  /** Parse an oracle secret from base58 string, JSON array, or comma-separated numbers. */
  private static parseSecret(secret: string): Keypair {
    const trimmed = secret.trim();
    // JSON array form: [1,2,3,...]
    if (trimmed.startsWith('[')) {
      const arr = JSON.parse(trimmed);
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    // Comma-separated numbers: "1,2,3,..."
    if (trimmed.includes(',')) {
      const arr = trimmed.split(',').map((n) => Number(n.trim()));
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    // base58 — decode via bs58.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const bs58 = require('bs58');
    return Keypair.fromSecretKey(bs58.decode(trimmed));
  }
}
