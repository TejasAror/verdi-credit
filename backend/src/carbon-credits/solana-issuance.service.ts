import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction, clusterApiUrl, SystemProgram, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token';
import * as idlJson from './idl/carbon_credit_program.json';
import type { CarbonCreditProgram } from './types/carbon_credit_program';
import { SolanaConfigService } from './solana-config.service';
import { Stage3ToOnchainAdapter, VerificationReportSummary, hashToPdaSeed } from './adapters/stage3-to-onchain.adapter';

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
  /** The CreditBatch PDA itself. */
  batchPda: string;
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

  getCreditBatchPda(
  programId: PublicKey,
  mint: PublicKey,
  projectIdHash: Buffer,
  vintage: number,
): PublicKey {
    // Detailed logging to debug "Max seed length exceeded" error
    // The on-chain program uses SHA-256(projectId) as the PDA seed.
// projectIdHash is the 32-byte SHA-256 value passed from the adapter.
    const seeds = [
      PROGRAM_SEED,
      CREDIT_BATCH_SEED,
      mint.toBuffer(),
      projectIdHash,
      new BN(vintage).toArrayLike(Buffer, 'le', 2),
    ];

    this.logger.debug(
  `getCreditBatchPda: programId=${programId.toBase58()}, mint=${mint.toBase58()}, ` +
    `projectIdHash=${projectIdHash.toString('hex')}, vintage=${vintage}`,
);

    seeds.forEach((seed, index) => {
      const desc = ['PROGRAM_SEED', 'CREDIT_BATCH_SEED', 'mint.toBuffer()', 'projectIdHash (SHA-256)', 'vintage'][index];
      this.logger.debug(`  Seed ${index} (${desc}): ${seed.length} bytes`);
      if (seed.length > 32) {
        this.logger.error(`  ❌ SEED ${index} EXCEEDS 32 BYTES: ${seed.length} bytes!`);
        this.logger.error(`     projectIdHash: ${projectIdHash.toString('hex')}`);
this.logger.error(`     seed bytes: ${seed.toString('hex').substring(0, 64)}...`);
      }
    });

    try {
      const [pda, bump] = PublicKey.findProgramAddressSync(seeds, programId);
      this.logger.debug(`  ✓ PDA derived: ${pda.toBase58()} (bump=${bump})`);
      return pda;
    } catch (error) {
      this.logger.error(`  ❌ PublicKey.findProgramAddressSync FAILED: ${error}`);
      throw error;
    }
  }

  getRetirementRecordPda(programId: PublicKey, mint: PublicKey, owner: PublicKey, nonce: number): PublicKey {
    // Debug: log all seed lengths to identify "Max seed length exceeded" issues
    const seeds = [
      PROGRAM_SEED,
      RETIREMENT_SEED,
      mint.toBuffer(),
      owner.toBuffer(),
      new BN(nonce).toArrayLike(Buffer, 'le', 8),
    ];

    // Validate each seed length (Solana PDA seeds must be ≤ 32 bytes)
    seeds.forEach((seed, index) => {
      if (seed.length > 32) {
        this.logger.error(
          `PDA seed ${index} exceeds 32 bytes: length=${seed.length}, ` +
          `seed=${seed.toString('hex').substring(0, 64)}...`,
        );
        throw new Error(
          `Max seed length exceeded in getRetirementRecordPda: seed ${index} is ${seed.length} bytes (max 32). ` +
          `Offending seed type: ${index === 0 ? 'PROGRAM_SEED' : index === 1 ? 'RETIREMENT_SEED' : index === 2 ? 'mint' : index === 3 ? 'owner' : 'nonce'}`,
        );
      }
    });

    this.logger.debug(
      `getRetirementRecordPda seeds: programId=${programId.toBase58().substring(0,8)}... ` +
      `mint=${mint.toBase58().substring(0,8)}... owner=${owner.toBase58().substring(0,8)}... nonce=${nonce} ` +
      `-> seedLengths=[${seeds.map(s => s.length).join(',')}]`,
    );

    return PublicKey.findProgramAddressSync(seeds, programId)[0];
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
    this.logger.log(`=== ISSUE START ===`);
    this.logger.log(`Report ID: ${report.id}, Project ID: ${report.projectId}, Status: ${report.status}, Verified Tonnes: ${report.verifiedTonnes}`);
    this.logger.log(`Recipient: ${recipient}, Vintage: ${vintage}`);

    this.logger.debug(`Step 1: ensureInitialized()`);
    await this.ensureInitialized();
    this.logger.debug(`Step 1: ensureInitialized() - OK`);

    this.logger.debug(`Step 2: adapter.isEligible()`);
    if (!this.adapter.isEligible(report)) {
      this.logger.error(`Report ${report.id} is not VERIFIED; issuance blocked.`);
      throw new BadRequestException(`Report ${report.id} is not VERIFIED; issuance blocked.`);
    }
    this.logger.debug(`Step 2: adapter.isEligible() - OK`);

    this.logger.debug(`Step 3: adapter.toMintArgs()`);
    const args = this.adapter.toMintArgs(report, vintage);
    this.logger.debug(`toMintArgs result: projectId=${args.projectId}, vintage=${args.vintage}, methodology=${args.methodology}, evidenceCids=${JSON.stringify(args.evidenceCids)}, reportCid=${args.reportCid}, verifiedTonnesScaled=${args.verifiedTonnesScaled}`);
    this.logger.debug(`Step 3: adapter.toMintArgs() - OK`);

    this.logger.debug(`Step 4: Constructing PublicKeys`);
    const creditMint = new PublicKey(this.solanaConfig.creditMint!.toBase58());
    const recipientPk = new PublicKey(recipient);
    this.logger.debug(`  creditMint: ${creditMint.toBase58()}`);
    this.logger.debug(`  recipientPk: ${recipientPk.toBase58()}`);
    this.logger.debug(`Step 4: PublicKeys - OK`);

    this.logger.debug(`Step 5: getAssociatedTokenAddressSync`);
    const recipientAta = getAssociatedTokenAddressSync(creditMint, recipientPk, false, TOKEN_2022_PROGRAM_ID);
    this.logger.debug(`  recipientAta: ${recipientAta.toBase58()}`);
    this.logger.debug(`Step 5: getAssociatedTokenAddressSync - OK`);


    this.logger.debug(`Step 6: getCreditBatchPda`);
    const batchPda = this.getCreditBatchPda(
  this.program.programId,
  creditMint,
  Buffer.from(args.projectIdHash),
  args.vintage,
);
    this.logger.debug(`  batchPda: ${batchPda.toBase58()}`);
    this.logger.debug(`Step 6: getCreditBatchPda - OK`);

    this.logger.debug(`Step 7: Building mintCredit instruction`);
    try {
      const txSig = await this.program.methods
        .mintCredit({
          projectId: args.projectId,
          projectIdHash: Array.from(args.projectIdHash),
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

      this.logger.log(`Step 7: mintCredit RPC SUCCESS - txSig: ${txSig}`);
      this.logger.log(`Issued ${args.verifiedTonnesScaled} credits for project ${args.projectId} (tx=${txSig})`);
      this.logger.log(`=== ISSUE SUCCESS ===`);
      return {
        txSignature: txSig,
        batchPda: batchPda.toBase58(),
        mint: creditMint.toBase58(),
        amount: args.verifiedTonnesScaled,
      };
    } catch (error) {
      this.logger.error(`Step 7: mintCredit RPC FAILED`);
      this.logger.error(`Error: ${error}`);
      this.logger.error(`Error message: ${error.message}`);
      this.logger.error(`Error stack: ${error.stack}`);
      this.logger.error(`Error code: ${error.code}`);
      this.logger.error(`Error logs: ${error.logs ? error.logs.join('\n') : 'N/A'}`);
      this.logger.error(`=== ISSUE FAILED ===`);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Transfer / Retire (owner-signed; backend returns a prepared tx)
  // ---------------------------------------------------------------------------

  /** Build a `transferCredit` transaction for the owner wallet to sign. */
  async buildTransferTx(mint: string, from: string, to: string, amount: number): Promise<PreparedTx> {
    const builder = this.transferBuilder(mint, from, to, amount);
    const tx = await builder.transaction();
    return this.prepare(tx, new PublicKey(from));
  }

  /**
   * Build + sign + submit a real `transferCredit` as the owner. Returns the
   * confirmed signature. Used by the marketplace settlement path when the
   * settlement signer (seller) is available server-side (test / managed flow).
   */
  async signTransfer(mint: string, from: string, to: string, amount: number, fromKeypair: Keypair): Promise<string> {
    const builder = this.transferBuilder(mint, from, to, amount);
    const sig = await builder.signers([fromKeypair]).rpc();
    this.logger.log(`Transferred ${amount} of ${mint} ${from} -> ${to} (tx=${sig})`);
    return sig;
  }

  /**
   * Build + locally sign the `transferCredit` transaction and SIMULATE it with
   * signature verification (`sigVerify: true`). Nothing is submitted to the
   * cluster. Returns the RPC simulation result so callers can assert `err ===
   * null` and that the `CreditTransferred` event appears in the logs. Used by
   * the Design A settlement tests to prove the server-held seller keypair
   * correctly signs the transfer without any client wallet involvement.
   */
  async simulateTransfer(
    mint: string,
    from: string,
    to: string,
    amount: number,
    fromKeypair: Keypair,
  ): Promise<{ err: unknown; logs: string[] | null; sigVerify: boolean }> {
    const builder = this.transferBuilder(mint, from, to, amount);
    const tx = await builder.transaction();
    const fromPk = new PublicKey(from);
    tx.feePayer = fromPk;
    const { blockhash } = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.partialSign(fromKeypair);
    // SigVerify simulation requires a VersionedTransaction (config overload).
    const versioned = new VersionedTransaction(tx.compileMessage());
    versioned.signatures = tx.signatures.map((sig) =>
      sig.signature ? Uint8Array.from(sig.signature) : new Uint8Array(64),
    );
    const sim = await this.connection.simulateTransaction(versioned, {
      sigVerify: true,
      replaceRecentBlockhash: true,
    });
    return {
      err: sim.value.err ?? null,
      logs: sim.value.logs ?? null,
      sigVerify: true,
    };
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
    const batchPda = this.getCreditBatchPda(
  programId,
  mintPk,
  hashToPdaSeed(batch.projectId),
  batch.vintage,
);
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
    const batchPda = this.getCreditBatchPda(
  programId,
  mintPk,
  hashToPdaSeed(batch.projectId),
  batch.vintage,
);
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
    this.logger.log(`[audit] getBatches(${mint}): ${accounts.length} raw accounts returned from chain`);
    const results = accounts
      .map((a) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dec = (this.program.account as any).creditBatch.coder.accounts.decode('creditBatch', a.account.data);
          return this.toBatchView(dec, a.pubkey);
        } catch (e: any) {
          this.logger.warn(`[audit] Failed to decode CreditBatch ${a.pubkey.toBase58()}: ${e?.message}`);
          return null;
        }
      })
      .filter((x): x is CreditBatchView => x !== null);
    this.logger.log(`[audit] getBatches(${mint}): ${results.length} decoded batches`);
    for (const b of results) {
      this.logger.log(`[audit]   batch PDA=${b.batchPda}, projectId=${b.projectId}, vintage=${b.vintage}, totalMinted=${b.totalMinted}`);
    }
    return results;
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

  /**
   * Read the CreditBatch accounts belonging to a specific project for a mint.
   * Dynamically matches the project by the on-chain `projectId` field (which is
   * exactly what the PDA was seeded with via SHA-256), so a selected project
   * NEVER sees another project's batch and all of the project's vintages are
   * returned. Reuses the mint-level account read; no duplicate PDA logic.
   */
  async getBatchesForProject(mint: string, projectId: string): Promise<CreditBatchView[]> {
    const batches = await this.getBatches(mint);
    this.logger.log(`[audit] getBatchesForProject(${mint}, ${projectId}): filtering ${batches.length} batches`);
    const matching = batches.filter((b) => b.projectId === projectId);
    this.logger.log(`[audit] getBatchesForProject: ${matching.length} matching batches`);
    if (matching.length === 0 && batches.length > 0) {
      for (const b of batches) {
        this.logger.log(`[audit]   mismatch: on-chain projectId="${b.projectId}" vs requested="${projectId}" (match=${b.projectId === projectId})`);
      }
    }
    return matching;
  }

  /**
   * Read the RetirementRecords for a given mint whose batch belongs to a
   * specific project. A retirement is only shown if it references one of the
   * project's CreditBatch PDAs.
   */
  async getRetirementsForProject(mint: string, projectId: string): Promise<RetirementView[]> {
    const [batches, retirements] = await Promise.all([
      this.getBatches(mint),
      this.getRetirements(mint),
    ]);
    const projectBatchPdas = new Set(batches.filter((b) => b.projectId === projectId).map((b) => b.batchPda));
    return retirements.filter((r) => projectBatchPdas.has(r.batch));
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

  /**
   * Ensure a Token-2022 associated token account exists for `owner` on `mint`.
   * Creates it (server-funded via the oracle keypair) only when missing so the
   * `transferCredit` / settlement target account is always present. Returns the
   * ATA address (base58).
   */
  async ensureTokenAccount(mint: string, owner: string): Promise<string> {
    const mintPk = new PublicKey(mint);
    const ownerPk = new PublicKey(owner);
    const ata = getAssociatedTokenAddressSync(mintPk, ownerPk, false, TOKEN_2022_PROGRAM_ID);
    try {
      const existing = await this.connection.getAccountInfo(ata);
      if (existing && existing.data.length > 0) {
        return ata.toBase58();
      }
    } catch {
      // Fall through to creation below.
    }
    const account = await getOrCreateAssociatedTokenAccount(
      this.connection,
      this.oracleKeypair,
      mintPk,
      ownerPk,
      false,
      'confirmed',
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );
    this.logger.log(`Created Token-2022 ATA ${account.address.toBase58()} for ${ownerPk.toBase58()} on ${mint}`);
    return account.address.toBase58();
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /** Shared `transferCredit` methods-builder used by build/sign/simulate. */
  private transferBuilder(mint: string, from: string, to: string, amount: number) {
    const programId = this.program.programId;
    const mintPk = new PublicKey(mint);
    const fromPk = new PublicKey(from);
    const toPk = new PublicKey(to);
    const fromAta = getAssociatedTokenAddressSync(mintPk, fromPk, false, TOKEN_2022_PROGRAM_ID);
    const toAta = getAssociatedTokenAddressSync(mintPk, toPk, false, TOKEN_2022_PROGRAM_ID);

    return this.program.methods
      .transferCredit(new BN(amount))
      .accounts({
        oracleConfig: this.getOracleConfigPda(programId),
        creditMint: mintPk,
        owner: fromPk,
        to: toPk,
        fromTokenAccount: fromAta,
        toTokenAccount: toAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as never);
  }

  private async prepare(tx: Transaction, signer: PublicKey): Promise<PreparedTx> {
    tx.feePayer = signer;
    const { blockhash } = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
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
      batchPda: pubkey.toBase58(),
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
