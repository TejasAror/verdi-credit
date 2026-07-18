# VerdiCred

> Trusted digital carbon credit verification platform that eliminates fraud,
> double-counting, and greenwashing by linking real-world carbon sequestration
> to traceable, on-chain carbon credits.

This repository currently implements **Stage 1 — Project Registration &
Onboarding**, the entry point of the VerdiCred pipeline.

---

## Table of Contents
- [Architecture](#architecture)
- [Monorepo Layout](#monorepo-layout)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Backend Setup](#backend-setup)
- [Frontend Setup](#frontend-setup)
- [Database / Prisma](#database--prisma)
- [Authentication & RBAC](#authentication--rbac)
- [API Reference](#api-reference)
- [GeoValidationService](#geovalidationservice)
- [Data Model](#data-model)
- [Roadmap](#roadmap)

---

## Architecture

```
┌──────────────────────────┐      REST/JSON       ┌──────────────────────────┐
│  Next.js 15 (Frontend)   │  ─────────────────▶ │  NestJS (Backend API)    │
│  - Login / Auth           │  ◀─────────────────  │  - Auth (Supabase JWT)   │
│  - Developer Dashboard    │     Bearer token     │  - RBAC (RolesGuard)     │
│  - Create Project form    │                      │  - Projects module       │
│  - Projects table         │                      │  - GeoValidationService  │
└──────────────────────────┘                      └───────────┬──────────────┘
                                                               │
                          ┌────────────────────────────────────┼─────────────────────┐
                          ▼                                    ▼                     ▼
                 ┌────────────────┐                  ┌──────────────────┐   ┌──────────────────┐
                 │ Supabase Auth  │                  │ Supabase Postgres│   │ (Future) Blockchain│
                 │ (JWT issuer)   │                  │ via Prisma ORM   │   │ Smart Contracts   │
                 └────────────────┘                  └──────────────────┘   └──────────────────┘
```

---

## Monorepo Layout

```
VerdiCred/
├── backend/                 # NestJS + Prisma + Supabase
│   ├── prisma/
│   │   └── schema.prisma    # Users & Projects models, enums
│   ├── src/
│   │   ├── main.ts          # Bootstrap + global pipes + Swagger
│   │   ├── app.module.ts
│   │   ├── auth/            # Supabase JWT guard, RolesGuard, decorators
│   │   ├── users/           # Application-side profile/role store
│   │   ├── projects/        # Controller, Service, DTOs, GeoValidation
│   │   ├── prisma/          # PrismaService
│   │   └── supabase/        # SupabaseService
│   ├── .env.example
│   └── package.json
└── frontend/                # Next.js 15 (App Router) + Tailwind
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx
    │   │   ├── page.tsx           # Landing
    │   │   ├── login/page.tsx     # Supabase auth
    │   │   └── developer/page.tsx # Dashboard
    │   ├── components/
    │   │   ├── CreateProjectForm.tsx
    │   │   └── ProjectsTable.tsx
    │   └── lib/
    │       ├── supabase.ts        # Browser client
    │       ├── api.ts             # Authenticated fetch helper
    │       ├── auth-context.tsx   # Session + profile provider
    │       └── types.ts
    ├── .env.local               # Pre-filled with the provided Supabase keys
    └── package.json
```

---

## Tech Stack
- **Frontend:** Next.js 15 (App Router), React 19 RC, TypeScript, TailwindCSS, @supabase/ssr
- **Backend:** NestJS 10, Express, TypeScript, class-validator / class-transformer
- **Database:** Supabase PostgreSQL + Prisma ORM
- **Auth:** Supabase Auth (JWT) + role-based access control (DEVELOPER / BUYER / AUDITOR / ADMIN)
- **Docs:** Swagger (auto-generated at `/api/docs`)

---

## Prerequisites
- Node.js >= 20
- npm >= 10
- A Supabase project (the provided keys are already wired into `frontend/.env.local`)

---

## Backend Setup

```bash
cd backend
cp .env.example .env          # then fill DATABASE_URL + Supabase keys
npm install
npx prisma generate
npx prisma migrate dev --name init   # creates Users & Projects tables
npm run start:dev             # http://localhost:3001  (docs: /api/docs)
```

### Environment variables (backend/.env)
| Var | Description |
|-----|-------------|
| `PORT` | API port (default 3001) |
| `API_CORS_ORIGIN` | Comma-separated allowed origins (frontend URL) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/publishable key (used to verify JWTs) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — **server-only**, never expose to browser |
| `DATABASE_URL` | **Direct** Postgres connection (port 5432) for Prisma at runtime |
| `DIRECT_URL` | Direct connection for Prisma migrations/introspection |

> ⚠️ **Supabase pgbouncer note:** Prisma's query engine does **not** work
> reliably with Supabase's transaction-pooled pooler (port `6543`,
> `?pgbouncer=true`). Point `DATABASE_URL` at the **direct** connection
> (port `5432`) for the running app. See `backend/.env` for the exact values.

> The Supabase **publishable** key can verify JWTs but cannot read/write
> protected data without a valid user token — it is safe for the backend to
> hold for token verification. The backend verifies tokens with the lightweight
> `@supabase/auth-js` client (no WebSocket/Realtime dependency), so Node 20
> needs no `ws` package.

---

## Frontend Setup

```bash
cd frontend
npm install
# .env.local is already present with the provided Supabase keys
npm run dev                  # http://localhost:3000
```

To point the frontend at a different API, edit `NEXT_PUBLIC_API_BASE_URL`
in `frontend/.env.local`.

---

## Database / Prisma

```prisma
enum Role { DEVELOPER BUYER AUDITOR ADMIN }
enum ProjectType { REFORESTATION SOIL_CARBON RENEWABLE_ENERGY }
enum ProjectStatus { DRAFT PENDING_VERIFICATION VERIFIED REJECTED RETIRED }

model User {
  id, supabaseId (unique), email (unique), fullName?, role, timestamps
  projects Project[]
}

model Project {
  id, ownerId → User, projectName, projectType, methodology,
  expectedAnnualTonnes, geoPolygon (Json), status, timestamps
}
```

Generate the client after any schema change:

```bash
npx prisma generate
```

---

## Authentication & RBAC

1. A user signs up / signs in via Supabase Auth in the frontend.
2. The frontend sends the Supabase **access token** as
   `Authorization: Bearer <token>` on every API call.
3. `SupabaseAuthGuard` verifies the token with Supabase (`auth.getUser`)
   and resolves the VerdiCred `User` profile (creating one on first sight,
   default role `BUYER`).
4. `RolesGuard` enforces `@Roles(...)` decorators.

### Roles
| Role | Can |
|------|-----|
| `DEVELOPER` | Create & manage own projects |
| `BUYER` | Read projects (marketplace, future) |
| `AUDITOR` | Read all; change project `status` |
| `ADMIN` | Full access; create projects; **manage roles + view audit log** |

> New accounts default to `BUYER`. Promote a user to `ADMIN` once (Supabase SQL
> editor: `update "User" set role='ADMIN' where email='you@x.com';`), then use
> the Admin Panel (`/admin`) for all future role changes — no manual SQL needed.

### Admin Panel (secure role management)
- `GET  /api/admin/users`          → list all users + roles (ADMIN)
- `PATCH /api/admin/users/:id/role` → `{ role, reason? }` (ADMIN)
- `GET  /api/admin/audit-logs`      → role-change history (ADMIN)
- Server rules: only ADMIN; cannot change own role; last ADMIN is protected;
  every change writes an immutable `AuditLog` (actor, target, previous→new role,
  reason, timestamp). See `RUN.md` for the full walkthrough.

---

## API Reference

Base URL: `http://localhost:3001/api`
All routes (except auth provisioning) require `Authorization: Bearer <token>`.

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/profile` | Bearer | Provision/fetch VerdiCred profile + role |
| `GET`  | `/auth/me`     | Bearer | Get current profile |

### Projects
| Method | Path | Auth | Roles | Description |
|--------|------|------|-------|-------------|
| `POST` | `/projects` | Bearer | DEVELOPER, ADMIN | Create project (geoPolygon, methodology, expectedAnnualTonnes **mandatory**) |
| `GET`  | `/projects` | Bearer | any | List all projects |
| `GET`  | `/projects/:id` | Bearer | any | Get one project |
| `PATCH`| `/projects/:id` | Bearer | owner / AUDITOR / ADMIN | Update project |

### Example — create a project
```bash
curl -X POST http://localhost:3001/api/projects \
  -H "Authorization: Bearer $SUPABASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "Amazon Reforestation Phase 1",
    "projectType": "REFORESTATION",
    "methodology": "VM0033 - ARR",
    "expectedAnnualTonnes": 1250.5,
    "geoPolygon": {
      "type": "Polygon",
      "coordinates": [[[-60.0,-3.0],[-59.9,-3.0],[-59.9,-2.9],[-60.0,-2.9],[-60.0,-3.0]]]
    }
  }'
```

Interactive docs: `http://localhost:3001/api/docs` (Swagger UI).

---

## GeoValidationService

Located at `backend/src/projects/geo-validation.service.ts`.

```ts
async validate(polygon): Promise<{ overlapDetected: boolean; checkedAt: string }>
```

**Current behavior (Stage 1 mock):** always returns `overlapDetected: false`.

**Future:** replace with a real spatial intersection check (PostGIS
`ST_Overlaps` / `ST_Intersects`, or point-in-polygon) against existing project
polygons to prevent double-counting of the same land area.

---

## Roadmap (post Stage 1)
- Stage 2: Evidence ingestion (adapters → Pinata IPFS → RBAC + audit) — **see `STAGE2.md`**
- Stage 3: Verification engine (NDVI, carbon models, anomaly detection)
- Stage 4: Blockchain credit minting (1 credit = 1 verified ton CO₂)
- Stage 5: Marketplace + transfers
- Stage 6: Retirement (burn) + certificate
- Stage 7: Public transparency explorer

---

## Stage 2 — Evidence Ingestion Layer

Modular evidence collection that pulls/accepts data from five providers,
normalizes it into one model, pins the raw payload to IPFS (Pinata), and
persists only the CID + spatio-temporal metadata. Full detail, data-flow
diagram, adapter table, RBAC matrix, and API examples are in
[`STAGE2.md`](./STAGE2.md).

**Endpoints (all require `Authorization: Bearer <supabase-jwt>`)**

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `POST` | `/evidence/upload` | DEVELOPER, ADMIN | Multipart upload; pins payload to IPFS, stores CID |
| `GET`  | `/projects/:id/evidence` | any authenticated | List a project's evidence |
| `GET`  | `/evidence/:id` | any authenticated | Single evidence (auditor view is logged) |
| `DELETE`| `/evidence/:id` | ADMIN | Hard-delete evidence |

**Evidence sources:** `SENTINEL2`, `LANDSAT`, `NASA_EARTHDATA`,
`OPENWEATHER` (live fetch when keyed), `GEO_UPLOAD`.

**New env vars:** `PINATA_JWT`, `PINATA_GATEWAY`, `NASA_API_KEY`,
`OPENWEATHER_API_KEY` (see `backend/.env.example`).

## License
MIT
