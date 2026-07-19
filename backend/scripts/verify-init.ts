import { Connection, clusterApiUrl, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { Keypair } from '@solana/web3.js';
import * as idlJson from '../src/carbon-credits/idl/carbon_credit_program.json';

const PID = new PublicKey('41jbriQNyaJLuUfJWennbwVqGTQeBDc94Ywj4pGBarnv');
const RPC = 'https://api.devnet.solana.com';
const MINT = new PublicKey('DeTknRJ1orhpEBEqCjdYCCRw6JKEPYLiTUVEZCMaH6p9');

async function main() {
  const c = new Connection(RPC, 'confirmed');
  const kp = Keypair.generate(); // no signing needed for reads
  const provider = new AnchorProvider(c, new anchor.Wallet(kp), { commitment: 'confirmed' });
  const program = new Program(idlJson as any, provider);
  // oracle config
  const [cfg] = PublicKey.findProgramAddressSync([Buffer.from('verdicred'), Buffer.from('oracle_config')], PID);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oc = await (program.account as any).oracleConfig.fetch(cfg);
  console.log('OracleConfig:');
  console.log('  deploymentAuthority:', oc.deploymentAuthority.toBase58());
  console.log('  verifierOracleAuthority:', oc.verifierOracleAuthority.toBase58());
  console.log('  creditMint:', oc.creditMint.toBase58());
  console.log('  creditMintSet:', oc.creditMintSet);
  console.log('  paused:', oc.paused);
  // mint account raw
  const mi = await c.getAccountInfo(MINT);
  if (!mi) throw new Error('Mint account not found');
  console.log('\nCredit mint account:');
  console.log('  owner (token program):', mi.owner.toBase58());
  console.log('  executable:', mi.executable, '| lamports:', mi.lamports);
  // mint authority is bytes 4..36 of a Token-2022 mint
  const auth = new PublicKey(mi.data.slice(4, 36));
  console.log('  mintAuthority:', auth.toBase58());
  console.log('  matches Oracle Mint Authority PDA (2U6o...Uj7F)?', auth.toBase58() === '2U6oRZXyRgh4Hot3dKRGWanEJYqvd95gMCYEZu8ZUj7F');
}
main().catch(e => { console.error(e); process.exit(1); });
