/**
 * VerdiCred Stage 4 — shared configuration for the Devnet deployment scripts.
 *
 * VERIFIER_ORACLE_AUTHORITY is the Solana wallet that is the ONLY signer allowed
 * to mint carbon credits. It is supplied by the project owner and defaults to the
 * address provided in the Stage 4 brief. Paste your wallet's *private key* JSON
 * (the array form exported by `solana-keygen`) into VERIFIER_ORACLE_SECRET if you
 * want these scripts to sign mint/transfer/retire txs directly; otherwise the
 * backend (NestJS) signs on behalf of this authority.
 */
export const DEVNET_RPC = "https://api.devnet.solana.com";

/** The Verifier Oracle Authority wallet (public key). */
export const VERIFIER_ORACLE_AUTHORITY =
  "HNDAhSqXTA6woJLRRQpaMsWX171XVsjgxBXRxz95xfSB";

/**
 * Optional raw secret for the oracle authority, used only by the smoke test when
 * you want to sign mint txs from this script. Leave undefined to skip signing and
 * simply verify on-chain state. Format: Uint8Array | number[] | base58 string.
 */
export const VERIFIER_ORACLE_SECRET: number[] | null = null;

/** Default vintage used when a report does not carry an explicit verification year. */
export const DEFAULT_VINTAGE = 2026;
