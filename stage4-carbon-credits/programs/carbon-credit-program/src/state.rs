use crate::constants::*;
use anchor_lang::prelude::*;

/// Status of a Stage 3 Verification Report. Only `Verified` reports may be
/// used to mint carbon credits. `PendingVerification` and `Rejected` reports
/// are explicitly blocked on-chain.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
#[repr(u8)]
pub enum ReportStatus {
    PendingVerification = 0,
    Verified = 1,
    Rejected = 2,
}

/// Global program configuration. Created once by the deployment authority.
/// `credit_mint` remains the default (zero) Pubkey until `create_credit_mint` runs.
#[account]
#[derive(InitSpace)]
pub struct OracleConfig {
    pub deployment_authority: Pubkey,
    pub verifier_oracle_authority: Pubkey,
    pub credit_mint: Pubkey,
    pub credit_mint_set: bool,
    #[max_len(MAX_METHODOLOGY_LEN)]
    pub authority_name: String,
    pub paused: bool,
    pub bump: u8,
    pub oracle_mint_authority_bump: u8,
}

/// Per (project, vintage) issuance record. Stores the credit metadata required
/// for auditability and enforces 1:1 accounting via the minted/retired tallies.
#[account]
#[derive(InitSpace)]
pub struct CreditBatch {
    pub mint: Pubkey,
    pub authority: Pubkey,
    #[max_len(MAX_STR_LEN)]
    pub project_id: String,
    /// SHA-256 hash of project_id, truncated to 32 bytes for PDA seed compatibility.
    pub project_id_hash: [u8; 32],
    pub vintage: u16,
    #[max_len(MAX_METHODOLOGY_LEN)]
    pub methodology: String,
    #[max_len(MAX_CID_LEN)]
    pub evidence_cid: String,
    #[max_len(MAX_CID_LEN)]
    pub report_cid: String,
    #[max_len(MAX_EVIDENCE_CIDS, MAX_CID_LEN)]
    pub evidence_cids: Vec<String>,
    pub report_status: ReportStatus,
    /// The (already floored) verified tonnes this batch was issued against.
    /// credits_to_mint == verified_tonnes_scaled, guaranteeing the 1:1 ratio.
    pub verified_tonnes_scaled: u64,
    pub total_minted: u64,
    pub total_retired: u64,
    pub retirement_count: u64,
    pub created_at: i64,
    pub bump: u8,
}

/// Immutable, permanent record of a single retirement event. The underlying
/// Token-2022 supply is burned, so the credits can never be reused; this PDA is
/// the queryable, tamper-evident audit trail.
#[account]
#[derive(InitSpace)]
pub struct RetirementRecord {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub batch: Pubkey,
    pub amount: u64,
    #[max_len(MAX_REASON_LEN)]
    pub reason: String,
    #[max_len(MAX_REPORT_REF_LEN)]
    pub report_ref: String,
    pub timestamp: i64,
    pub bump: u8,
}
