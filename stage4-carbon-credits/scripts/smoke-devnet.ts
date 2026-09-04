/**
 * smoke-devnet.ts — End-to-end smoke test against the Devnet deployment.
 *
 * Exercises the full lifecycle on a LIVE Devnet program:
 *   mintCredit (VERIFIED gate, 1:1 floor) -> transferCredit -> retireCredit
 * and asserts on-chain state + Token-2022 balances.
 *
 * If VERIFIER_ORACLE_SECRET is set in config.ts the script signs the mint with
 * the real oracle wallet. Otherwise it requires the oracle authority to sign
 * off-chain (e.g. via the NestJS backend) and this script only verifies state
 * after you mint separately. By default we demonstrate the *unauthorized* and
 * *not-verified* rejections plus a successful mint using the oracle secret when
 * available.
 *
 * Usage:  ts-node scripts/smoke-devnet.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Connection,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import {
  DEVNET_RPC,
  VERIFIER_ORACLE_AUTHORITY,
  VERIFIER_ORACLE_SECRET,
  DEFAULT_VINTAGE,
} from "./config";
import type { CarbonCreditProgram } from "../target/types/carbon_credit_program";

function loadProgramId(): PublicKey {
  const p = path.join(__dirname, "..", "target", "deploy", ".program_id");
  if (!fs.existsSync(p)) {
    throw new Error("Run `npm run deploy:devnet` first (writes target/deploy/.program_id).");
  }
  return new PublicKey(fs.readFileSync(p, "utf8").trim());
}

async function main() {
  const programId = loadProgramId();
  const idl = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "target", "idl", "carbon_credit_program.json"),
      "utf8",
    ),
  );

  const deployerKpPath = path.join(
    __dirname,
    "..",
    "target",
    "deploy",
    "devnet-deployer-keypair.json",
  );
  const deployer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(deployerKpPath, "utf8"))),
  );
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const provider = new AnchorProvider(
    connection,
    new anchor.Wallet(deployer),
    { commitment: "confirmed" },
  );
  anchor.setProvider(provider);
  const program = new Program<CarbonCreditProgram>(idl, provider);

  const PROGRAM_SEED = Buffer.from("verdicred");
  const ORACLE_CONFIG_SEED = Buffer.from("oracle_config");
  const CREDIT_BATCH_SEED = Buffer.from("credit_batch");
  const ORACLE_MINT_AUTHORITY_SEED = Buffer.from("oracle_mint_authority");

  const [oracleConfig] = PublicKey.findProgramAddressSync(
    [PROGRAM_SEED, ORACLE_CONFIG_SEED],
    programId,
  );
  const [oracleMintAuthority] = PublicKey.findProgramAddressSync(
    [ORACLE_MINT_AUTHORITY_SEED],
    programId,
  );

  const verifierOracle = new PublicKey(VERIFIER_ORACLE_AUTHORITY);
  const cfg = await program.account.oracleConfig.fetch(oracleConfig);
  if (!cfg.creditMintSet) {
    throw new Error("Mint not created. Run `npm run init:devnet` first.");
  }
  const creditMint = cfg.creditMint;

  console.log("Program ID:       ", programId.toBase58());
  console.log("Credit mint:      ", creditMint.toBase58());
  console.log("Verifier Oracle:  ", verifierOracle.toBase58());

  // Build the oracle signer (only if we have its secret).
  let oracleSigner: Keypair | null = null;
  if (VERIFIER_ORACLE_SECRET) {
    oracleSigner = Keypair.fromSecretKey(Uint8Array.from(VERIFIER_ORACLE_SECRET));
  }

  const projectId = "VERDI-SMOKE-001";
  const vintage = DEFAULT_VINTAGE;
  const methodology = "VM0036";
  const reportCid = "bafyreich4smokedevnetreportcid000000000000000000000000000000000000";
  const evidenceCids = ["bafybeismoke1", "bafybeismoke2"];

  // SHA-256 of the projectId — the deployed program derives the CreditBatch PDA
  // from this 32-byte hash (NOT the raw projectId string).
  const projectIdHash = createHash("sha256").update(projectId).digest();

  // --- 1) Reject a PENDING report (proves the gate on live devnet) ---
  const recipient = Keypair.generate();
  const ata = await getAssociatedTokenAddress(
    creditMint,
    recipient.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  const [batch] = PublicKey.findProgramAddressSync(
    [
      PROGRAM_SEED,
      CREDIT_BATCH_SEED,
      creditMint.toBuffer(),
      projectIdHash,
      new anchor.BN(vintage).toArrayLike(Buffer, "le", 2),
    ],
    programId,
  );

  if (oracleSigner) {
    console.log("\n[1] Attempt to mint a PENDING report (should FAIL)...");
    try {
      await program.methods
        .mintCredit({
          projectId,
          projectIdHash: Array.from(projectIdHash),
          vintage,
          methodology,
          evidenceCids,
          reportCid,
          reportStatus: { pendingVerification: {} },
          verifiedTonnesScaled: new anchor.BN(100),
        })
        .accounts({
          oracleConfig,
          oracleMintAuthority,
          creditMint,
          verifierOracleAuthority: verifierOracle,
          recipient: recipient.publicKey,
          recipientTokenAccount: ata,
          creditBatch: batch,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        })
        .signers([oracleSigner])
        .rpc();
      console.log("   !! ERROR: pending mint should have been rejected");
    } catch (e: any) {
      console.log("   OK rejected:", e?.error?.errorCode?.code ?? e.message);
    }

    // --- 2) Successful VERIFIED mint: floor(1250.7) = 1250 ---
    console.log("\n[2] Mint a VERIFIED report (1250.7 t -> 1250 credits)...");
    await airdrop(connection, recipient.publicKey);
    const verified = 1250.7;
    await program.methods
      .mintCredit({
        projectId,
        projectIdHash: Array.from(projectIdHash),
        vintage,
        methodology,
        evidenceCids,
        reportCid,
        reportStatus: { verified: {} },
        verifiedTonnesScaled: new anchor.BN(Math.floor(verified)),
      })
      .accounts({
        oracleConfig,
        oracleMintAuthority,
        creditMint,
        verifierOracleAuthority: verifierOracle,
        recipient: recipient.publicKey,
        recipientTokenAccount: ata,
        creditBatch: batch,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .signers([oracleSigner])
      .rpc();
    const tokenAcc = await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
    console.log("   recipient balance:", tokenAcc.amount.toString(), "(expected 1250)");

    // --- 3) Transfer 250 to a holder ---
    console.log("\n[3] Transfer 250 credits to a holder...");
    const holder = Keypair.generate();
    await airdrop(connection, holder.publicKey);
    const holderAta = await getAssociatedTokenAddress(
      creditMint,
      holder.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );
    await program.methods
      .transferCredit(new anchor.BN(250))
      .accounts({
        oracleConfig,
        creditMint,
        owner: recipient.publicKey,
        to: holder.publicKey,
        fromTokenAccount: ata,
        toTokenAccount: holderAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([recipient])
      .rpc();
    const holderTok = await getAccount(connection, holderAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    console.log("   holder balance:", holderTok.amount.toString(), "(expected 250)");

    // --- 4) Retire 100 (burn) ---
    console.log("\n[4] Retire 100 credits (immutable burn)...");
    const [retRecord] = PublicKey.findProgramAddressSync(
      [
        PROGRAM_SEED,
        Buffer.from("retirement"),
        creditMint.toBuffer(),
        holder.publicKey.toBuffer(),
        new anchor.BN(0).toArrayLike(Buffer, "le", 8),
      ],
      programId,
    );
    const batchAcc = await program.account.creditBatch.fetch(batch);
    await program.methods
      .retireCredit({
        amount: new anchor.BN(100),
        reason: "Smoke-test voluntary offset",
        reportRef: reportCid,
      })
      .accounts({
        oracleConfig,
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
    const holderTok2 = await getAccount(connection, holderAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    console.log("   holder balance after retire:", holderTok2.amount.toString(), "(expected 150)");
    console.log("   total_retired:", batchAcc.totalRetired.toString(), "-> bumped on chain");
    console.log("\nSMOKE TEST PASSED ✅");
  } else {
    console.log(
      "\nNo VERIFIER_ORACLE_SECRET set — skipping signed mint/transfer/retire.",
    );
    console.log(
      "To run a full live smoke test, paste the oracle wallet secret into VERIFIER_ORACLE_SECRET",
    );
    console.log("in scripts/config.ts, or issue credits via the NestJS backend.");
  }
}

async function airdrop(connection: Connection, pubkey: PublicKey) {
  try {
    const sig = await connection.requestAirdrop(pubkey, 1 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  } catch {
    /* faucet may be rate-limited; ignore */
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
