import { Connection, clusterApiUrl, PublicKey } from '@solana/web3.js';

const RPC = process.env.SOLANA_RPC_URL || clusterApiUrl('devnet');
const SIG = '2riFzMYyzxTks3QB5Kph25qYNEJT934iXncyrFBYz7ZHfBt7ZyxMjMLyHu4XtpUF7Y5i3wtnkcGXybVRwmQsVh3M';

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  const tx = await conn.getParsedTransaction(SIG, { maxSupportedTransactionVersion: 0 });
  if (!tx) { console.log('TX NOT FOUND (maybe wrong cluster or not confirmed)'); return; }
  console.log('Slot:', tx.slot);
  console.log('Success:', tx.meta?.err === null);
  const keys = tx.transaction.message.accountKeys;
  console.log('Account keys:');
  keys.forEach((k: any, i: number) => console.log('  ', i, k.pubkey.toBase58(), k.signer ? '(signer)' : '', k.writable ? '(writable)' : ''));
  console.log('Instructions:');
  for (const ix of tx.transaction.message.instructions as any[]) {
    if (ix.programId) {
      console.log('  program:', ix.programId.toBase58());
      console.log('  accounts:', (ix.accounts || []).map((a: any) => a.pubkey?.toBase58?.() ?? a.toBase58?.() ?? a).join(', '));
      console.log('  data(b64):', ix.data);
    } else if (ix.parsed) {
      console.log('  parsed program:', ix.program);
      console.log('  type:', ix.parsed.type);
    }
  }
  console.log('Logs:');
  console.log(tx.meta?.logMessages?.join('\n'));
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
