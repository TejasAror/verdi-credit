import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import * as bs58 from 'bs58';

const PROGRAM_ID = new PublicKey('41jbriQNyaJLuUfJWennbwVqGTQeBDc94Ywj4pGBarnv');
const RPC = process.env.SOLANA_RPC_URL || clusterApiUrl('devnet');

const PROGRAM_SEED = Buffer.from('verdicred');
const ORACLE_CONFIG_SEED = Buffer.from('oracle_config');
const ORACLE_MINT_AUTHORITY_SEED = Buffer.from('oracle_mint_authority');

function oracleConfigPda() {
  return PublicKey.findProgramAddressSync([PROGRAM_SEED, ORACLE_CONFIG_SEED], PROGRAM_ID)[0];
}
function oracleMintAuthorityPda() {
  return PublicKey.findProgramAddressSync([ORACLE_MINT_AUTHORITY_SEED], PROGRAM_ID)[0];
}

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  console.log('RPC:', RPC);
  console.log('Program:', PROGRAM_ID.toBase58());

  const cfgPda = oracleConfigPda();
  console.log('OracleConfig PDA:', cfgPda.toBase58());

  const cfgInfo = await conn.getAccountInfo(cfgPda);
  if (!cfgInfo || cfgInfo.owner.toBase58() !== PROGRAM_ID.toBase58()) {
    console.log('OracleConfig: NOT INITIALIZED (or owned by', cfgInfo?.owner.toBase58(), ')');
  } else {
    console.log('OracleConfig: INITIALIZED, data len =', cfgInfo.data.length);
    // Raw parse: skip 8-byte discriminator -> data
    const data = cfgInfo.data;
    // Try to find a pubkey that looks like the mint: scan for known mints
    console.log('Raw data (hex):', data.toString('hex'));
    // The mint is typically stored after a bool (1 byte) — let's scan for 32-byte pubkeys
    for (let i = 8; i + 32 <= data.length; i += 1) {
      const pk = new PublicKey(data.slice(i, i + 32));
      // heuristic: print all candidate pubkeys
      console.log(`  offset ${i}: ${pk.toBase58()}`);
    }
  }

  const mintAuth = oracleMintAuthorityPda();
  console.log('OracleMintAuthority PDA:', mintAuth.toBase58());
  const mintAuthInfo = await conn.getAccountInfo(mintAuth);
  console.log('OracleMintAuthority owner:', mintAuthInfo?.owner.toBase58(), 'lamports:', mintAuthInfo?.lamports);

  // Is there any Token-2022 mint owned by Token2022 program that we can discover via getProgramAccounts of the program?
  const progAccts = await conn.getProgramAccounts(PROGRAM_ID, { dataSlice: { offset: 0, length: 0 } });
  console.log('Program account count (PDAs):', progAccts.length);
  for (const a of progAccts) {
    console.log('  ', a.pubkey.toBase58(), 'len', a.account.data.length, 'owner', a.account.owner.toBase58());
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
