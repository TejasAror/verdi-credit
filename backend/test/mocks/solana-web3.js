// Jest stub for @solana/web3.js — the real package ships ESM (rpc-websockets)
// that ts-jest (CJS) can't transpile. Retirement/marketplace specs mock the
// blockchain seam as a provider, so only import-time symbols need to exist.
class PublicKey {
  constructor(v) { this._v = v; }
  toBase58() { return String(this._v); }
  toBuffer() { return Buffer.from(String(this._v)); }
  static findProgramAddressSync() { return [new PublicKey('stub'), 0]; }
}
class Keypair {
  constructor() {
    // Synthetic 64-byte secret so SellerKeyService provisioning can snapshot it
    // into the encrypted vault (tests never need real ed25519 parity here).
    this.secretKey = new Uint8Array(64).fill(7);
  }
  static generate() { return new Keypair(); }
  static fromSecretKey() { return new Keypair(); }
  get publicKey() { return new PublicKey('stub'); }
}
class Connection {}
class Transaction {}
class VersionedTransaction {}
const SystemProgram = { programId: new PublicKey('11111111111111111111111111111111') };
const SYSVAR_CLOCK_PUBKEY = new PublicKey('SysvarC1ock11111111111111111111111111111111');
const clusterApiUrl = () => 'https://api.devnet.solana.com';

module.exports = {
  PublicKey,
  Keypair,
  Connection,
  Transaction,
  VersionedTransaction,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  clusterApiUrl,
};
