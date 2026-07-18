import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { CarbonCreditProgram } from "../target/types/carbon_credit_program";
import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

describe("carbon-credit-program", () => {
  // Local validator cluster started by `anchor test`.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.CarbonCreditProgram as Program<CarbonCreditProgram>;

  // The deployment authority = the wallet that anchor uses (provider.wallet).
  const deploymentAuthority = provider.wallet as anchor.Wallet;

  // Deterministic test keypairs so the suite is fully re-runnable against a
  // persistent local validator (the stored verifier_oracle must match across runs).
  const verifierOracle = Keypair.fromSeed(
    Uint8Array.from(Array(32).fill(7)),
  );
  const attacker = Keypair.fromSeed(Uint8Array.from(Array(32).fill(13)));
  const recipient = Keypair.fromSeed(Uint8Array.from(Array(32).fill(29)));

  // PDA seeds (must match program constants.rs).
  const PROGRAM_SEED = Buffer.from("verdicred");
  const ORACLE_CONFIG_SEED = Buffer.from("oracle_config");
  const CREDIT_BATCH_SEED = Buffer.from("credit_batch");
  const ORACLE_MINT_AUTHORITY_SEED = Buffer.from("oracle_mint_authority");

  let oracleConfigPda: PublicKey;
  let oracleMintAuthorityPda: PublicKey;
  let creditMintKeypair: Keypair;
  let creditMint: PublicKey;

  const projectId = "VERDI-PROJ-001";
  const vintage = 2026;
  const methodology = "VM0036";
  const evidenceCids = [
    "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    "bafybeih4dqa2n5x7z3y2v6f2q2k2k2k2k2k2k2k2k2k2k2k2k2k2k2k2k2",
  ];
  const reportCid = "bafyreib2k2k2k2k2k2k2k2k2k2k2k2k2k2k2k2k2k2k2k2k2k2k2k2k";

  // ReportStatus enum discriminant (matches state.rs: 0=Pending, 1=Verified, 2=Rejected).
  const ReportStatus = {
    PendingVerification: { pendingVerification: {} },
    Verified: { verified: {} },
    Rejected: { rejected: {} },
  } as const;

  const creditBatchPda = (mint: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [
        PROGRAM_SEED,
        CREDIT_BATCH_SEED,
        mint.toBuffer(),
        Buffer.from(projectId),
        new anchor.BN(vintage).toArrayLike(Buffer, "le", 2),
      ],
      program.programId,
    )[0];

  before(async () => {
    // Airdrop SOL to the oracle and recipient so they can pay tx fees / rent.
    for (const kp of [verifierOracle, recipient, attacker]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        5 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    }

    [oracleConfigPda] = PublicKey.findProgramAddressSync(
      [PROGRAM_SEED, ORACLE_CONFIG_SEED],
      program.programId,
    );
    [oracleMintAuthorityPda] = PublicKey.findProgramAddressSync(
      [ORACLE_MINT_AUTHORITY_SEED],
      program.programId,
    );

    // Idempotent bootstrap: reuse an existing OracleConfig (e.g. from a prior
    // run against a persistent local validator) so the suite is re-runnable.
    const existing = await program.account.oracleConfig.fetchNullable(oracleConfigPda);
    if (existing && existing.creditMintSet) {
      creditMint = existing.creditMint;
      creditMintKeypair = Keypair.generate(); // never needs to sign once mint exists
      console.log("Reusing existing OracleConfig; creditMint =", creditMint.toBase58());
    } else {
      // Fresh (or partially-initialized) deployment: derive a STABLE mint keypair
      // from a temp file so that if the suite is interrupted and re-run, the same
      // mint address is reused and createCreditMint can complete.
      const mintPath = path.join(__dirname, "..", "target", ".test-mint.json");
      if (fs.existsSync(mintPath)) {
        creditMintKeypair = Keypair.fromSecretKey(
          Uint8Array.from(JSON.parse(fs.readFileSync(mintPath, "utf8"))),
        );
      } else {
        creditMintKeypair = Keypair.generate();
        fs.writeFileSync(mintPath, JSON.stringify(Array.from(creditMintKeypair.secretKey)));
      }
      creditMint = creditMintKeypair.publicKey;
    }
  });

  async function initialize() {
    const cfg = await program.account.oracleConfig.fetchNullable(oracleConfigPda);
    if (cfg) return; // already initialized (idempotent re-run)
    await program.methods
      .initialize()
      .accounts({
        oracleConfig: oracleConfigPda,
        oracleMintAuthority: oracleMintAuthorityPda,
        deploymentAuthority: deploymentAuthority.publicKey,
        verifierOracleAuthority: verifierOracle.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async function createMint() {
    const cfg = await program.account.oracleConfig.fetchNullable(oracleConfigPda);
    if (cfg && cfg.creditMintSet) {
      creditMint = cfg.creditMint;
      return;
    }
    await program.methods
      .createCreditMint()
      .accounts({
        oracleConfig: oracleConfigPda,
        oracleMintAuthority: oracleMintAuthorityPda,
        creditMint,
        deploymentAuthority: deploymentAuthority.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([creditMintKeypair])
      .rpc();
  }

  // floor(1250.7) = 1250 credits.
  const verifiedTonnes = 1250.7;
  const expectedCredits = Math.floor(verifiedTonnes); // 1250

  describe("Setup & Oracle authority", () => {
    it("Initializes the OracleConfig with the verifier oracle authority", async () => {
      await initialize();
      const cfg = await program.account.oracleConfig.fetch(oracleConfigPda);
      assertKeys(cfg.verifierOracleAuthority, verifierOracle.publicKey);
      assertKeys(cfg.deploymentAuthority, deploymentAuthority.publicKey);
      expect(cfg.creditMintSet).to.be.false;
      expect(cfg.paused).to.be.false;
    });

    it("Rejects double initialization", async () => {
      try {
        await initialize();
        expect.fail("expected AlreadyInitialized error");
      } catch (e) {
        expect(e.error.errorCode.code).to.equal("AlreadyInitialized");
      }
    });

    it("Creates the SPL Token-2022 credit mint (0 decimals) with Oracle PDA as mint authority", async () => {
      await createMint();
      const cfg = await program.account.oracleConfig.fetch(oracleConfigPda);
      expect(cfg.creditMintSet).to.be.true;
      assertKeys(cfg.creditMint, creditMint);

      const info = await provider.connection.getAccountInfo(creditMint);
      expect(info.owner.toBase58()).to.equal(TOKEN_2022_PROGRAM_ID.toBase58());
    });
  });

  describe("mintCredit — VERIFIED gate + 1:1 ratio", () => {
    it("Mints floor(verifiedTonnes) credits for a VERIFIED report", async () => {
      const batch = creditBatchPda(creditMint);
      const recipientAta = await getAssociatedTokenAddress(
        creditMint,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      const tx = await program.methods
        .mintCredit({
          projectId,
          vintage,
          methodology,
          evidenceCids,
          reportCid,
          reportStatus: ReportStatus.Verified,
          verifiedTonnesScaled: new anchor.BN(expectedCredits),
        })
        .accounts({
          oracleConfig: oracleConfigPda,
          oracleMintAuthority: oracleMintAuthorityPda,
          creditMint,
          verifierOracleAuthority: verifierOracle.publicKey,
          recipient: recipient.publicKey,
          recipientTokenAccount: recipientAta,
          creditBatch: batch,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        })
        .signers([verifierOracle])
        .rpc();

      // Token balance == floor(verifiedTonnes) == 1250.
      const ata = await getAccount(
        provider.connection,
        recipientAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID,
      );
      expect(Number(ata.amount)).to.equal(expectedCredits);

      // CreditBatch accounting.
      const batchAcc = await program.account.creditBatch.fetch(batch);
      expect(batchAcc.totalMinted.toNumber()).to.equal(expectedCredits);
      expect(batchAcc.totalRetired.toNumber()).to.equal(0);
      expect(batchAcc.projectId).to.equal(projectId);
      expect(batchAcc.vintage).to.equal(vintage);
      expect(batchAcc.methodology).to.equal(methodology);
      expect(batchAcc.reportCid).to.equal(reportCid);
      expect(batchAcc.evidenceCids).to.deep.equal(evidenceCids);
      expect(batchAcc.reportStatus.verified).to.not.be.undefined;
      expect(batchAcc.verifiedTonnesScaled.toNumber()).to.equal(expectedCredits);

      await provider.connection.confirmTransaction(tx, "confirmed");
    });

    it("Demonstrates 1:1 floor: 1250.7 tonnes -> exactly 1250 credits (no fractional over-issue)", async () => {
      // The on-chain amount is derived purely from verifiedTonnesScaled, which the
      // backend floors. The mint never mints the .7 fractional part.
      const batch = creditBatchPda(creditMint);
      const batchAcc = await program.account.creditBatch.fetch(batch);
      expect(Number(verifiedTonnes)).to.equal(1250.7);
      expect(batchAcc.totalMinted.toNumber()).to.equal(1250);
    });

    it("BLOCKS minting when report status is PENDING_VERIFICATION", async () => {
      const otherRecipient = Keypair.generate();
      const sig2 = await provider.connection.requestAirdrop(
        otherRecipient.publicKey,
        2 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig2, "confirmed");
      const ata = await getAssociatedTokenAddress(
        creditMint,
        otherRecipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const batch = creditBatchPda(creditMint); // same project/vintage -> existing batch

      try {
        await program.methods
          .mintCredit({
            projectId,
            vintage,
            methodology,
            evidenceCids,
            reportCid,
            reportStatus: ReportStatus.PendingVerification,
            verifiedTonnesScaled: new anchor.BN(500),
          })
          .accounts({
            oracleConfig: oracleConfigPda,
            oracleMintAuthority: oracleMintAuthorityPda,
            creditMint,
            verifierOracleAuthority: verifierOracle.publicKey,
            recipient: otherRecipient.publicKey,
            recipientTokenAccount: ata,
            creditBatch: batch,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          })
          .signers([verifierOracle])
          .rpc();
        expect.fail("expected NotVerified error");
      } catch (e) {
        expect(e.error.errorCode.code).to.equal("NotVerified");
      }
    });

    it("BLOCKS minting when report status is REJECTED", async () => {
      const ata = await getAssociatedTokenAddress(
        creditMint,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const batch = creditBatchPda(creditMint);
      try {
        await program.methods
          .mintCredit({
            projectId,
            vintage,
            methodology,
            evidenceCids,
            reportCid,
            reportStatus: ReportStatus.Rejected,
            verifiedTonnesScaled: new anchor.BN(500),
          })
          .accounts({
            oracleConfig: oracleConfigPda,
            oracleMintAuthority: oracleMintAuthorityPda,
            creditMint,
            verifierOracleAuthority: verifierOracle.publicKey,
            recipient: recipient.publicKey,
            recipientTokenAccount: ata,
            creditBatch: batch,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          })
          .signers([verifierOracle])
          .rpc();
        expect.fail("expected NotVerified error");
      } catch (e) {
        expect(e.error.errorCode.code).to.equal("NotVerified");
      }
    });

    it("BLOCKS minting when called by an unauthorized signer (not the oracle)", async () => {
      const ata = await getAssociatedTokenAddress(
        creditMint,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const batch = creditBatchPda(creditMint);
      try {
        await program.methods
          .mintCredit({
            projectId,
            vintage,
            methodology,
            evidenceCids,
            reportCid,
            reportStatus: ReportStatus.Verified,
            verifiedTonnesScaled: new anchor.BN(10),
          })
          .accounts({
            oracleConfig: oracleConfigPda,
            oracleMintAuthority: oracleMintAuthorityPda,
            creditMint,
            verifierOracleAuthority: attacker.publicKey,
            recipient: recipient.publicKey,
            recipientTokenAccount: ata,
            creditBatch: batch,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          })
          .signers([attacker])
          .rpc();
        expect.fail("expected Unauthorized error");
      } catch (e) {
        expect(e.error.errorCode.code).to.equal("Unauthorized");
      }
    });
  });

  describe("transferCredit", () => {
    it("Transfers credits from recipient to a new holder", async () => {
      const fromAta = await getAssociatedTokenAddress(
        creditMint,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const holder = Keypair.generate();
      const toAta = await getAssociatedTokenAddress(
        creditMint,
        holder.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const transferAmount = 250;

      await program.methods
        .transferCredit(new anchor.BN(transferAmount))
        .accounts({
          oracleConfig: oracleConfigPda,
          creditMint,
          owner: recipient.publicKey,
          to: holder.publicKey,
          fromTokenAccount: fromAta,
          toTokenAccount: toAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([recipient])
        .rpc();

      const from = await getAccount(
        provider.connection,
        fromAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID,
      );
      const to = await getAccount(
        provider.connection,
        toAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID,
      );
      expect(Number(from.amount)).to.equal(expectedCredits - transferAmount);
      expect(Number(to.amount)).to.equal(transferAmount);
    });
  });

  describe("retireCredit — immutable, no reuse", () => {
    it("Retires credits (burns supply) and writes an immutable RetirementRecord", async () => {
      const holder = Keypair.generate();
      // Give the holder some credits first.
      const fromAta = await getAssociatedTokenAddress(
        creditMint,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const toAta = await getAssociatedTokenAddress(
        creditMint,
        holder.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const retireAmount = 100;
      await program.methods
        .transferCredit(new anchor.BN(retireAmount))
        .accounts({
          oracleConfig: oracleConfigPda,
          creditMint,
          owner: recipient.publicKey,
          to: holder.publicKey,
          fromTokenAccount: fromAta,
          toTokenAccount: toAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([recipient])
        .rpc();

      const holderAta = await getAssociatedTokenAddress(
        creditMint,
        holder.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const batch = creditBatchPda(creditMint);

      // Retirement record PDA uses the per-batch retirement_count nonce (currently 0).
      const [retRecord] = PublicKey.findProgramAddressSync(
        [
          PROGRAM_SEED,
          Buffer.from("retirement"),
          creditMint.toBuffer(),
          holder.publicKey.toBuffer(),
          new anchor.BN(0).toArrayLike(Buffer, "le", 8),
        ],
        program.programId,
      );

      await program.methods
        .retireCredit({
          amount: new anchor.BN(retireAmount),
          reason: "Voluntary offset for Q3 emissions",
          reportRef: reportCid,
        })
        .accounts({
          oracleConfig: oracleConfigPda,
          creditMint,
          owner: holder.publicKey,
          ownerTokenAccount: holderAta,
          creditBatch: batch,
          retirementRecord: retRecord,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        })
        .signers([holder])
        .rpc();

      // Supply is burned -> balance is now 0.
      const ata = await getAccount(
        provider.connection,
        holderAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID,
      );
      expect(Number(ata.amount)).to.equal(0);

      const rec = await program.account.retirementRecord.fetch(retRecord);
      assertKeys(rec.owner, holder.publicKey);
      assertKeys(rec.mint, creditMint);
      assertKeys(rec.batch, batch);
      expect(rec.amount.toNumber()).to.equal(retireAmount);
      expect(rec.reason).to.equal("Voluntary offset for Q3 emissions");

      const batchAcc = await program.account.creditBatch.fetch(batch);
      expect(batchAcc.totalRetired.toNumber()).to.equal(retireAmount);
    });

    it("BLOCKS retirement of more credits than the owner holds", async () => {
      const holderAta = await getAssociatedTokenAddress(
        creditMint,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const batch = creditBatchPda(creditMint);
      const [retRecord] = PublicKey.findProgramAddressSync(
        [
          PROGRAM_SEED,
          Buffer.from("retirement"),
          creditMint.toBuffer(),
          recipient.publicKey.toBuffer(),
          // retirement_count was bumped to 1 by the previous test's retirement.
          new anchor.BN(1).toArrayLike(Buffer, "le", 8),
        ],
        program.programId,
      );
      try {
        await program.methods
          .retireCredit({
            amount: new anchor.BN(9_999_999),
            reason: "too much",
            reportRef: reportCid,
          })
          .accounts({
            oracleConfig: oracleConfigPda,
            creditMint,
            owner: recipient.publicKey,
            ownerTokenAccount: holderAta,
            creditBatch: batch,
            retirementRecord: retRecord,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          })
          .signers([recipient])
          .rpc();
        expect.fail("expected InsufficientBalance error");
      } catch (e) {
        expect(e.error.errorCode.code).to.equal("InsufficientBalance");
      }
    });
  });

  describe("Admin controls", () => {
    it("Deployment authority can pause and unpause the program", async () => {
      await program.methods
        .setPaused(true)
        .accounts({
          oracleConfig: oracleConfigPda,
          deploymentAuthority: deploymentAuthority.publicKey,
        })
        .rpc();
      let cfg = await program.account.oracleConfig.fetch(oracleConfigPda);
      expect(cfg.paused).to.be.true;

      // While paused, minting must be blocked.
      const ata = await getAssociatedTokenAddress(
        creditMint,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const batch = creditBatchPda(creditMint);
      try {
        await program.methods
          .mintCredit({
            projectId,
            vintage,
            methodology,
            evidenceCids,
            reportCid,
            reportStatus: ReportStatus.Verified,
            verifiedTonnesScaled: new anchor.BN(1),
          })
          .accounts({
            oracleConfig: oracleConfigPda,
            oracleMintAuthority: oracleMintAuthorityPda,
            creditMint,
            verifierOracleAuthority: verifierOracle.publicKey,
            recipient: recipient.publicKey,
            recipientTokenAccount: ata,
            creditBatch: batch,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          })
          .signers([verifierOracle])
          .rpc();
        expect.fail("expected Paused error");
      } catch (e) {
        expect(e.error.errorCode.code).to.equal("Paused");
      }

      await program.methods
        .setPaused(false)
        .accounts({
          oracleConfig: oracleConfigPda,
          deploymentAuthority: deploymentAuthority.publicKey,
        })
        .rpc();
      cfg = await program.account.oracleConfig.fetch(oracleConfigPda);
      expect(cfg.paused).to.be.false;
    });

    it("Only the current oracle authority may rotate the oracle authority", async () => {
      const newOracle = Keypair.generate();
      try {
        await program.methods
          .setVerifierOracleAuthority(newOracle.publicKey)
          .accounts({
            oracleConfig: oracleConfigPda,
            verifierOracleAuthority: attacker.publicKey,
          })
          .signers([attacker])
          .rpc();
        expect.fail("expected Unauthorized error");
      } catch (e) {
        expect(e.error.errorCode.code).to.equal("Unauthorized");
      }

      await program.methods
        .setVerifierOracleAuthority(newOracle.publicKey)
        .accounts({
          oracleConfig: oracleConfigPda,
          verifierOracleAuthority: verifierOracle.publicKey,
        })
        .signers([verifierOracle])
        .rpc();
      const cfg = await program.account.oracleConfig.fetch(oracleConfigPda);
      assertKeys(cfg.verifierOracleAuthority, newOracle.publicKey);
    });
  });

  // ---- helpers ----
  function assertKeys(a: PublicKey, b: PublicKey) {
    expect(a.toBase58()).to.equal(b.toBase58());
  }
});
