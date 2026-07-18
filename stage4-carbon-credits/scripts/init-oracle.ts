/**
 * init-oracle.ts — Initialize the OracleConfig and create the SPL Token-2022
 * credit mint on Devnet. Run AFTER `npm run deploy:devnet`.
 *
 * Usage:
 *   ts-node scripts/init-oracle.ts
 *
 * Reads the deployed Program ID from target/deploy/.program_id (written by
 * deploy-devnet.sh). The deployment authority signs `initialize` and
 * `create_credit_mint`; the Verifier Oracle Authority is set from config.ts.
 */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Connection,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import {
  DEVNET_RPC,
  VERIFIER_ORACLE_AUTHORITY,
} from "./config";
import type { CarbonCreditProgram } from "../target/types/carbon_credit_program";

function loadProgramId(): PublicKey {
  const p = path.join(__dirname, "..", "target", "deploy", ".program_id");
  if (!fs.existsSync(p)) {
    throw new Error(
      "Program ID not found. Run `npm run deploy:devnet` first (writes target/deploy/.program_id).",
    );
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

  // Deployer = the wallet configured in the solana CLI (devnet-deployer).
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
  const wallet = new anchor.Wallet(deployer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = new Program<CarbonCreditProgram>(idl, programId, provider);

  const PROGRAM_SEED = Buffer.from("verdicred");
  const ORACLE_CONFIG_SEED = Buffer.from("oracle_config");
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
  console.log("Program ID:        ", programId.toBase58());
  console.log("Deployer:          ", deployer.publicKey.toBase58());
  console.log("Verifier Oracle:   ", verifierOracle.toBase58());
  console.log("OracleConfig PDA:  ", oracleConfig.toBase58());

  // 1) initialize
  const cfg = await program.account.oracleConfig.fetchNullable(oracleConfig);
  if (cfg) {
    console.log("==> OracleConfig already initialized; skipping initialize.");
  } else {
    console.log("==> initialize()");
    await program.methods
      .initialize()
      .accounts({
        oracleConfig,
        oracleMintAuthority,
        deploymentAuthority: deployer.publicKey,
        verifierOracleAuthority: verifierOracle,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  // 2) create the credit mint
  const cfgAfter = await program.account.oracleConfig.fetch(oracleConfig);
  if (cfgAfter.creditMintSet) {
    console.log(
      "==> Credit mint already created:",
      cfgAfter.creditMint.toBase58(),
    );
    return;
  }

  const mintKp = Keypair.generate();
  console.log("==> createCreditMint()  mint =", mintKp.publicKey.toBase58());
  await program.methods
    .createCreditMint()
    .accounts({
      oracleConfig,
      oracleMintAuthority,
      creditMint: mintKp.publicKey,
      deploymentAuthority: deployer.publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([mintKp])
    .rpc();

  console.log("==> Mint created. Mint address:", mintKp.publicKey.toBase58());
  console.log("==> Done. You can now mint credits via the NestJS backend or smoke-devnet.ts.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
