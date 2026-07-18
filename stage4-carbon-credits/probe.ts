import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import * as fs from "fs";

const idl = JSON.parse(fs.readFileSync("target/idl/carbon_credit_program.json", "utf8"));
const pid = new PublicKey(idl.address);
const DEP = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("target/deploy/devnet-deployer-keypair.json", "utf8"))));
const conn = new anchor.web3.Connection("http://127.0.0.1:8899", "confirmed");
const provider = new AnchorProvider(conn, new anchor.Wallet(DEP), { commitment: "confirmed" });
const program = new Program(idl as any, provider);

const PROGRAM_SEED = Buffer.from("verdicred");
const ORACLE_CONFIG_SEED = Buffer.from("oracle_config");
const ORACLE_MINT_AUTHORITY_SEED = Buffer.from("oracle_mint_authority");
const CREDIT_BATCH_SEED = Buffer.from("credit_batch");
const [oracleConfig] = PublicKey.findProgramAddressSync([PROGRAM_SEED, ORACLE_CONFIG_SEED], pid);
const [oracleMintAuthority] = PublicKey.findProgramAddressSync([ORACLE_MINT_AUTHORITY_SEED], pid);

(async () => {
  const verifierOracle = Keypair.fromSeed(Uint8Array.from(Array(32).fill(7)));
  const recipient = Keypair.fromSeed(Uint8Array.from(Array(32).fill(29)));

  // fund
  for (const k of [verifierOracle, recipient]) {
    const s = await conn.requestAirdrop(k.publicKey, 2 * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(s, "confirmed");
  }

  console.log("=== initialize ===");
  try {
    const tx = await program.methods.initialize().accounts({
      oracleConfig, oracleMintAuthority,
      deploymentAuthority: DEP.publicKey,
      verifierOracleAuthority: verifierOracle.publicKey,
      systemProgram: SystemProgram.programId,
    }).rpc();
    console.log("init tx:", tx);
  } catch (e: any) { console.log("init err:", e?.message); }
  let cfg = await program.account.oracleConfig.fetchNullable(oracleConfig);
  console.log("after init creditMintSet=", cfg?.creditMintSet, "creditMint=", cfg?.creditMint.toBase58());

  console.log("=== createCreditMint ===");
  const creditMintKp = Keypair.generate();
  try {
    const tx = await program.methods.createCreditMint().accounts({
      oracleConfig, oracleMintAuthority,
      creditMint: creditMintKp.publicKey,
      deploymentAuthority: DEP.publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).signers([creditMintKp]).rpc();
    console.log("createMint tx:", tx);
  } catch (e: any) { console.log("createMint err:", e?.message); }
  cfg = await program.account.oracleConfig.fetchNullable(oracleConfig);
  console.log("after createMint creditMintSet=", cfg?.creditMintSet);

  console.log("=== mintCredit (amount=1250) ===");
  const recipientAta = await getAssociatedTokenAddress(creditMintKp.publicKey, recipient.publicKey, false, TOKEN_2022_PROGRAM_ID);
  try {
    const tx = await program.methods.mintCredit({
      projectId: "P1", vintage: 2026, methodology: "VM0036",
      evidenceCids: ["cid1"], reportCid: "rcid",
      reportStatus: { verified: {} }, verifiedTonnesScaled: new anchor.BN(1250),
    } as any).accounts({
      oracleConfig, oracleMintAuthority, creditMint: creditMintKp.publicKey,
      verifierOracleAuthority: verifierOracle.publicKey, recipient: recipient.publicKey,
      recipientTokenAccount: recipientAta,
      creditBatch: PublicKey.findProgramAddressSync([PROGRAM_SEED, CREDIT_BATCH_SEED, creditMintKp.publicKey.toBuffer(), Buffer.from("P1"), new anchor.BN(2026).toArrayLike(Buffer, "le", 2)], pid)[0],
      tokenProgram: TOKEN_2022_PROGRAM_ID, associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"), systemProgram: SystemProgram.programId, clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
    } as any).signers([verifierOracle]).rpc();
    console.log("mint tx:", tx);
  } catch (e: any) { console.log("mint err:", e?.message); }
  try {
    const ata = await getAccount(conn, recipientAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    console.log("recipient balance:", ata.amount.toString());
  } catch (e: any) { console.log("ata err:", e?.message); }
})();
