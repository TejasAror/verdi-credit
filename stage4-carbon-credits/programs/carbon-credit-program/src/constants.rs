use anchor_lang::prelude::*;

// PDA / account seeds
pub const PROGRAM_SEED: &[u8] = b"verdicred";
pub const ORACLE_CONFIG_SEED: &[u8] = b"oracle_config";
pub const ORACLE_MINT_AUTHORITY_SEED: &[u8] = b"oracle_mint_authority";
pub const CREDIT_BATCH_SEED: &[u8] = b"credit_batch";
pub const RETIREMENT_SEED: &[u8] = b"retirement";

// SPL Token-2022: 1 credit = 1 verified tonne of CO2 -> zero decimals (fungible).
pub const CREDIT_DECIMALS: u8 = 0;

// Default vintage used when a caller does not supply one. Per the Stage 4 spec
// the *verification year* is the default vintage. The verification year of the
// report being issued is normally passed in; this constant is a safe fallback.
pub const DEFAULT_VINTAGE: u16 = 2026;

// Sizing limits (kept conservative to stay well under account size caps).
pub const MAX_STR_LEN: usize = 64; // projectId
pub const MAX_METHODOLOGY_LEN: usize = 64;
pub const MAX_CID_LEN: usize = 100; // IPFS CID
pub const MAX_EVIDENCE_CIDS: usize = 50; // number of evidence CIDs stored per batch
pub const MAX_REASON_LEN: usize = 200; // retirement reason
pub const MAX_REPORT_REF_LEN: usize = 128; // retirement report reference / CID
