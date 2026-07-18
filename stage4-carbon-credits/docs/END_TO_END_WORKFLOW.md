# VerdiCred — Stage 4: Carbon Credit Issuance (Solana / Anchor / SPL Token-2022)

## END-TO-END WORKFLOW & SYSTEM DESIGN

> Document status: v1 (design + workflow). This file is the source of truth that
> the Anchor program, tests, deployment scripts, and backend integration are built against.
>
> Network: **Solana Devnet** (development/testing only).
> Deployment / Verifier Oracle Authority wallet (Stage 4 dev):
> `HNDAhSqXTA6woJLRRQpaMsWX171XVsjgxBXRxz95xfSB`
> (This is the *authority* address, NOT the program ID.)

---

## 1. Objectives

1. Issue **carbon credits on Solana** where **1 credit = 1 verified tonne of CO₂**.
2. Only an **authorized Verifier Oracle Authority (or an Oracle PDA it controls)** can mint
   credits, and only after a **successful Stage 3 verification**.
3. Support three on-chain instructions: **mintCredit**, **transferCredit**, **retireCredit**.
4. Persist per-batch credit metadata: **projectId, vintage, methodology, evidenceCID, reportCID**.
5. **Retirement tracking** permanently marks credits as retired and prevents reuse.
6. Provide **backend integration endpoints** that consume Stage 3 Verification Reports and
   automatically issue credits at a **1:1 ratio with `verifiedTonnes`**.
7. Ship **comprehensive Anchor tests** + **Devnet deployment configuration**.

---

## 2. Tokenomics (SPL Token-2022)

- A single **Carbon Credit Mint** is created with **`decimals = 0`** so each whole token is
  exactly one tonne (no fractional credits).
- Credits are **fungible Token-2022 tokens** (tonnes are interchangeable, not NFTs).
- **Mint authority** = an **Oracle PDA** derived from the program. Only that PDA can mint,
  and it only mints when the **Verifier Oracle Authority** signs the `mintCredit` instruction.
- **Retirement** = burning the tokens from the holder's Associated Token Account (ATA) and
  writing an immutable **RetirementRecord** PDA. Burned supply cannot be transferred or
  retired again → **reuse is impossible by construction**; the record is the audit trail.
- We use Token-2022 (not classic SPL Token) per the Stage 4 requirement; the program talks to
  Token-2022 via `anchor_spl::token_interface` so the same code is extension-ready
  (future: confidential transfers, transfer fees, on-chain metadata extension).

---

## 3. Stage 3 → Stage 4 Data Contract (Integration Mapping)

The on-chain program is **trust-minimized but stateless about verification** — it cannot read
the SQL DB or IPFS. The **backend is the bridge**: it reads Stage 3, validates, and submits a
signed `mintCredit` as the Oracle Authority. The canonical mapping:

| Stage 4 field        | Source (Stage 3)                                                                 | Notes |
|----------------------|----------------------------------------------------------------------------------|-------|
| `projectId`          | `VerificationReport.projectId` (uuid)                                            | Stored as UTF-8 string in the batch PDA. |
| `vintage`            | Derived: **year of verification** (`createdAt.getFullYear()`), or supplied by caller | Vintage is NOT a Stage 3 column; default = report year. |
| `methodology`        | `Project.methodology` (via report `metadata.methodology`)                        | e.g. "VM0036", "AR-ACM". |
| `evidenceCID`        | `VerificationReport.metadata.evidence[0].cid` (first evidence item's IPFS CID)   | Fallback: project-level evidence CID. |
| `reportCID`          | `VerificationReport.reportCid`                                                   | IPFS CID of the pinned PDF report. |
| `verifiedTonnes`     | `VerificationReport.verifiedTonnes` (Float)                                      | Mint amount = `Math.round(verifiedTonnes)` (decimals=0). |
| `confidenceScore`    | `VerificationReport.confidenceScore`                                             | Issuance gate: only `status == VERIFIED` (optionally `>=` threshold). |
| `status`             | `VerificationReport.status`                                                      | Must be `VERIFIED` to issue. |

**1:1 rule enforcement:** the backend computes `amount = round(verifiedTonnes)` and calls
`mintCredit` with exactly that amount. The program records `amount` and `reportCID` so any
observer can later cross-check the on-chain batch against the off-chain report. The Oracle
Authority wallet only signs after the backend confirms `status == VERIFIED`.

---

## 4. On-Chain Program Design — `CarbonCreditProgram` (Anchor)

### 4.1 PDAs & Accounts

| Account | Seeds | Purpose |
|---------|-------|---------|
| `OracleConfig` | `["oracle_config", program_id]` | Global config: `verifier_oracle_authority`, `deployment_authority`, `credit_mint: Option<Pubkey>`, `paused: bool`, `bump`. Initialized once by deployment authority. |
| `OracleMintAuthority` (PDA) | `["oracle_pda", program_id]` | The **mint authority** signer for Token-2022 `mint_to`. Controlled by the program (CPI signed by `seeds`). |
| `CreditMint` | (created immutable) | SPL Token-2022 mint, `decimals=0`, `mint_authority = OracleMintAuthority`. |
| `CreditBatch` | `["credit_batch", credit_mint, project_id, vintage]` | Per (project, vintage) issuance metadata + tallies. Stores: `project_id`, `vintage: u16`, `methodology`, `evidence_cid`, `report_cid`, `mint: Pubkey`, `total_minted: u64`, `total_retired: u64`, `authority: Pubkey`, `bump`. |
| `RetirementRecord` | `["retirement", credit_mint, owner, nonce]` | Immutable record of one retirement: `owner`, `batch`, `amount: u64`, `reason: String`, `timestamp`, `report_ref: String`, `bump`. |
| Holder `TokenAccount` (ATA) | standard ATA (Token-2022) | Where minted credits live; created on demand via AssociatedToken CPI. |

### 4.2 Instructions

1. **`initialize`** (deployment authority)
   - Creates `OracleConfig`, sets `verifier_oracle_authority = HNDAhSqXTA6woJLRRQpaMsWX171XVsjgxBXRxz95xfSB`,
     `deployment_authority = signer`, `credit_mint = None`, `paused = false`.
   - Guard: only `deployment_authority` (the dev wallet) may call; idempotency check.

2. **`create_credit_mint`** (deployment authority)
   - Creates the Token-2022 `CreditMint` (`decimals = 0`), `mint_authority = OracleMintAuthority` PDA.
   - Writes `credit_mint` into `OracleConfig`.

3. **`set_verifier_oracle_authority(new_authority)`** (current oracle authority)
   - Rotates `verifier_oracle_authority`. Emits `OracleAuthorityChanged`.

4. **`mintCredit`** (Verifier Oracle Authority signer + OracleMintAuthority PDA + CPI to Token-2022)
   - Args: `project_id: String`, `vintage: u16`, `methodology: String`, `evidence_cid: String`,
     `report_cid: String`, `amount: u64`, `recipient: Pubkey`.
   - Validations:
     - `verifier_oracle_authority` is a signer and equals `OracleConfig.verifier_oracle_authority`.
     - `OracleConfig.credit_mint` is set and equals `CreditMint`.
     - `amount > 0`; `!paused`.
     - `recipient` ATA exists (init if needed, Token-2022 aware).
     - `CreditBatch` for `(project_id, vintage)` created/loaded; metadata written on first mint.
   - CPI: `mint_to` `amount` tokens from `CreditMint` (authority = OracleMintAuthority PDA) → recipient ATA.
   - Update `CreditBatch.total_minted += amount`.
   - Emit `CreditMinted`.

5. **`transferCredit`** (owner of source ATA)
   - Args: `amount: u64`, `from: Pubkey`, `to: Pubkey`.
   - CPI: Token-2022 `transfer` from `from` ATA → `to` ATA (owner signs).
   - `to` ATA created on demand if missing.
   - Emit `CreditTransferred`.

6. **`retireCredit`** (owner of source ATA)
   - Args: `amount: u64`, `reason: String`, `report_ref: String` (optional retirement justification CID).
   - Validations:
     - `amount <= source ATA balance`.
     - `amount <= CreditBatch.total_minted - CreditBatch.total_retired` (safety tally).
   - CPI: Token-2022 `burn` `amount` from source ATA (tokens destroyed → cannot be reused).
   - Create `RetirementRecord` (unique `nonce`); `CreditBatch.total_retired += amount`.
   - Emit `CreditRetired`.

> **Double-retirement prevention:** burning removes the tokens from circulating supply, so the
> same token can never be retired or transferred twice. The `total_retired` tally + immutable
> `RetirementRecord` PDAs provide the permanent, queryable audit trail.

### 4.3 Events

```rust
CreditMinted    { batch: Pubkey, mint: Pubkey, project_id: String, vintage: u16,
                  amount: u64, recipient: Pubkey, report_cid: String, authority: Pubkey }
CreditTransferred { mint: Pubkey, from: Pubkey, to: Pubkey, amount: u64 }
CreditRetired   { owner: Pubkey, batch: Pubkey, amount: u64, reason: String,
                  retirement_record: Pubkey, timestamp: i64 }
OracleAuthorityChanged { old_authority: Pubkey, new_authority: Pubkey }
```

### 4.4 Errors (representative)

`Unauthorized`, `AlreadyInitialized`, `MintNotCreated`, `InvalidAmount`, `Paused`,
`BatchMismatch`, `InsufficientBalance`, `RetirementOverflow`, `InvalidVintage`.

---

## 5. Off-Chain Backend Integration (NestJS, `backend/`)

New module **`carbon-credits`** (or extends `verification`) exposing:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/carbon-credits/eligible/:projectId` | Fetch latest Stage 3 `VerificationReport`; return `{ eligible, verifiedTonnes, reportCid, methodology, evidenceCID, status, confidenceScore }`. |
| POST | `/carbon-credits/issue` | Body `{ projectId, recipient, vintage? }`. Validates `status == VERIFIED`, computes `amount = round(verifiedTonnes)`, builds + signs `mintCredit` tx as Oracle Authority, submits to Devnet, returns `{ txSignature, batchPda, mint, amount }`. |
| POST | `/carbon-credits/transfer` | Body `{ mint, from, to, amount }` → builds `transferCredit` (holder signs client-side or via wallet adapter). |
| POST | `/carbon-credits/retire` | Body `{ mint, amount, reason, owner }` → builds `retireCredit` (owner signs). |
| GET | `/carbon-credits/:mint/batches` | Read all `CreditBatch` PDAs for a mint (on-chain account fetch). |
| GET | `/carbon-credits/:mint/retirements` | Read all `RetirementRecord` PDAs (retirement ledger). |

- **Oracle Authority key:** `VERIFIER_ORACLE_SECRET_KEY` env (dev only) = the dev wallet keypair.
  Loaded via `@coral-xyz/anchor` `AnchorProvider`/`NodeWallet`.
- **Anchor client:** generated TypeScript IDL bindings (`target/types/carbon_credit_program.ts`)
  consumed by a `SolanaIssuanceService`.
- **Stage 3 read:** reuse `VerificationService.latestForProject(projectId)` (already exists) to
  obtain the report; map fields per §3 contract.
- The `issue` flow is the automated 1:1 bridge:
  `latest VERIFIED report → verifiedTonnes → mintCredit(amount=round, reportCID, evidenceCID, methodology, vintage)`.

---

## 6. END-TO-END WORKFLOW (the requested flow)

```
[1] PROJECT + EVIDENCE (Stage 1/2)
    Developer creates Project (methodology, geoPolygon) and uploads Evidence (each pinned → CID).
        │  (off-chain DB + IPFS)

[2] VERIFICATION (Stage 3)
    POST /verification/:projectId/verify
    → NDVI + Carbon + Anomaly + Confidence → PDF → IPFS pin (reportCid)
    → VerificationReport persisted: { projectId, verifiedTonnes, status=VERIFIED,
       reportCid, metadata.evidence[].cid, methodology }
        │

[3] ELIGIBILITY CHECK (Stage 4 backend)
    GET /carbon-credits/eligible/:projectId
    → backend calls Stage 3 latestForProject → checks status==VERIFIED
    → returns verifiedTonnes, reportCid, evidenceCID, methodology, vintage
        │

[4] ISSUANCE (Stage 4 on-chain)
    POST /carbon-credits/issue { projectId, recipient, vintage? }
    → backend amount = round(verifiedTonnes)   [1:1 ratio enforced here]
    → builds mintCredit(project_id, vintage, methodology, evidence_cid, report_cid, amount, recipient)
    → signed by VERIFIER ORACLE AUTHORITY (HNDAhSqXTA6woJLRRQpaMsWX171XVsjgxBXRxz95xfSB)
    → CPI: OracleMintAuthority PDA mints `amount` Token-2022 credits to recipient ATA
    → CreditBatch PDA written/updated; event CreditMinted emitted
    → returns txSignature + batchPda to caller
        │

[5] TRANSFER (Stage 4 on-chain)
    POST /carbon-credits/transfer  (or wallet does native Token-2022 transfer)
    → transferCredit(amount, from, to)
    → CPI Token-2022 transfer; event CreditTransferred
        │

[6] RETIREMENT (Stage 4 on-chain)
    POST /carbon-credits/retire { mint, amount, reason }
    → retireCredit(amount, reason)
    → CPI Token-2022 burn (tokens destroyed → unreusable)
    → RetirementRecord PDA created; CreditBatch.total_retired += amount
    → event CreditRetired
        │

[7] AUDIT / PROOF
    GET /carbon-credits/:mint/retirements  → immutable retirement ledger
    On-chain CreditBatch.report_cid ↔ off-chain IPFS PDF (tamper-evident linkage)
```

---

## 7. Directory Layout (to be created in this stage)

```
stage4-carbon-credits/
├── Anchor.toml                     # devnet cluster, wallet, program id placeholder
├── Cargo.toml                      # workspace
├── package.json                    # anchor + mocha + @solana/web3.js + spl-token
├── programs/
│   └── carbon-credit-program/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs              # program entry, instructions, errors
│           ├── state.rs            # OracleConfig, CreditBatch, RetirementRecord
│           ├── constants.rs        # seeds, decimals
│           └── events.rs           # event defs
├── tests/
│   └── carbon-credit-program.ts    # mint/transfer/retire/auth-fail/double-retire
├── scripts/
│   ├── deploy-devnet.sh            # solana config + airdrop + anchor build + deploy
│   ├── init-oracle.ts              # initialize + create_credit_mint on devnet
│   └── smoke-devnet.ts             # end-to-end devnet smoke test
├── backend-integration/            # NestJS additions (or merged into backend/)
│   └── carbon-credits/             # controller + service + DTOs + Anchor client
├── docs/
│   └── END_TO_END_WORKFLOW.md      # THIS FILE
└── README.md
```

---

## 8. Deployment to Devnet (summary)

1. `solana config set --url devnet` and `solana airdrop 2 <wallet>` (the dev wallet).
2. `anchor build` → generates `target/deploy/carbon_credit_program.so` + keypair + IDL.
3. `anchor deploy --provider.cluster devnet` (uses a freshly generated program keypair;
   the **program ID ≠ wallet address**).
4. `scripts/init-oracle.ts` runs `initialize` + `create_credit_mint`, setting
   `verifier_oracle_authority = HNDAhSqXTA6woJLRRQpaMsWX171XVsjgxBXRxz95xfSB`.
5. Backend reads `PROGRAM_ID` + `VERIFIER_ORACLE_SECRET_KEY` from env and is ready to issue.

Full scripts land in `scripts/` during implementation.

---

## 9. Testing Strategy

- **Anchor unit/integration (`tests/carbon-credit-program.ts`, `anchor test` on local validator):**
  - mint success (oracle authority) → balance == amount.
  - transfer success + balance assertions.
  - retire success → supply reduced, RetirementRecord exists.
  - **authorization failure:** non-oracle signer `mintCredit` → `Unauthorized` error.
  - **double-retirement prevention:** burn twice the same tokens → second fails
    (`InsufficientBalance`); confirm burned supply can't transfer.
  - paused guard, invalid amount, batch metadata correctness (projectId/vintage/CIDs).
- **Devnet smoke (`scripts/smoke-devnet.ts`):** real `initialize` + `mintCredit` + `retireCredit`
  against Devnet using the dev wallet as oracle authority.

---

## 10. Assumptions / Open Decisions

- **Program ID** is generated at deploy time (not the wallet). Docs reference a placeholder.
- **vintage** defaults to the verification year (Stage 3 has no vintage column yet).
- **1:1 enforcement + VERIFIED gating** is performed off-chain by the Oracle Authority/backend;
  the on-chain program trusts the oracle signature (standard for oracle-attested issuance).
  Optional future hardening: anchor a report hash / zk-proof on-chain.
- **evidenceCID** = first evidence item's CID from `VerificationReport.metadata.evidence`;
  can be extended to a list.
- Decimals = 0 (whole-tonne credits); `verifiedTonnes` rounded at issuance.
```
