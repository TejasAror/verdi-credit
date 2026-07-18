use crate::state::ReportStatus;
use anchor_lang::prelude::*;

#[event]
pub struct CreditMinted {
    pub batch: Pubkey,
    pub mint: Pubkey,
    pub project_id: String,
    pub vintage: u16,
    /// Credits minted = floor(verified tonnes) for this report.
    pub amount: u64,
    pub recipient: Pubkey,
    pub report_cid: String,
    pub authority: Pubkey,
    pub report_status: ReportStatus,
    /// Verified tonnes (floored) the issuance is backed by.
    pub verified_tonnes_scaled: u64,
    pub total_minted: u64,
}

#[event]
pub struct CreditTransferred {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
}

#[event]
pub struct CreditRetired {
    pub owner: Pubkey,
    pub batch: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub reason: String,
    pub retirement_record: Pubkey,
    pub timestamp: i64,
    pub total_retired: u64,
}

#[event]
pub struct OracleAuthorityChanged {
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
}
