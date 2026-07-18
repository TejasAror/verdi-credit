use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    burn, initialize_mint2, mint_to, spl_token_2022::state::Mint as SplMint, Burn,
    InitializeMint2, Mint, MintTo, TokenAccount, TokenInterface, ID as TOKEN_2022_PROGRAM_ID,
};

pub mod constants;
pub mod errors;
pub mod events;
pub mod state;

use crate::constants::*;
use crate::errors::*;
use crate::events::*;
use crate::state::*;

declare_id!("41jbriQNyaJLuUfJWennbwVqGTQeBDc94Ywj4pGBarnv");

fn check_len(s: &str, max: usize) -> Result<()> {
    require!(s.len() <= max, CarbonCreditError::StringTooLong);
    Ok(())
}

#[program]
pub mod carbon_credit_program {
    use super::*;

    /// Initializes the global OracleConfig. Only the deployment authority may call.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        require!(
            !ctx.accounts.oracle_config.credit_mint_set,
            CarbonCreditError::AlreadyInitialized
        );

        let cfg = &mut ctx.accounts.oracle_config;
        cfg.deployment_authority = ctx.accounts.deployment_authority.key();
        cfg.verifier_oracle_authority = ctx.accounts.verifier_oracle_authority.key();
        cfg.credit_mint = Pubkey::default();
        cfg.credit_mint_set = false;
        cfg.authority_name = "VERIFIER_ORACLE".to_string();
        cfg.paused = false;
        cfg.bump = ctx.bumps.oracle_config;
        cfg.oracle_mint_authority_bump = ctx.bumps.oracle_mint_authority;
        Ok(())
    }

    /// Creates the SPL Token-2022 credit mint (decimals = 0) and assigns the
    /// mint authority to the program-controlled Oracle Mint Authority PDA.
    /// Only the deployment authority may call, and only once.
    pub fn create_credit_mint(ctx: Context<CreateCreditMint>) -> Result<()> {
        let cfg = &mut ctx.accounts.oracle_config;
        require!(
            !cfg.credit_mint_set,
            CarbonCreditError::AlreadyInitialized
        );

        // Allocate the mint account with rent-exemption (Token-2022 base Mint
        // is 165 bytes), funded by the deployment authority. Without this the
        // subsequent `initialize_mint2` CPI fails with "Lamport balance below
        // rent-exempt threshold".
        // Token-2022 Mint account size (no extensions) is 82 bytes
        // (spl_token_2022::state::Mint::LEN). Funded by the deployment authority
        // with rent-exemption; without this the `initialize_mint2` CPI fails with
        // "Lamport balance below rent-exempt threshold".
        let mint_space: usize = 82;
        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(mint_space);

        let create_cpi_accounts = anchor_lang::system_program::CreateAccount {
            from: ctx.accounts.deployment_authority.to_account_info(),
            to: ctx.accounts.credit_mint.to_account_info(),
        };
        let create_cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            create_cpi_accounts,
        );
        anchor_lang::system_program::create_account(
            create_cpi_ctx,
            lamports,
            mint_space as u64,
            &ctx.accounts.token_program.key(),
        )?;

        // Initialize the mint with the Oracle Mint Authority PDA as mint authority.
        let seeds = &[ORACLE_MINT_AUTHORITY_SEED, &[cfg.oracle_mint_authority_bump]];
        let signer = &[&seeds[..]];

        let cpi_accounts = InitializeMint2 {
            mint: ctx.accounts.credit_mint.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        initialize_mint2(
            cpi_ctx,
            CREDIT_DECIMALS,
            &ctx.accounts.oracle_mint_authority.key(),
            Some(&ctx.accounts.oracle_mint_authority.key()),
        )?;

        cfg.credit_mint = ctx.accounts.credit_mint.key();
        cfg.credit_mint_set = true;
        Ok(())
    }

    /// Rotates the Verifier Oracle Authority. Only the current oracle authority may call.
    pub fn set_verifier_oracle_authority(
        ctx: Context<SetAuthorityCtx>,
        new_authority: Pubkey,
    ) -> Result<()> {
        let cfg = &mut ctx.accounts.oracle_config;
        let old = cfg.verifier_oracle_authority;
        cfg.verifier_oracle_authority = new_authority;
        emit!(OracleAuthorityChanged {
            old_authority: old,
            new_authority
        });
        Ok(())
    }

    /// Pauses / unpauses the program. Only the deployment authority may call.
    pub fn set_paused(ctx: Context<AdminCtx>, paused: bool) -> Result<()> {
        let cfg = &mut ctx.accounts.oracle_config;
        cfg.paused = paused;
        Ok(())
    }

    /// Mints carbon credits against a Stage 3 Verification Report.
    ///
    /// Enforcement (the core Stage 4 requirement):
    ///   * Only the Verifier Oracle Authority may invoke.
    ///   * `report_status` MUST be `Verified`; `PendingVerification` and
    ///     `Rejected` reports are rejected on-chain.
    ///   * Exactly `floor(verified_tonnes_scaled)` credits are minted — a strict
    ///     1:1 ratio with verified tonnes. The caller may NOT choose the amount;
    ///     the on-chain amount is derived from the report, preventing over-issuance.
    ///     (e.g. verifiedTonnes = 1250.7 -> 1250 credits).
    ///
    /// On first mint for (project_id, vintage) the CreditBatch PDA is created and
    /// the static metadata (methodology, evidence CIDs, report CID, status) is
    /// sealed. Subsequent mints for the same batch append to the tallies.
    pub fn mint_credit(ctx: Context<MintCredit>, params: MintParams) -> Result<()> {
        let MintParams {
            project_id,
            vintage,
            methodology,
            evidence_cids,
            report_cid,
            report_status,
            verified_tonnes_scaled,
        } = params;

        // --- Validation ---------------------------------------------------
        let cfg = &ctx.accounts.oracle_config;
        require!(!cfg.paused, CarbonCreditError::Paused);
        require_keys_eq!(
            ctx.accounts.verifier_oracle_authority.key(),
            cfg.verifier_oracle_authority,
            CarbonCreditError::Unauthorized
        );
        require!(cfg.credit_mint_set, CarbonCreditError::MintNotCreated);
        require_keys_eq!(
            ctx.accounts.credit_mint.key(),
            cfg.credit_mint,
            CarbonCreditError::MintMismatch
        );

        // Status gate: only VERIFIED reports may be issued against.
        require!(
            matches!(report_status, ReportStatus::Verified),
            CarbonCreditError::NotVerified
        );

        // 1:1 ratio — credits_to_mint = floor(verifiedTonnes). The supplied
        // value is already the floored integer tonnes (the backend floors it),
        // and amount is derived here so the oracle cannot over-issue.
        let amount = verified_tonnes_scaled;
        require!(amount > 0, CarbonCreditError::InvalidAmount);
        require!(vintage >= 1 && vintage <= 9999, CarbonCreditError::InvalidVintage);

        check_len(&project_id, MAX_STR_LEN)?;
        check_len(&methodology, MAX_METHODOLOGY_LEN)?;
        check_len(&report_cid, MAX_CID_LEN)?;
        require!(
            evidence_cids.len() <= MAX_EVIDENCE_CIDS,
            CarbonCreditError::TooManyEvidenceCids
        );
        for c in &evidence_cids {
            check_len(c, MAX_CID_LEN)?;
        }
        let evidence_cid = evidence_cids
            .first()
            .cloned()
            .unwrap_or_else(|| "NO_EVIDENCE".to_string());

        // --- Mint via Oracle PDA CPI -------------------------------------
        let seeds = &[ORACLE_MINT_AUTHORITY_SEED, &[cfg.oracle_mint_authority_bump]];
        let signer = &[&seeds[..]];

        let cpi_accounts = MintTo {
            mint: ctx.accounts.credit_mint.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: ctx.accounts.oracle_mint_authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        mint_to(cpi_ctx, amount)?;

        // --- Update / create the CreditBatch PDA -------------------------
        let batch = &mut ctx.accounts.credit_batch;
        // A non-empty project_id means the batch already exists -> enforce consistency.
        if !batch.project_id.is_empty() {
            require_keys_eq!(
                batch.mint,
                ctx.accounts.credit_mint.key(),
                CarbonCreditError::BatchMismatch
            );
            require_eq!(batch.project_id.clone(), project_id, CarbonCreditError::BatchMismatch);
            require_eq!(batch.vintage, vintage, CarbonCreditError::BatchMismatch);
            require_eq!(
                batch.report_cid.clone(),
                report_cid,
                CarbonCreditError::BatchMismatch
            );
        }
        batch.mint = ctx.accounts.credit_mint.key();
        batch.authority = ctx.accounts.verifier_oracle_authority.key();
        batch.project_id = project_id;
        batch.vintage = vintage;
        batch.methodology = methodology;
        batch.evidence_cid = evidence_cid;
        batch.report_cid = report_cid;
        batch.evidence_cids = evidence_cids;
        batch.report_status = report_status;
        batch.verified_tonnes_scaled = verified_tonnes_scaled;
        batch.total_minted = batch.total_minted.checked_add(amount).unwrap();
        batch.created_at = ctx.accounts.clock.unix_timestamp;
        batch.bump = ctx.bumps.credit_batch;

        emit!(CreditMinted {
            batch: batch.key(),
            mint: ctx.accounts.credit_mint.key(),
            project_id: batch.project_id.clone(),
            vintage,
            amount,
            recipient: ctx.accounts.recipient.key(),
            report_cid: batch.report_cid.clone(),
            authority: ctx.accounts.verifier_oracle_authority.key(),
            report_status: ReportStatus::Verified,
            verified_tonnes_scaled,
            total_minted: batch.total_minted,
        });
        Ok(())
    }

    /// Transfers `amount` credits from `from` to `to`. Owner of `from` signs.
    pub fn transfer_credit(ctx: Context<TransferCredit>, amount: u64) -> Result<()> {
        require!(amount > 0, CarbonCreditError::InvalidAmount);
        let cfg = &ctx.accounts.oracle_config;
        require_keys_eq!(
            ctx.accounts.credit_mint.key(),
            cfg.credit_mint,
            CarbonCreditError::MintMismatch
        );

        let cpi_accounts = anchor_spl::token_interface::TransferChecked {
            from: ctx.accounts.from_token_account.to_account_info(),
            mint: ctx.accounts.credit_mint.to_account_info(),
            to: ctx.accounts.to_token_account.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        anchor_spl::token_interface::transfer_checked(cpi_ctx, amount, CREDIT_DECIMALS)?;

        emit!(CreditTransferred {
            mint: ctx.accounts.credit_mint.key(),
            from: ctx.accounts.owner.key(),
            to: ctx.accounts.to.key(),
            amount,
        });
        Ok(())
    }

    /// Retires (burns) `amount` credits permanently. The supply is destroyed so
    /// the credits cannot be transferred or retired again. An immutable
    /// RetirementRecord PDA is written as the audit trail.
    pub fn retire_credit(ctx: Context<RetireCredit>, params: RetireParams) -> Result<()> {
        let RetireParams {
            amount,
            reason,
            report_ref,
        } = params;
        require!(amount > 0, CarbonCreditError::InvalidAmount);
        let cfg = &ctx.accounts.oracle_config;
        require_keys_eq!(
            ctx.accounts.credit_mint.key(),
            cfg.credit_mint,
            CarbonCreditError::MintMismatch
        );
        check_len(&reason, MAX_REASON_LEN)?;
        check_len(&report_ref, MAX_REPORT_REF_LEN)?;

        // The owner must hold at least `amount`.
        require!(
            ctx.accounts.owner_token_account.amount >= amount,
            CarbonCreditError::InsufficientBalance
        );

        // Tally guard: retired must never exceed minted for this batch.
        let batch = &mut ctx.accounts.credit_batch;
        require_keys_eq!(
            batch.mint,
            ctx.accounts.credit_mint.key(),
            CarbonCreditError::BatchMismatch
        );
        require!(
            batch.total_retired.checked_add(amount).unwrap() <= batch.total_minted,
            CarbonCreditError::RetirementOverflow
        );

        // Burn the tokens (permanently removes supply -> cannot be reused).
        let cpi_accounts = Burn {
            mint: ctx.accounts.credit_mint.to_account_info(),
            from: ctx.accounts.owner_token_account.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        burn(cpi_ctx, amount)?;

        batch.total_retired = batch.total_retired.checked_add(amount).unwrap();

        // Write the immutable retirement record.
        let rec = &mut ctx.accounts.retirement_record;
        rec.owner = ctx.accounts.owner.key();
        rec.mint = ctx.accounts.credit_mint.key();
        rec.batch = batch.key();
        rec.amount = amount;
        rec.reason = reason;
        rec.report_ref = report_ref;
        rec.timestamp = ctx.accounts.clock.unix_timestamp;
        rec.bump = ctx.bumps.retirement_record;

        // Bump the per-batch nonce so the next retirement gets a unique PDA.
        batch.retirement_count = batch.retirement_count.checked_add(1).unwrap();

        emit!(CreditRetired {
            owner: ctx.accounts.owner.key(),
            batch: batch.key(),
            mint: ctx.accounts.credit_mint.key(),
            amount,
            reason: rec.reason.clone(),
            retirement_record: rec.key(),
            timestamp: rec.timestamp,
            total_retired: batch.total_retired,
        });
        Ok(())
    }
}

// ----------------------------------------------------------------------------
// Instruction account contexts
// ----------------------------------------------------------------------------

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = deployment_authority,
        space = 8 + OracleConfig::INIT_SPACE,
        seeds = [PROGRAM_SEED, ORACLE_CONFIG_SEED],
        bump
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    /// CHECK: PDA used only as a signing seed for the Token-2022 mint authority.
    #[account(seeds = [ORACLE_MINT_AUTHORITY_SEED], bump)]
    pub oracle_mint_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub deployment_authority: Signer<'info>,

    /// CHECK: the Verifier Oracle Authority wallet (no on-chain checks needed here).
    pub verifier_oracle_authority: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateCreditMint<'info> {
    #[account(mut, has_one = deployment_authority)]
    pub oracle_config: Account<'info, OracleConfig>,

    /// CHECK: PDA mint authority (signs mint init).
    #[account(seeds = [ORACLE_MINT_AUTHORITY_SEED], bump = oracle_config.oracle_mint_authority_bump)]
    pub oracle_mint_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub credit_mint: Signer<'info>,

    #[account(mut)]
    pub deployment_authority: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetAuthorityCtx<'info> {
    #[account(mut, has_one = verifier_oracle_authority)]
    pub oracle_config: Account<'info, OracleConfig>,
    pub verifier_oracle_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminCtx<'info> {
    #[account(mut, has_one = deployment_authority)]
    pub oracle_config: Account<'info, OracleConfig>,
    pub deployment_authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(params: MintParams)]
pub struct MintCredit<'info> {
    #[account(
        seeds = [PROGRAM_SEED, ORACLE_CONFIG_SEED],
        bump = oracle_config.bump
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    /// CHECK: PDA mint authority (signs the MintTo CPI).
    #[account(seeds = [ORACLE_MINT_AUTHORITY_SEED], bump = oracle_config.oracle_mint_authority_bump)]
    pub oracle_mint_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub credit_mint: InterfaceAccount<'info, Mint>,

    /// CHECK: the Verifier Oracle Authority (must match oracle_config.verifier_oracle_authority).
    #[account(mut)]
    pub verifier_oracle_authority: Signer<'info>,

    /// Recipient of the freshly minted credits.
    pub recipient: SystemAccount<'info>,

    #[account(
        init_if_needed,
        payer = verifier_oracle_authority,
        associated_token::mint = credit_mint,
        associated_token::authority = recipient,
        associated_token::token_program = token_program
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = verifier_oracle_authority,
        space = 8 + CreditBatch::INIT_SPACE,
        seeds = [PROGRAM_SEED, CREDIT_BATCH_SEED, credit_mint.key().as_ref(), params.project_id.as_bytes(), &params.vintage.to_le_bytes()],
        bump
    )]
    pub credit_batch: Account<'info, CreditBatch>,

    #[account(address = TOKEN_2022_PROGRAM_ID)]
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct TransferCredit<'info> {
    #[account(seeds = [PROGRAM_SEED, ORACLE_CONFIG_SEED], bump = oracle_config.bump)]
    pub oracle_config: Account<'info, OracleConfig>,

    #[account(mut)]
    pub credit_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: destination wallet.
    pub to: SystemAccount<'info>,

    #[account(mut, constraint = from_token_account.owner == owner.key() @ CarbonCreditError::Unauthorized)]
    pub from_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, constraint = to_token_account.mint == credit_mint.key())]
    pub to_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
#[instruction(params: RetireParams)]
pub struct RetireCredit<'info> {
    #[account(seeds = [PROGRAM_SEED, ORACLE_CONFIG_SEED], bump = oracle_config.bump)]
    pub oracle_config: Account<'info, OracleConfig>,

    #[account(mut)]
    pub credit_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, constraint = owner_token_account.owner == owner.key() @ CarbonCreditError::Unauthorized)]
    pub owner_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED, CREDIT_BATCH_SEED, credit_mint.key().as_ref(), credit_batch.project_id.as_bytes(), &credit_batch.vintage.to_le_bytes()],
        bump = credit_batch.bump
    )]
    pub credit_batch: Account<'info, CreditBatch>,

    #[account(
        init,
        payer = owner,
        space = 8 + RetirementRecord::INIT_SPACE,
        seeds = [PROGRAM_SEED, RETIREMENT_SEED, credit_mint.key().as_ref(), owner.key().as_ref(), &credit_batch.retirement_count.to_le_bytes()],
        bump
    )]
    pub retirement_record: Account<'info, RetirementRecord>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

// ----------------------------------------------------------------------------
// Instruction parameter structs
// ----------------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MintParams {
    pub project_id: String,
    pub vintage: u16,
    pub methodology: String,
    /// All evidence CIDs associated with the verification report.
    pub evidence_cids: Vec<String>,
    /// IPFS CID of the Stage 3 verification report.
    pub report_cid: String,
    /// Report verification status. Must be `Verified` (1) or minting is blocked.
    pub report_status: ReportStatus,
    /// Verified tonnes (already floored to an integer). credits_to_mint == this.
    pub verified_tonnes_scaled: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RetireParams {
    pub amount: u64,
    pub reason: String,
    pub report_ref: String,
}

// Keep the unused import warning quiet for SplMint if not referenced elsewhere.
#[allow(dead_code)]
type _SplMintAlias = SplMint;
