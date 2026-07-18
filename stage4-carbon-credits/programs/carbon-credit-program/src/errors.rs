use anchor_lang::prelude::*;

#[error_code]
pub enum CarbonCreditError {
    #[msg("Unauthorized: signer is not the Verifier Oracle Authority")]
    Unauthorized,
    #[msg("Program already initialized")]
    AlreadyInitialized,
    #[msg("Credit mint has not been created yet")]
    MintNotCreated,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Program is paused")]
    Paused,
    #[msg("Invalid vintage (must be 1..=9999)")]
    InvalidVintage,
    #[msg("Insufficient token balance for transfer or retirement")]
    InsufficientBalance,
    #[msg("Retirement overflow: retired exceeds minted")]
    RetirementOverflow,
    #[msg("Provided mint does not match the configured credit mint")]
    MintMismatch,
    #[msg("CreditBatch metadata mismatch for this project/vintage")]
    BatchMismatch,
    #[msg("String field exceeds the maximum allowed length")]
    StringTooLong,
    #[msg("Verification report status is not VERIFIED; issuance blocked")]
    NotVerified,
    #[msg("Too many evidence CIDs supplied")]
    TooManyEvidenceCids,
    #[msg("CreditBatch account is not initialized")]
    BatchNotInitialized,
}
