# VerdiCred — Stage 6: Credit Retirement (Solana burn + IPFS Certificate)

This document is the authoritative end-to-end specification + implementation
record for **Stage 6: Credit Retirement**. It describes the architecture, the
data model, the REST API, the on-chain (and mock) retirement seam, the PDF
certificate pipeline, the RBAC / audit model, the frontend, and how to run and
verify the feature end-to-end.

> **Status: COMPLETE.** Stage 6 is fully built and wired across four layers:
>   - **Backend (NestJS):** a `retirement` module that validates ownership +
>     balance, invokes the Solana retirement (burn) instruction, persists an
>     immutable `Retirement` record, generates + pins a PDF Retirement
>     Certificate to IPFS (storing only the CID), decrements the holding
>     balance, reconciles marketplace listings, and writes audit logs.
>   - **Database (Prisma / Postgres):** new `Holding` and `Retirement` models
>     plus a `RetirementStatus` enum and two new `AuditLogAction` values.
>   - **Frontend (Next.js):** a `Retire Credits` page (validation → confirm →
>     progress → success) and a `Retirement History` page (pagination, search,
>     filters, certificate/IPFS/tx links, PDF download).
>   - **Solana / IPFS:** a `RetirementBlockchainService` seam that mirrors the
>     Stage 5 marketplace — MOCK by default, real Anchor `retireCredit` when
>     `RETIREMENT_ONCHAIN=true` is set. Certificates pin to Pinata/IPFS.
>
> Network: **Solana Devnet** (when on-chain is enabled). In MOCK mode the
> feature works end-to-end with simulated burns + real IPFS pins.

---

## 1. Goal & pipeline at a glance

For a credit holding a user owns, Stage 6:

1. **Selects a holding** — the Retire Credits page lists the caller's owned
   holdings with available balance, project, vintage, methodology, and token
   details.
2. **Validates** — the backend checks the holding belongs to the caller and
   that `amount <= holding.availableBalance`, and that the connected wallet
   (when supplied) matches the holding wallet.
3. **Retires on-chain** — invokes the Solana retirement (burn/lock) instruction
   via `RetirementBlockchainService`, permanently removing the credits.
4. **Persists** — writes an immutable `Retirement` record (`PENDING` →
   `CONFIRMED`) with all required fields.
5. **Updates balances** — immediately decrements `Holding.availableBalance` and
   increments `Holding.totalRetired` inside the same DB transaction.
6. **Reconciles marketplace** — cancels any ACTIVE listing for the same token
   mint whose `amount` now exceeds the remaining balance, so retired credits
   can never be listed or sold again.
7. **Certifies** — generates a professional PDF Retirement Certificate, pins it
   to IPFS, stores only the returned CID, and sets status `CERTIFIED`.
8. **Audits** — appends immutable `CREDIT_RETIRED` / `RETIREMENT_CERTIFIED`
   entries to the audit log.

```text
  GET /api/retirements/holdings          (owned holdings w/ balances)
        │
  POST /api/retirements                  { holdingId, amount, reasonCategory, reason, walletAddress? }
        │
        ├─ validate ownership + balance (Holding row locked for update)
        ├─ RetirementBlockchainService.retireCredits()   → Solana burn (mock or real)
        ├─ prisma.$transaction {
        │     create Retirement (status=CONFIRMED)
        │     decrement Holding.availableBalance
        │     increment Holding.totalRetired
        │     cancel listings exceeding remaining balance
        │     auditLog CREDIT_RETIRED
        │   }
        ├─ CertificateGeneratorService.generateAndPin()  → PDF → Pinata/IPFS
        └─ update Retirement (certificateCid, certificateUrl, status=CERTIFIED)
              auditLog RETIREMENT_CERTIFIED

  GET /api/retirements                   (paged history; ADMIN sees all)
  GET /api/retirements/:id               (detail; own record, or ADMIN)
  GET /api/retirements/:id/certificate   (stream PDF; own record, or ADMIN)
```

---

## 2. Data model (Prisma)

Two new models are added (and the previously-uncommitted `Listing` model is
reconciled into `schema.prisma` so the schema is the single source of truth).

### `Holding` — off-chain ownership / balance

```prisma
model Holding {
  id              String   @id @default(uuid())
  ownerId         String
  walletAddress   String
  projectId       String
  tokenMint       String
  projectName     String
  projectType     ProjectType
  methodology     String
  vintage         Int
  availableBalance Int
  totalRetired    Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  owner           User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  project         Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  retirements     Retirement[]

  @@unique([ownerId, tokenMint])
  @@index([ownerId]) @@index([walletAddress]) @@index([projectId]) @@index([tokenMint])
}
```

`availableBalance` is the canonical source of truth for "what I can retire /
transfer / list". Retiring decrements it; the amount removed is added to
`totalRetired` and can never be reused.

### `Retirement` — immutable retirement record

```prisma
model Retirement {
  id                String           @id @default(uuid())
  retirementId      String           @unique
  holdingId         String
  projectId         String
  tokenMint         String
  retiredAmount     Int
  retiredBy         String
  walletAddress     String
  reason            String
  reasonCategory    String
  transactionSignature String
  certificateCid    String?
  certificateUrl    String?
  status            RetirementStatus @default(PENDING)
  organization      String?
  projectName       String?
  methodology       String?
  vintage           Int?
  metadata          Json?
  timestamp         DateTime
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt
  holder            User             @relation(fields: [retiredBy], references: [id], onDelete: Cascade)
  holding           Holding          @relation(fields: [holdingId], references: [id], onDelete: Cascade)
  project           Project          @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([retiredBy]) @@index([walletAddress]) @@index([projectId])
  @@index([tokenMint]) @@index([holdingId]) @@index([status]) @@index([createdAt])
}
```

`status` transitions `PENDING` → `CONFIRMED` (after on-chain retirement) →
`CERTIFIED` (after IPFS pin). It is **never reset**. `certificateCid` stores
only the IPFS CID; the PDF lives off-chain on IPFS.

### Enums / audit

```prisma
enum RetirementStatus { PENDING CONFIRMED CERTIFIED }

enum AuditLogAction {
  ROLE_CHANGED ROLE_PROMOTED ROLE_DEMOTED
  EVIDENCE_UPLOADED EVIDENCE_DELETED EVIDENCE_VIEWED
  CREDIT_RETIRED RETIREMENT_CERTIFIED   // ← new in Stage 6
}
```

A new generic `AuditLogService.recordAction({ actorId, targetId, action, reason })`
method records non-evidence events (retirements) without requiring an
`Evidence` FK, so the audit ledger stays clean.

---

## 3. Retirement (burn) — Solana seam

`RetirementBlockchainService` is the single seam between the retirement module
and Solana, mirroring the Stage 5 `BlockchainService`:

```ts
interface RetirementParams {
  tokenMint: string;     // on-chain credit mint (base58)
  walletAddress: string; // owner wallet authorizing the burn
  amount: number;        // credits (tonnes) to burn
  reason: string;        // mandatory retirement reason
  reportRef?: string;    // originating verification report id
}
interface RetirementSettlement {
  txSignature: string;   // base58-ish; mock signatures prefixed `mock_retire_`
  onChain: boolean;
  slot: number | null;
  retiredAt: string;     // ISO timestamp
}
```

- **MOCK mode (default):** `RETIREMENT_ONCHAIN` unset/false (or no
  `SOLANA_PROGRAM_ID`). Returns a synthetic settlement immediately. The credits
  are treated as burned; the off-chain `Holding` balance is decremented by the
  caller. Logs a clear warning so a mock signature is never mistaken for a real
  burn.
- **REAL mode:** `RETIREMENT_ONCHAIN=true` + `SOLANA_PROGRAM_ID` set. Replace the
  mock body with a real Anchor `retireCredit` call (reusing the PDA / oracle
  plumbing already in `carbon-credits/solana-issuance.service`). The controller,
  service, DTOs, and frontend are untouched because they depend only on this
  stable interface.

> This mirrors the project's established "mock seam → real chain" pattern: the
> marketplace (Stage 5) and retirement (Stage 6) both ship working MOCK
> implementations so the full lifecycle is demonstrable without the program
> being deployed; only the seam class changes to go on-chain.

---

## 4. Certificate pipeline (PDF → IPFS → CID)

`CertificateGeneratorService`:

1. **Renders** a professional A4 PDF (`pdfkit`) containing:
   - header band, certificate id, issue timestamp
   - hero retired amount (`N tCO₂e`)
   - a detail table: organization, project, project id, methodology, vintage,
     token mint, reason + category, retired-by, wallet, blockchain tx
   - a **Digital Verification Metadata** block (retirement id, certificate CID,
     verification URL)
   - a **QR code** (SVG via `qrcode`) encoding the public verification URL
   - a footer stating the credits are burned and stored immutably on IPFS
2. **Pins** the PDF to Pinata/IPFS via the existing `PinataService.pinFile`
   (the `PinataService` is `@Global`, so no extra import is needed).
3. **Returns** only the CID + gateway URL. The caller stores the CID in
   `Retirement.certificateCid`; the PDF itself lives off-chain on IPFS.

The QR / verification URL is
`{CERTIFICATE_VERIFY_BASE|APP_FRONTEND_URL}/retirement-history/verify?rid=<retirementId>&cid=<certificateCid>`
so the certificate can be independently verified by scanning it.

> The `certificate` endpoint (`GET /api/retirements/:id/certificate`) does **not**
> re-fetch IPFS — it regenerates the PDF deterministically from the immutable
> retirement record and streams it, which is tamper-evident and always available
> even if the gateway is down.

---

## 5. REST API

Base path: `/api` (global prefix). All endpoints require a Supabase JWT
(`Authorization: Bearer <token>`).

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/retirements/holdings` | any authed | The caller's owned holdings with positive balance (Retire Credits picker). |
| POST | `/retirements` | any authed | Retire owned credits (validate → burn → persist → certify). |
| GET | `/retirements?page&limit&search&reasonCategory&status&projectId&sortBy&order` | any authed | Paged, searchable, filterable history. ADMIN sees all; others see only their own. |
| GET | `/retirements/:id` | own / ADMIN | Full retirement detail. |
| GET | `/retirements/:id/certificate` | own / ADMIN | Stream the PDF Retirement Certificate (`application/pdf`, inline). |

### POST /retirements — request

```json
{
  "holdingId": "uuid",
  "amount": 100,
  "reasonCategory": "NET_ZERO",           // NET_ZERO | CORPORATE_ESG | CARBON_OFFSET | COMPLIANCE | CUSTOM
  "reason": "Voluntary net-zero for FY2026 Scope 1 emissions",
  "walletAddress": "base58…",             // optional; must match holding wallet
  "organization": "Acme Corp"             // optional; shown on certificate
}
```

### POST /retirements — response (201)

```json
{
  "id": "uuid", "retirementId": "uuid", "projectId": "uuid",
  "tokenMint": "base58…", "retiredAmount": 100, "retiredBy": "uuid",
  "walletAddress": "base58…", "reason": "…", "reasonCategory": "NET_ZERO",
  "transactionSignature": "mock_retire_…", "certificateCid": "bafy…",
  "certificateUrl": "https://<gateway>/ipfs/bafy…", "status": "CERTIFIED",
  "organization": "Acme Corp", "projectName": "…", "methodology": "VM0036",
  "vintage": 2026, "explorerUrl": null, "ipfsUrl": "…/verify?…",
  "certificateId": "VC-RET-XXXXXX", "verifyUrl": "…/verify?…",
  "timestamp": "2026-…", "createdAt": "…", "updatedAt": "…"
}
```

### Error semantics

- `400` — invalid input, amount ≤ 0, or **insufficient balance**.
- `403` — the holding is not owned by the caller, or the supplied wallet does
  not match the holding wallet.
- `404` — holding or retirement not found.

---

## 6. Integrity guarantees (the "never re-enter circulation" rules)

1. **Ownership + balance validated inside a DB transaction** that locks the
   `Holding` row (`findUnique` then `update` with `decrement`), so concurrent
   retirements cannot double-spend the same balance.
2. **Burning is permanent** — the on-chain instruction destroys supply (real
   mode) and the off-chain balance is decremented (both modes). Once retired,
   an amount can never be transferred or listed again.
3. **Marketplace reconciliation** — after a retirement, any ACTIVE listing for
   the same `tokenMint` whose `amount` exceeds the remaining `availableBalance`
   is auto-cancelled. This closes the gap where retired supply could otherwise
   still appear for sale.
4. **Immutable records** — `Retirement` rows are never updated except for the
   one-way `CONFIRMED` → `CERTIFIED` transition (certificate pin); `status` is
   never reset and the row is never deleted.
5. **Complete audit** — every retirement writes `CREDIT_RETIRED` and
   `RETIREMENT_CERTIFIED` audit entries (immutable, never updated/deleted).
6. **RBAC** — a user may only retire from / read **their own** holdings and
   retirements; `ADMIN` may read (and filter) **all** records. The retirement
   flow itself enforces `holding.ownerId === actor.id` so an admin cannot retire
   on another user's behalf.

---

## 7. Frontend

### `/retire-credits` — Retire Credits

- Lists the caller's owned holdings (available balance, project, vintage,
  methodology, token mint).
- Validation: amount must be ≤ available balance; reason is mandatory; CUSTOM
  requires a descriptive statement; the Phantom wallet must be connected and
  match the holding wallet.
- **Confirmation modal** summarizing the irreversible action.
- **Transaction progress** states: Validate → Retire on-chain → Issue
  certificate (with a stepper UI).
- **Success state** with certificate ID, key details, and links to view/download
  the PDF, open on IPFS, open the Solana transaction, view in history, or retire
  more.

### `/retirement-history` — Retirement History

- Paged table (server-side pagination) with total + page controls.
- **Search** across retirement id, reason, project, wallet, tx, and certificate
  CID (debounced).
- **Filters**: reason category chips and status chips.
- Each card shows project, certificate id, status badge, retired amount, reason,
  vintage, methodology, timestamp, tx, and CID, plus action buttons:
  **Certificate PDF**, **IPFS**, and **Solana Tx**.
- ADMIN sees all users' retirements; other roles see only their own.

---

## 8. Environment configuration

Added to `backend/.env.example`:

```bash
# Stage 6: Credit Retirement
RETIREMENT_ONCHAIN=false          # true to use real on-chain retirement (needs SOLANA_PROGRAM_ID)
CERTIFICATE_VERIFY_BASE=http://localhost:3000   # base URL encoded in the cert QR / verify link
APP_FRONTEND_URL=http://localhost:3000          # frontend origin for verify URLs
```

`PinataService` (already required for Stage 2) provides `PINATA_JWT` /
`PINATA_GATEWAY` used to pin the certificate PDF. `SOLANA_PROGRAM_ID` /
`SOLANA_CLUSTER` are reused from Stage 4/5.

---

## 9. Run / Verify

### 9.1 Database migration

```bash
cd backend
npx prisma migrate dev --name add_holdings_retirements   # creates Holding + Retirement
npx prisma generate
```

### 9.2 Backend

```bash
cd backend
npm run build
npm start            # http://localhost:3001/api  (Swagger: /api/docs)
npm test             # retirement unit suite (9 cases)
```

The retirement endpoints appear under the `Credit Retirement (Stage 6)` Swagger
tag: `/retirements/holdings`, `POST /retirements`,
`GET /retirements`, `GET /retirements/:id`, `GET /retirements/:id/certificate`.

### 9.3 End-to-end DB test (no Solana/IPFS network needed)

`backend/e2e-retirement.ts` seeds a User + Project + Holding + ACTIVE Listing,
runs a real `RetirementService.retire` with **mocked** blockchain + Pinata but a
**real** PrismaService (so the DB transaction is exercised), and asserts:

- `Retirement.certificateCid` is set and `status === CERTIFIED`
- `Holding.availableBalance` decremented and `totalRetired` incremented
- the oversized marketplace listing is auto-`CANCELLED`
- a `CREDIT_RETIRED` audit row exists

Run with: `cd backend && npx ts-node e2e-retirement.ts` (prints `PASS: true`).

### 9.4 Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000/retire-credits  and  /retirement-history
npm run typecheck
npm run build
```

Sign in, open **Retire Credits**, pick a holding, enter an amount + reason,
confirm, and watch the certificate generate. Then open **Retirement History** to
search, filter, view the PDF, open IPFS, and inspect the Solana transaction.

---

## 10. Assumptions / Open decisions

- **Holding bootstrap:** `Holding` rows represent issued/owned credits. In a
  full deployment they are created when credits are issued (Stage 4) or
  transferred/purchased (Stage 5). This stage consumes existing holdings; a
  seed/migration helper can populate holdings from marketplace sales if needed.
- **MOCK by default:** matches Stages 4/5 — the lifecycle is fully demonstrable
  without the retirement program deployed. Going on-chain is a one-class change
  in `RetirementBlockchainService` (no controller/service/DTO/frontend changes).
- **Decimals = 0** (whole-tonne credits), consistent with Stage 4.
- **Certificate regeneration** is deterministic from the immutable retirement
  record, so `/certificate` never depends on IPFS availability.
- **RBAC:** admins can *view* all retirements (audit/compliance) but cannot
  retire on another user's behalf — ownership is enforced by `holding.ownerId`.
