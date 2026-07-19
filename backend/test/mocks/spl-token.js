// Jest stub for @solana/spl-token (ESM at runtime; not exercised in unit specs).
const TOKEN_2022_PROGRAM_ID = { toBase58: () => 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' };
const ASSOCIATED_TOKEN_PROGRAM_ID = { toBase58: () => 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' };
const getAssociatedTokenAddressSync = () => ({ toBase58: () => 'stubAta' });
module.exports = {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
};
