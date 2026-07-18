# VerdiCred — API Reference (Stage 1)
Base URL: http://localhost:3001/api
Auth: Supabase JWT — send `Authorization: Bearer <access_token>`

Interactive docs (Swagger UI): http://localhost:3001/api/docs

────────────────────────────────────────────────────────────────
AUTH
────────────────────────────────────────────────────────────────
POST /auth/profile
  Body: (none — uses the bearer token)
  Resolves/creates the VerdiCred profile and returns { id, email, role }.
  Call this once after Supabase sign-up.

GET  /auth/me
  Returns the current profile row.

────────────────────────────────────────────────────────────────
PROJECTS
────────────────────────────────────────────────────────────────
POST /projects
  Roles: DEVELOPER, ADMIN
  Body (application/json):
    projectName          string  (required)
    projectType          enum    REFORESTATION | SOIL_CARBON | RENEWABLE_ENERGY (required)
    methodology          string  (required, non-empty)
    expectedAnnualTonnes number  (required, > 0)
    geoPolygon           object  (required, GeoJSON Polygon or coordinate JSON)
  Behavior: runs geo overlap pre-screen (mock), sets status=PENDING_VERIFICATION.
  Returns: the created Project.

GET /projects
  Any authenticated user. Returns all projects (newest first).

GET /projects/:id
  Any authenticated user. Returns a single project or 404.

PATCH /projects/:id
  Owners (DEVELOPER) may edit their own project fields.
  AUDITOR/ADMIN may change only `status`.
  Body: any subset of { projectName, projectType, methodology,
         expectedAnnualTonnes, geoPolygon, status }.

────────────────────────────────────────────────────────────────
ERRORS
────────────────────────────────────────────────────────────────
401 Unauthorized   — missing/invalid token, or role not permitted
403 Forbidden      — overlap detected, or editing a project you don't own
404 Not Found      — project id does not exist
400 Bad Request    — validation failed (whitelist + class-validator)

────────────────────────────────────────────────────────────────
MARKETPLACE (Stage 5)
────────────────────────────────────────────────────────────────
All routes require a Supabase JWT. Blockchain settlement is handled by
BlockchainService (MOCK by default; set MARKETPLACE_ONCHAIN=true + SOLANA_PROGRAM_ID
for real SPL Token-2022 settlement). Listing status: ACTIVE | SOLD | CANCELLED.

GET /marketplace/listings
  Any authenticated user. Returns all ACTIVE listings (newest first).

GET /marketplace/listings/all
  Roles: ADMIN, AUDITOR. Returns every listing (incl. SOLD/CANCELLED) for audit.

GET /marketplace/listings/:id
  Any authenticated user. Returns full listing details (project, verification,
  ownership, pricing) or 404.

POST /marketplace/listings
  Roles: DEVELOPER, BUYER, ADMIN. Creates an ACTIVE listing.
  Ownership: the seller wallet must own the credit (verified via BlockchainService).
  Body (application/json):
    creditId       string  (required, base58 mint address)
    seller         string  (required, base58 — the connected wallet)
    price          number  (required, > 0)
    amount         int     (optional, default 1)
    projectId      string  (optional, uuid)
    projectName    string  (optional)
    projectType    enum    (optional) REFORESTATION | SOIL_CARBON | RENEWABLE_ENERGY
    methodology    string  (optional)
    vintage        int     (optional)
    verifiedTonnes number  (optional)
    reportCid      string  (optional)
  Returns: the created Listing.

POST /marketplace/listings/:id/buy
  Any authenticated user. Purchases an ACTIVE listing; transfers ownership to the
  buyer and settles via BlockchainService. Cannot buy your own listing.
  Body: { buyer: string (base58) }
  Returns: the updated Listing (status=SOLD, buyer set, txSignature populated).

POST /marketplace/listings/:id/cancel
  Owner only (listing's VerdiCred user AND seller wallet), or ADMIN.
  Cancels an ACTIVE listing (status=CANCELLED).
  Body: { seller: string (base58) }
  Returns: the updated Listing.

Marketplace errors:
  400 Bad Request  — listing not ACTIVE, self-purchase, or duplicate active listing
  403 Forbidden    — seller wallet does not own the credit, or not the listing owner
  404 Not Found    — listing id does not exist
