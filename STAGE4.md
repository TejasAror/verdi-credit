# VerdiCred — Stage 4: Carbon Credit Issuance (Solana / Anchor / SPL Token-2022)

This document is the **final end-to-end workflow specification + implementation
record** for Stage 4: turning a verified carbon project into **tamper-evident,
on-chain carbon credits**. It describes the architecture, the on-chain program,
the backend bridge, the wire contract with Stage 3, how to run/test/deploy, and
the test results.

> **Status: COMPLETE.** Stage 4 is fully built and wired across three layers:
>   - **On-chain:** an Anchor program (`carbon_credit_program`) compiled and
>     tested against a local validator, with devnet deploy scripts.
>   - **Backend:** a NestJS `carbon-credits` module that reads Stage 3 reports
>     and issues 1:1 credits through the Solana program.
>   - **Frontend:** a Carbon Credits dashboard (this repo, `frontend/`) used by
>     Auditors/Admins to check eligibility, issue credits, and audit supply.
>
> This file is the authoritative *workflow* doc. The lower-level program design
> notes live in `stage4-carbon-credits/docs/END_TO_END_WORKFLOW.md`.
>
> Network: **Solana Devnet** (development/testing only).
> Program ID (deployed/local): `41jbriQNyaJLuUfJWennbwVqGTQeBDc94Ywj4pGBarnv`
> Verifier Oracle Authority (Stage 4 dev): `HNDAhSqXTA6woJLRRQpaMsWX171XVsjgxBXRxz95xfSB`

---

## 1. Goal & pipeline at a glance

For a project that has passed Stage 3 verification, Stage 4:

1. **Checks eligibility** — is there a latest `VERIFIED` Stage 3 report, and how
   many credits would it yield (1 credit = 1 floored verified tonne)?
2. **Issues credits** — an authorized Verifier Oracle Authority mints SPL
   Token-2022 credits against that report, permanently linking the on-chain
   batch to the off-chain IPFS report CID.
3. **Transfers / retires** — holders can move credits between wallets, or
   **retire (burn)** them, which destroys supply and writes an immutable
   retirement record.
4. **Audits** — anyone can read the on-chain `CreditBatch` and `RetirementRecord`
   PDAs to prove how many tonnes were issued, moved, and retired.

```text
   POST /api/verification/:projectId/verify          (Stage 3 — verification engine)
                │  NDVI + Carbon + Anomaly + Confidence
                │  PDF report pinned to IPFS (reportCid)
                ▼
   VerificationReport { projectId, verifiedTonnes, status=VERIFIED,
                        reportCid, metadata.methodology, metadata.evidence[].cid }
                │
   ┌────────────┴─────────────── STAGE 4 BOUNDARY ────────────────┐
   │                                                              │
   │  GET  /api/carbon-credits/eligible/:projectId               │  (any authed user)
   │        → latest Stage 3 report → eligible? + amount          │
   │                                                              │
   │  POST /api/carbon-credits/issue  { projectId, recipient }    │  (AUDITOR / ADMIN)
   │        → amount = floor(verifiedTonnes)                       │
   │        → build + sign mintCredit as Oracle Authority          │
   │        → CPI: Oracle PDA mints Token-2022 credits             │
   │        → CreditBatch PDA written; CreditMinted emitted        │
   │                                                              │
   │  POST /api/carbon-credits/transfer  { mint, from, to, amt }  │  (owner signs)
   │  POST /api/carbon-credits/retire    { mint, owner, amt, why }│  (owner signs)
   │  GET  /api/carbon-credits/:mint/batches                      │  (audit)
   │  GET  /api/carbon-credits/:mint/retirements                  │  (audit)
   └──────────────────────────────────────────────────────────────┘
                │
                ▼
        On-chain CreditBatch + RetirementRecord PDAs
        (immutable, queryable, linked to IPFS report)
```

---

## 2. Tokenomics (SPL Token-2022)

- A single **Carbon Credit Mint** is created with **`decimals = 0`** so each
  whole token is exactly one tonne of CO₂ (no fractional credits).
- Credits are **fungible Token-2022 tokens** (tonnes are interchangeable, not
  NFTs).
- **Mint authority** = an **Oracle Mint Authority PDA** derived from the
  program (`seeds = [b"oracle_mint_authority"]`). Only that PDA can mint, and it
  only mints inside `mintCredit` when the **Verifier Oracle Authority** also
  signs.
- **Retirement** = burning the tokens from the holder's Token-2022 ATA and
  writing an immutable `RetirementRecord` PDA. Burned supply cannot be
  transferred or retired again → **reuse is impossible by construction**.
- Token-2022 (not classic SPL Token) is used so the program is extension-ready
  (future: confidential transfers, transfer fees, on-chain metadata extension).
  The program talks to it via `anchor_spl::token_interface`.

---

## 3. Stage 3 → Stage 4 Data Contract (Integration Mapping)

The on-chain program is **stateless about verification** — it cannot read the
SQL DB or IPFS. The **backend is the bridge**: it reads Stage 3, validates, and
submits a signed `mintCredit` as the Oracle Authority. The canonical mapping
(implemented in `backend/src/carbon-credits/adapters/stage3-to-onchain.adapter.ts`):

| Stage 4 field (mint arg) | Source (Stage 3)                                                       | Notes |
|--------------------------|------------------------------------------------------------------------|-------|
| `projectId`              | `VerificationReport.projectId` (uuid)                                  | Stored as UTF-8 in the batch PDA. |
| `vintage`                | Derived: **year of report `createdAt`**, or supplied by caller         | Stage 3 has no vintage column; default = report year. |
| `methodology`            | `VerificationReport.metadata.methodology`                              | e.g. `"VM0036"`, `"AR-ACM"`. |
| `evidence_cids`          | `VerificationReport.metadata.evidence.map(e => e.cid)`                  | All evidence CIDs; `evidence_cid` = first. |
| `report_cid`             | `VerificationReport.reportCid`                                         | IPFS CID of the pinned PDF report. |
| `verified_tonnes_scaled` | `Math.floor(VerificationReport.verifiedTonnes)`                         | Mint amount; decimals = 0. |
| `report_status`          | `VerificationReport.status`                                            | Must be `VERIFIED` to issue (on-chain gate). |

**1:1 rule enforcement (defense in depth):** the amount is floored in *two*
places — the backend adapter (`Math.floor(verifiedTonnes)`) and the on-chain
program, which treats the supplied `verified_tonnes_scaled` as the exact mint
amount and refuses any caller-supplied override. The Oracle Authority cannot
over-issue because the program derives the credit count from the report, not
from a free-form amount. Example: `verifiedTonnes = 1250.7 → 1250 credits`.

---

## 4. On-Chain Program — `carbon_credit_program` (Anchor)

Source: `stage4-carbon-credits/programs/carbon-credit-program/src/`
(`lib.rs`, `state.rs`, `constants.rs`, `events.rs`, `errors.rs`).
Compiled artifacts: `stage4-carbon-credits/target/deploy/carbon_credit_program.so`
and `target/idl/carbon_credit_program.json`.

### 4.1 PDAs & Accounts

| Account | Seeds | Purpose |
|---------|-------|---------|
| `OracleConfig` | `[b"verdicred", b"oracle_config"]` | Global config: `deployment_authority`, `verifier_oracle_authority`, `credit_mint`, `credit_mint_set`, `paused`, bumps. Created once by deployment authority. |
| `OracleMintAuthority` (PDA) | `[b"oracle_mint_authority"]` | The **mint authority** signer for Token-2022 `mint_to`. Controlled by the program (CPI signed by seeds). |
| `CreditMint` | (created immutable) | SPL Token-2022 mint, `decimals = 0`, `mint_authority = OracleMintAuthority`. |
| `CreditBatch` | `[b"verdicred", b"credit_batch", credit_mint, project_id, vintage_le]` | Per (project, vintage) issuance metadata + tallies: `project_id`, `vintage: u16`, `methodology`, `evidence_cid`, `report_cid`, `evidence_cids: Vec<String>`, `report_status`, `verified_tonnes_scaled`, `total_minted: u64`, `total_retired: u64`, `retirement_count: u64`, `created_at`, `bump`. |
| `RetirementRecord` | `[b"verdicred", b"retirement", credit_mint, owner, retirement_count_le]` | Immutable record of one retirement: `owner`, `mint`, `batch`, `amount: u64`, `reason: String`, `report_ref: String`, `timestamp`, `bump`. |
| Holder `TokenAccount` (ATA) | standard ATA (Token-2022) | Where minted credits live; created on demand via AssociatedToken CPI. |

### 4.2 Instructions

1. **`initialize`** (deployment authority) — creates `OracleConfig`, sets
   `verifier_oracle_authority` and `deployment_authority`, `paused = false`.
   Idempotency-guarded (`AlreadyInitialized`).
2. **`create_credit_mint`** (deployment authority) — creates the Token-2022
   `CreditMint` (`decimals = 0`, `mint_authority = OracleMintAuthority` PDA),
   funds it with rent-exemption, writes `credit_mint` into `OracleConfig`.
3. **`set_verifier_oracle_authority(new_authority)`** (current oracle authority)
   — rotates `verifier_oracle_authority`; emits `OracleAuthorityChanged`.
4. **`set_paused(paused)`** (deployment authority) — emergency pause.
5. **`mint_credit(params)`** (Verifier Oracle Authority signer + Oracle Mint
   Authority PDA + CPI to Token-2022) — args: `project_id`, `vintage`,
   `methodology`, `evidence_cids`, `report_cid`, `report_status`,
   `verified_tonnes_scaled`, `recipient`. Validations:
   - `verifier_oracle_authority` is a signer and equals `OracleConfig.verifier_oracle_authority` (`Unauthorized`).
   - `credit_mint_set` and matches `OracleConfig.credit_mint` (`MintNotCreated` / `MintMismatch`).
   - `!paused` (`Paused`).
   - **`report_status == Verified`** (`NotVerified`; `PendingVerification` and
     `Rejected` are explicitly blocked on-chain).
   - `verified_tonnes_scaled > 0` and `vintage ∈ [1, 9999]`
     (`InvalidAmount` / `InvalidVintage`).
   - String-length + evidence-CID-count limits (`StringTooLong` / `TooManyEvidenceCids`).
   - CPI `mint_to` → recipient ATA; `CreditBatch` created/updated (metadata
     sealed on first mint, re-checked for consistency on later mints);
     `total_minted += amount`; emits `CreditMinted`.
6. **`transfer_credit(amount)`** (owner of source ATA) — CPI Token-2022
   `transfer_checked`; emits `CreditTransferred`.
7. **`retire_credit(params)`** (owner of source ATA) — args: `amount`, `reason`,
   `report_ref`. Validations: `owner_token_account.amount >= amount`
   (`InsufficientBalance`); `total_retired + amount <= total_minted`
   (`RetirementOverflow`). CPI `burn` (supply destroyed); `RetirementRecord`
   written with a unique nonce; `total_retired += amount`; emits `CreditRetired`.

> **Double-retirement prevention:** burning removes the tokens from circulating
> supply, so the same token can never be retired or transferred twice. The
> `total_retired` tally + immutable `RetirementRecord` PDAs are the permanent,
> queryable audit trail.

### 4.3 Events

```rust
CreditMinted    { batch, mint, project_id, vintage, amount, recipient,
                  report_cid, authority, report_status, verified_tonnes_scaled, total_minted }
CreditTransferred { mint, from, to, amount }
CreditRetired   { owner, batch, mint, amount, reason, retirement_record, timestamp, total_retired }
OracleAuthorityChanged { old_authority, new_authority }
```

### 4.4 Errors

`Unauthorized`, `AlreadyInitialized`, `MintNotCreated`, `InvalidAmount`,
`Paused`, `InvalidVintage`, `InsufficientBalance`, `RetirementOverflow`,
`MintMismatch`, `BatchMismatch`, `StringTooLong`, `NotVerified`,
`TooManyEvidenceCids`, `BatchNotInitialized`.

---

## 5. Off-Chain Backend Integration (NestJS, `backend/src/carbon-credits/`)

Module: `CarbonCreditsModule` (imports `VerificationModule`; wired into
`AppModule`). Files:

- `carbon-credits.controller.ts` — REST endpoints (below).
- `carbon-credits.service.ts` — orchestrator: reads Stage 3 (`VerificationService.latestForProject`), applies the 1:1 floor, calls the Solana bridge, returns results.
- `solana-issuance.service.ts` — Anchor client that builds/signs/submits
  `mintCredit` as the Oracle Authority and reads PDAs for audit. Runs in a
  **degraded (no-chain) mode** if `SOLANA_PROGRAM_ID` / `VERIFIER_ORACLE_SECRET_KEY`
  are unset (fails loudly rather than faking a tx).
- `adapters/stage3-to-onchain.adapter.ts` — the Stage 3 → `mintCredit` mapping (§3).
- `dto/carbon-credits.dto.ts` — request/response schemas.
- `types/carbon_credit_program.ts` + `idl/carbon_credit_program.json` — generated bindings.

### 5.1 Endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/carbon-credits/eligible/:projectId` | any authed | Latest Stage 3 report → `{ eligible, verifiedTonnes, reportCid, evidenceCID, methodology, status, confidenceScore, amount }`. |
| POST | `/carbon-credits/issue` | AUDITOR / ADMIN | `{ projectId, recipient, vintage? }` → validates `VERIFIED`, `amount = floor(verifiedTonnes)`, signs+submits `mintCredit` → `{ txSignature, batchPda, mint, amount, projectId, vintage }`. |
| POST | `/carbon-credits/transfer` | any authed | `{ mint, from, to, amount }` → builds owner-signed-ready tx (base64). |
| POST | `/carbon-credits/retire` | any authed | `{ mint, owner, amount, reason, reportRef? }` → builds owner-signed-ready tx (base64). |
| GET | `/carbon-credits/:mint/batches` | any authed | All `CreditBatch` PDAs for a mint. |
| GET | `/carbon-credits/:mint/retirements` | any authed | All `RetirementRecord` PDAs (retirement ledger). |

- **Oracle Authority key:** `VERIFIER_ORACLE_SECRET_KEY` env (base58 / JSON /
  comma-list). Loaded in `SolanaIssuanceService`.
- **Program ID:** `SOLANA_PROGRAM_ID`; optional `SOLANA_RPC_URL` (defaults to devnet).
- The `issue` flow is the automated 1:1 bridge:
  `latest VERIFIED report → floor(verifiedTonnes) → mintCredit(...)`.

---

## 6. END-TO-END WORKFLOW (the requested flow)

```text
[1] PROJECT + EVIDENCE (Stage 1/2)
    Developer creates Project (methodology, geoPolygon) and uploads Evidence
    (each pinned → CID).                         (off-chain DB + IPFS)

[2] VERIFICATION (Stage 3)
    POST /api/verification/:projectId/verify
    → NDVI + Carbon + Anomaly + Confidence → PDF → IPFS pin (reportCid)
    → VerificationReport persisted: { projectId, verifiedTonnes, status=VERIFIED,
       reportCid, metadata.evidence[].cid, metadata.methodology }

[3] ELIGIBILITY CHECK (Stage 4 backend, frontend dashboard)
    GET /api/carbon-credits/eligible/:projectId
    → backend calls Stage 3 latestForProject → checks status == VERIFIED
    → returns verifiedTonnes, amount = floor(verifiedTonnes), reportCid,
       evidenceCID, methodology, vintage

[4] ISSUANCE (Stage 4 on-chain, triggered from dashboard by AUDITOR/ADMIN)
    POST /api/carbon-credits/issue { projectId, recipient }
    → backend amount = floor(verifiedTonnes)         [1:1 enforced here + on-chain]
    → builds mint_credit(project_id, vintage, methodology, evidence_cids,
       report_cid, report_status=Verified, verified_tonnes_scaled, recipient)
    → signed by VERIFIER ORACLE AUTHORITY (HNDAhSqX…)
    → CPI: OracleMintAuthority PDA mints that many Token-2022 credits → recipient ATA
    → CreditBatch PDA written/updated; event CreditMinted emitted
    → returns txSignature + batchPda to caller

[5] TRANSFER (Stage 4 on-chain, owner signs)
    POST /api/carbon-credits/transfer { mint, from, to, amount }
    → build transfer_credit; owner wallet signs + submits
    → CPI Token-2022 transfer_checked; event CreditTransferred

[6] RETIREMENT (Stage 4 on-chain, owner signs)
    POST /api/carbon-credits/retire { mint, owner, amount, reason }
    → build retire_credit; owner wallet signs + submits
    → CPI Token-2022 burn (tokens destroyed → unreusable)
    → RetirementRecord PDA created; CreditBatch.total_retired += amount
    → event CreditRetired

[7] AUDIT / PROOF
    GET /api/carbon-credits/:mint/batches        → per-project issuance ledgers
    GET /api/carbon-credits/:mint/retirements    → immutable retirement ledger
    On-chain CreditBatch.report_cid ↔ off-chain IPFS PDF (tamper-evident link)
```

---

## 7. Frontend — Carbon Credits Dashboard (`frontend/src/app/carbon-credits/`)

A dedicated page for **AUDITOR / ADMIN** users:

- **Eligibility panel** — enter a `projectId`, call `GET /carbon-credits/eligible/:projectId`,
  and see eligibility, `verifiedTonnes`, the 1:1 `amount`, report CID, methodology, vintage.
- **Issue panel** — enter the recipient wallet (base58) and an optional vintage,
  call `POST /carbon-credits/issue`, and display the returned `txSignature`,
  `batchPda`, `mint`, and `amount`.
- **Audit view** — given a `mint` address, call `GET /:mint/batches` and
  `GET /:mint/retirements` and render the on-chain ledgers.

Gated exactly like the Stage 3 verify flow: only `AUDITOR` and `ADMIN` roles may
*issue*; eligibility and audit reads are available to any authenticated user.
(Implementation: `frontend/src/app/carbon-credits/page.tsx`, API helpers in
`frontend/src/lib/api.ts` under the Carbon Credits section, types in
`frontend/src/lib/types.ts`.)

---

## 8. Directory Layout

```text
stage4-carbon-credits/                 # on-chain program + tooling
├── Anchor.toml                        # devnet + localnet, program id
├── Cargo.toml / Cargo.lock            # workspace
├── package.json                       # anchor + mocha + @solana/web3.js + spl-token
├── programs/carbon-credit-program/src/
│   ├── lib.rs                         # instructions, account contexts, params
│   ├── state.rs                       # OracleConfig, CreditBatch, RetirementRecord, ReportStatus
│   ├── constants.rs                   # seeds, CREDIT_DECIMALS=0, sizing limits
│   ├── events.rs                      # event defs
│   └── errors.rs                      # error codes
├── tests/carbon-credit-program.ts     # mint/transfer/retire/auth-fail/double-retire
├── scripts/
│   ├── config.ts                      # devnet RPC, oracle authority/secret
│   ├── deploy-devnet.sh               # solana config + airdrop + anchor build + deploy
│   ├── init-oracle.ts                 # initialize + create_credit_mint on devnet
│   └── smoke-devnet.ts                # end-to-end devnet smoke test
├── target/                            # compiled .so, IDL, TS types
└── docs/END_TO_END_WORKFLOW.md        # low-level program design notes

backend/src/carbon-credits/            # NestJS bridge (see §5)
frontend/src/app/carbon-credits/       # Carbon Credits dashboard (see §7)
```

---

## 9. Run / Verify

### 9.1 On-chain program (local validator)

```bash
cd stage4-carbon-credits
npm install
anchor build                 # produces target/deploy/carbon_credit_program.so + IDL
anchor test                  # spins a local validator + runs the mocha suite
```

The test suite (`tests/carbon-credit-program.ts`) exercises, against a live local
validator:
- `initialize` + idempotency (`AlreadyInitialized`),
- `create_credit_mint` (Token-2022, 0 decimals, Oracle PDA as mint authority),
- `mint_credit` VERIFIED gate + **1:1 floor** (1250.7 t → 1250 credits),
- **BLOCK** `PendingVerification` (`NotVerified`),
- **BLOCK** `Rejected` (`NotVerified`),
- **BLOCK** unauthorized signer (`Unauthorized`),
- `transfer_credit` balance assertions,
- `retire_credit` burn + immutable `RetirementRecord` + `total_retired` tally.

### 9.2 Devnet deploy + smoke

```bash
# 1) configure wallet + airdrop (the dev deployer wallet)
solana config set --url devnet
solana airdrop 2 <deployer>

# 2) build + deploy (writes target/deploy/.program_id)
npm run deploy:devnet

# 3) initialize OracleConfig + create the credit mint
npx ts-node scripts/init-oracle.ts

# 4) end-to-end: reject pending, mint verified, transfer, retire
npx ts-node scripts/smoke-devnet.ts
```
`scripts/smoke-devnet.ts` demonstrates the full lifecycle on live Devnet and
asserts Token-2022 balances. It signs with the real oracle wallet when
`VERIFIER_ORACLE_SECRET` is set in `scripts/config.ts`; otherwise it verifies
state after you issue separately (e.g. via the backend/dashboard).

### 9.3 Backend

```bash
cd backend
# .env.local needs:
#   SOLANA_PROGRAM_ID=41jbriQNyaJLuUfJWennbwVqGTQeBDc94Ywj4pGBarnv
#   VERIFIER_ORACLE_SECRET_KEY=<base58 | [u8,...] | "u8,u8,...">
#   SOLANA_RPC_URL=https://api.devnet.solana.com   (optional; devnet default)
npm run start
# endpoints live at http://localhost:3001/api/carbon-credits/...
```

### 9.4 Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000/carbon-credits  (sign in as AUDITOR/ADMIN)
npm run typecheck  # tsc --noEmit
npm run build
```

---

## 10. Assumptions / Open Decisions

- **Program ID** is the deploy-time address `41jbriQNyaJLuUfJWennbwVqGTQeBDc94Ywj4pGBarnv`
  (used for both localnet and devnet in `Anchor.toml`); the *oracle authority*
  wallet (`HNDAhSqX…`) is separate from the program ID and is the only signer
  permitted to mint.
- **vintage** defaults to the report's verification year (Stage 3 has no vintage
  column); an explicit `vintage` on `issue` overrides it.
- **1:1 + VERIFIED gating** is enforced in *both* the backend adapter and the
  on-chain program (defense in depth). The program trusts the oracle signature
  (standard for oracle-attested issuance); optional future hardening: anchor a
  report hash / zk-proof on-chain.
- **evidenceCids** = all evidence CIDs from `VerificationReport.metadata.evidence`;
  `evidence_cid` (singular, stored on the batch) = the first.
- Decimals = 0 (whole-tonne credits); `verifiedTonnes` floored at issuance.
- Transfer/retire are **owner-signed**: the backend returns a base64 tx the
  client wallet signs + submits (the dashboard wires these endpoints; wallet
  submission is a client-side follow-up).
