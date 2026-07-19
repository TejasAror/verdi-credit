/**
 * init-onchain.ts — One-time on-chain initialization of the VerdiCred
 * CarbonCreditProgram on Devnet.
 *
 * WHAT IT DOES
 *   1. initialize()      — creates the global OracleConfig PDA. The signer of
 *                          this instruction becomes `deployment_authority`
 *                          (a PROGRAM-DEFINED authority stored in OracleConfig,
 *                          NOT the BPF upgrade authority). We deliberately use
 *                          the dedicated `devnet-deployer` keypair, so the
 *                          upgrade authority (the owner's Phantom wallet) is
 *                          never touched.
 *   2. create_credit_mint() — creates the SPL Token-2022 credit mint (decimals
 *                          = 0) with the Oracle Mint Authority PDA as mint
 *                          authority. The mint address is generated fresh and
 *                          printed / written to scripts/setup/credit-mint.txt.
 *
 * The SAME keypair is also set as `verifier_oracle_authority`, which is the
 * only wallet allowed to mint credits. The backend's `VERIFIER_ORACLE_SECRET_KEY`
 * must therefore be this keypair's secret (the script copies it into
 * scripts/setup/oracle-keypair.json for you).
 *
 * AUTHORITY NOTE (important):
 *   The BPF upgrade authority (Phantom) is NEVER used here. `initialize` /
 *   `create_credit_mint` only require `deployment_authority: Signer`, which is
 *   any keypair. See END_TO_END_WORKFLOW.md for the full analysis.
 *
 * USAGE:  npx ts-node scripts/init-onchain.ts
 */
import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { Keypair, PublicKey, SystemProgram, Connection } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import * as idlJson from '../src/carbon-credits/idl/carbon_credit_program.json';

const PROGRAM_ID = new PublicKey('41jbriQNyaJLuUfJWennbwVqGTQeBDc94Ywj4pGBarnv');
const RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const DEPLOYER_PATH = path.join(
  __dirname,
  '..',
  '..',
  'stage4-carbon-credits',
  'target',
  'deploy',
  'devnet-deployer-keypair.json',
);
const SETUP_DIR = path.join(__dirname, 'setup');

const PROGRAM_SEED = Buffer.from('verdicred');
const ORACLE_CONFIG_SEED = Buffer.from('oracle_config');
const ORACLE_MINT_AUTHORITY_SEED = Buffer.from('oracle_mint_authority');

function ensureSetupDir() {
  if (!fs.existsSync(SETUP_DIR)) fs.mkdirSync(SETUP_DIR, { recursive: true });
}

async function airdropIfNeeded(connection: Connection, kp: Keypair) {
  const bal = await connection.getBalance(kp.publicKey);
  if (bal < 2_000_000_000) {
    // 2 SOL
    console.log(`  ↳ airdropping DEVNET SOL to ${kp.publicKey.toBase58()} (bal=${(bal / 1e9).toFixed(2)} SOL)`);
    for (let i = 0; i < 3; i++) {
      try {
        const sig = await connection.requestAirdrop(kp.publicKey, 1_000_000_000);
        await connection.confirmTransaction(sig, 'confirmed');
        break;
      } catch (e) {
        if (i === 2) console.log('  ! airdrop failed (devnet may be rate-limited). Continuing — ensure the account has SOL.');
      }
    }
  } else {
    console.log(`  ✓ has ${(bal / 1e9).toFixed(2)} SOL`);
  }
}

async function main() {
  ensureSetupDir();
  if (!fs.existsSync(DEPLOYER_PATH)) {
    throw new Error(`Deployer keypair not found at ${DEPLOYER_PATH}. Cannot initialize.`);
  }
  const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(DEPLOYER_PATH, 'utf8'))));

  const connection = new Connection(RPC, 'confirmed');
  const wallet = new anchor.Wallet(deployer);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);

  const program = new Program(idlJson as any, provider);
  program.programId; // ensure idl address matches; we assert below.
  if (program.programId.toBase58() !== PROGRAM_ID.toBase58()) {
    throw new Error(
      `IDL program id (${program.programId.toBase58()}) != expected ${PROGRAM_ID.toBase58()}. ` +
        `Fix the IDL address before running init.`,
    );
  }

  const [oracleConfig] = PublicKey.findProgramAddressSync([PROGRAM_SEED, ORACLE_CONFIG_SEED], PROGRAM_ID);
  const [oracleMintAuthority] = PublicKey.findProgramAddressSync([ORACLE_MINT_AUTHORITY_SEED], PROGRAM_ID);
  const verifierOracle = deployer.publicKey;

  console.log('Program ID:        ', PROGRAM_ID.toBase58());
  console.log('Deployment auth:   ', deployer.publicKey.toBase58());
  console.log('Verifier Oracle:   ', verifierOracle.toBase58());
  console.log('OracleConfig PDA:  ', oracleConfig.toBase58());
  console.log('Mint Authority PDA:', oracleMintAuthority.toBase58());

  await airdropIfNeeded(connection, deployer);

  // 1) initialize
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = await (program.account as any).oracleConfig.fetchNullable(oracleConfig);
  if (cfg) {
    console.log('\n==> OracleConfig already initialized; skipping initialize.');
  } else {
    console.log('\n==> initialize()');
    const sig = await program.methods
      .initialize()
      .accounts({
        oracleConfig,
        oracleMintAuthority,
        deploymentAuthority: deployer.publicKey,
        verifierOracleAuthority: verifierOracle,
        systemProgram: SystemProgram.programId,
      } as never)
      .rpc();
    console.log('    tx:', sig);
    console.log('    explorer:', `https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  }

  // 2) create the credit mint
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfgAfter = await (program.account as any).oracleConfig.fetch(oracleConfig);
  if (cfgAfter.creditMintSet) {
    console.log('\n==> Credit mint already created:', cfgAfter.creditMint.toBase58());
    fs.writeFileSync(path.join(SETUP_DIR, 'credit-mint.txt'), cfgAfter.creditMint.toBase58());
    return;
  }

  const mintKp = Keypair.generate();
  console.log('\n==> create_credit_mint()  mint =', mintKp.publicKey.toBase58());
  const sig = await program.methods
    .createCreditMint()
    .accounts({
      oracleConfig,
      oracleMintAuthority,
      creditMint: mintKp.publicKey,
      deploymentAuthority: deployer.publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as never)
    .signers([mintKp])
    .rpc();
  console.log('    tx:', sig);
  console.log('    explorer:', `https://explorer.solana.com/tx/${sig}?cluster=devnet`);

  // Persist the mint + oracle keypair for the backend .env.
  fs.writeFileSync(path.join(SETUP_DIR, 'credit-mint.txt'), mintKp.publicKey.toBase58());
  fs.writeFileSync(
    path.join(SETUP_DIR, 'oracle-keypair.json'),
    JSON.stringify(Array.from(deployer.secretKey)),
  );
  console.log('\n==> Done.');
  console.log('    Credit mint:', mintKp.publicKey.toBase58());
  console.log('    Oracle keypair written to scripts/setup/oracle-keypair.json');
  console.log('    Set VERDICRED_CREDIT_MINT and VERIFIER_ORACLE_SECRET_KEY in backend/.env.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
