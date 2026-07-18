# Stage 5 — Carbon Credit Marketplace

VerdiCred Stage 5 adds a complete carbon-credit marketplace: verified credits
can be listed, browsed, purchased, and managed end-to-end. Blockchain
settlement is abstracted behind a single `BlockchainService` seam that runs a
**mock** implementation today and can be swapped for real Solana / SPL
Token-2022 settlement once the Stage 4 program is deployed — with **no changes**
to the marketplace APIs or the frontend.

## What shipped

### Database (Prisma / PostgreSQL)
- New enum `ListingStatus` — `ACTIVE | SOLD | CANCELLED`.
- New model `Listing` with the required core fields — `id`, `creditId`,
  `seller`, `price`, `status` — plus `buyer`, `amount`, settlement fields
  (`txSignature`, `settledAt`) and denormalized project/verification fields
  (`projectName`, `projectType`, `methodology`, `vintage`, `verifiedTonnes`,
  `reportCid`, `metadata`) so the Marketplace and Credit Details pages render
  without extra chain reads. `sellerUserId` links to `User` for RBAC ownership.
- Migration: `backend/prisma/migrations/20260718000000_add_marketplace_listings`.

### Backend (NestJS)
`backend/src/marketplace/`
- **`blockchain.service.ts`** — the single seam between the marketplace and
  Solana. Methods: `verifyOwnership`, `settlePurchase`, `settleCancellation`,
  `getExplorerUrl`. Mock mode is the default; `MARKETPLACE_ONCHAIN=true` +
  `SOLANA_PROGRAM_ID` switches to real settlement. Mock signatures are prefixed
  `mock_` so they can never be mistaken for a real on-chain tx.
- **`marketplace.service.ts`** — listing lifecycle + authorization:
  - Only the owner (seller wallet **and** the listing's VerdiCred user) — or an
    ADMIN — may create or cancel a listing.
  - Creating a listing verifies wallet ownership via `BlockchainService` and
    blocks duplicate active listings for the same credit+seller.
  - Buying transfers ownership (buyer recorded, `status=SOLD`) and settles via
    `BlockchainService.settlePurchase`; only ACTIVE listings, no self-purchase.
- **`marketplace.controller.ts`** — REST API (see below), Swagger-documented,
  RBAC via `@Roles(...)`.
- **`dto/marketplace.dto.ts`** — `class-validator` DTOs with base58 wallet
  validation (`/^[1-9A-HJ-NP-Za-km-z]{32,44}$/`) and price/amount constraints.
- Wired into `AppModule`.

#### API (all require a Supabase JWT)
| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/marketplace/listings` | any authed | All ACTIVE listings (browse) |
| GET | `/marketplace/listings/all` | ADMIN, AUDITOR | Full history (audit) |
| GET | `/marketplace/listings/:id` | any authed | Listing detail |
| POST | `/marketplace/listings` | DEVELOPER, BUYER, ADMIN | Create (owner only) |
| POST | `/marketplace/listings/:id/buy` | any authed | Buy → transfer ownership |
| POST | `/marketplace/listings/:id/cancel` | owner / ADMIN | Cancel |

Full reference: `backend/API.md` (Marketplace section) and Swagger UI at
`/api/docs`.

### Frontend (Next.js 15 / React 19 RC)
- **Wallet integration** — `src/lib/wallet-context.tsx` wraps the official
  `@solana/wallet-adapter-phantom` `PhantomWalletAdapter` in a thin
  `useWallet()` context: connect / disconnect, the connected base58 address,
  connecting/installed flags, and `signMessage()` to authorize purchases.
  `WalletProvider` is mounted in `src/app/layout.tsx`;
  `src/components/WalletButton.tsx` is the reusable connect/address control.
- **Marketplace page** — `src/app/marketplace/page.tsx`: responsive listing
  cards (project, type, methodology, vintage, amount, price) + an inline
  create-listing form that uses the connected wallet as the seller.
- **Credit Details page** — `src/app/marketplace/[id]/page.tsx`: complete
  project, verification, ownership and pricing panels, with contextual
  **Buy now** / **Cancel listing** actions gated on wallet + ownership. Purchase
  is authorized by signing a message with the connected wallet before the API
  call.
- **Types + API helpers** — `Listing`, `CreateListingRequest`, `ListingStatus`
  in `src/lib/types.ts`; `listActiveListings`, `getListing`, `createListing`,
  `buyListing`, `cancelListing` in `src/lib/api.ts`.
- **Navigation** — Marketplace cross-links added to the home CTA and the
  carbon-credits header.

## Swapping the mock for real settlement
When the Stage 4 program is deployed, edit **only** `blockchain.service.ts`:
1. Set `MARKETPLACE_ONCHAIN=true` and `SOLANA_PROGRAM_ID` (and, if needed, the
   oracle/payer secret) in the backend env.
2. Replace the mock bodies of `verifyOwnership` / `settlePurchase` with the real
   Token-2022 balance read and transfer + settlement calls (the PDA / oracle
   plumbing already exists in `SolanaIssuanceService`).

The marketplace controller, service, DTOs, and the entire frontend remain
untouched because they depend on the stable `BlockchainService` interface, not
on chain details.

## Verification (ad-hoc — no runtime test suite)
- `npx prisma generate` — OK (Listing model in the client).
- Backend `npx tsc --noEmit` / `nest build` — compiles clean.
- Frontend `npm run typecheck` — exits 0.
- Frontend `npm run build` — `✓ Compiled successfully`; routes `/marketplace`
  and `/marketplace/[id]` present in the route table. (The ESLint "must be
  installed" warning is pre-existing and does not block compilation.)

This is compilation/typecheck verification; it does not exercise the API against
a live database or a real Solana cluster. The migration must be applied
(`npx prisma migrate deploy`) against the database before running.
