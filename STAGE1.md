# VerdiCred — Stage 1: End-to-End Workflow & System Documentation

This document describes **everything that was built** for Stage 1 (Project
Registration & Onboarding + the Admin Panel), how the pieces fit together,
and the end-to-end data flow from "a user signs up" to "an audit-logged role
change."

---

## 1. What was built

| Layer | Tech | What it does |
|-------|------|--------------|
| **Frontend** | Next.js 15 (App Router), React 19 RC, TailwindCSS, @supabase/ssr | Login/sign-up, Developer dashboard (create + list projects), **Admin panel** (user role management + audit log). |
| **Backend** | NestJS 10, Express, class-validator | REST API under `/api`: auth, projects, **admin (RBAC + audit)**. Global JWT guard + roles guard. |
| **Database** | Supabase Postgres + Prisma ORM | `User`, `Project`, `AuditLog` tables + enums `Role`, `ProjectType`, `ProjectStatus`, `AuditLogAction`. |
| **Auth** | Supabase Auth (JWT) | Issues access tokens; backend verifies them with `@supabase/auth-js` (no WebSocket/Realtime dependency, so Node 20 needs no `ws`). |
| **Docs** | Swagger | Interactive API at `/api/docs`. |

---

## 2. Database schema (live in your Supabase project)

```
User
  id          uuid (PK, app-side id used by all endpoints)
  supabaseId  text (unique)  ← links to Supabase auth.users.id
  email       text (unique)
  fullName    text?
  role        Role  (BUYER default)
  createdAt / updatedAt

Project
  id, ownerId→User, projectName, projectType, methodology,
  expectedAnnualTonnes (float), geoPolygon (json), status, timestamps

AuditLog            (immutable, append-only)
  id, actorId→User (who acted), targetId→User (who was changed),
  action (ROLE_CHANGED|PROMOTED|DEMOTED), previousRole, newRole,
  reason?, createdAt

Enums: Role{BUYER,DEVELOPER,AUDITOR,ADMIN}
       ProjectType{REFORESTATION,SOIL_CARBON,RENEWABLE_ENERGY}
       ProjectStatus{DRAFT,PENDING_VERIFICATION,VERIFIED,REJECTED,RETIRED}
       AuditLogAction{ROLE_CHANGED,ROLE_PROMOTED,ROLE_DEMOTED}
```

> Schema is already **pushed** to your Supabase project. To re-sync after a
> schema edit: `cd backend && npx prisma generate && npx prisma db push`.

---

## 3. Authentication & RBAC flow

```
User signs up/in (Supabase Auth, frontend)
        │
        ▼  Supabase returns an access token (JWT)
Frontend stores session, sends `Authorization: Bearer <token>` on every call
        │
        ▼
SupabaseAuthGuard (global)
  • Verifies the JWT with Supabase (auth.getUser)
  • Resolves / creates the VerdiCred User row (default role BUYER)
  • Attaches { id, supabaseId, email, role } to request.user
        │
        ▼
RolesGuard (global)  →  enforces @Roles(...) on each route
```

### Roles & permissions
| Role | Projects | Admin APIs |
|------|----------|------------|
| `BUYER` | read | ❌ |
| `DEVELOPER` | create + manage own | ❌ |
| `AUDITOR` | read all; change project `status` | ❌ |
| `ADMIN` | full | ✅ list users, change roles, view audit log |

---

## 4. End-to-end workflows

### 4.1 Project registration (Developer)
1. Developer signs up → `POST /api/auth/profile` creates their `User` (BUYER).
2. An admin promotes them to `DEVELOPER` (see §4.3).
3. Developer opens `/developer`, fills the **Create Project** form
   (name, type, methodology, expected tonnes, GeoJSON polygon).
4. `POST /api/projects` (guarded to DEVELOPER/ADMIN):
   - validates input (whitelist + mandatory fields),
   - runs `GeoValidationService.validate()` (mock overlap pre-screen),
   - writes a `Project` with `status = PENDING_VERIFICATION`.
5. The **Projects table** on the dashboard reflects it immediately.

### 4.2 Reading data
- `GET /api/projects` → any authenticated user.
- `GET /api/projects/:id` → any authenticated user.
- `PATCH /api/projects/:id` → owner (DEVELOPER) edits own; AUDITOR/ADMIN may
  change `status` only.

### 4.3 Admin role management (the new panel)
1. An `ADMIN` signs in and opens `/admin`.
2. **User Management** lists every `User` (email, id, current role).
3. Admin picks a new role from the row dropdown → prompted for an optional
   reason → `PATCH /api/admin/users/:id/role`.
4. Server (`AdminService.changeRole`) enforces:
   - caller is `ADMIN` (guard),
   - **cannot change own role**,
   - **cannot remove the last ADMIN**,
   - updates the `User.role`,
   - **writes an immutable `AuditLog` entry** (actor, target, previous→new,
     reason, timestamp).
5. **Audit Log** section shows all changes, newest first — full
   accountability, no manual SQL needed.

API surface (all require `Authorization: Bearer <token>`):
```
GET    /api/admin/users            → list users (ADMIN)
PATCH  /api/admin/users/:id/role  → { "role": "DEVELOPER", "reason"? } (ADMIN)
GET    /api/admin/audit-logs      → role-change history (ADMIN)
```

---

## 5. Security & compliance notes
- **No service-role key in the frontend.** It lives only in `backend/.env`
  (server-side, used for verification/tests).
- **JWT verification is server-side** via Supabase; the anon key cannot read
  protected data without a valid token.
- **RBAC is defense-in-depth:** global `RolesGuard` + per-route `@Roles`.
- **Audit log is append-only** (no update/delete endpoints) for compliance.
- **Supabase pgbouncer:** Prisma uses the **direct** Postgres URL (port 5432),
  not the pooled 6543 — see `backend/.env`.

---

## 6. How to run (quick)

```bash
# Backend (port 3001)
cd backend && npm install && npm run build && npm run start
#   → API:   http://localhost:3001/api
#   → Swagger: http://localhost:3001/api/docs

# Frontend (port 3000)
cd frontend && npm install && npm run dev
#   → http://localhost:3000  (/login, /developer, /admin)
```

Make yourself the first admin once (Supabase SQL editor):
```sql
update "User" set role = 'ADMIN' where email = 'you@example.com';
```
Then use `/admin` for all future role changes.

Full run guide: see **RUN.md**. Repo overview: see **README.md**.

---

## 7. Verification performed
- Backend + frontend both compile (`npm run build` → success).
- Schema pushed to live Supabase; `User`/`Project`/`AuditLog` + enums present.
- Ad-hoc E2E against the running server (14/14 PASS): BUYER blocked from admin
  APIs (401); ADMIN lists users (200), changes a role (200), and the change is
  recorded in the audit log (200 + entry). Test users cleaned up after.
- Auth path reaches Supabase (`getUser`) — invalid tokens are rejected (401).

---

## 8. Roadmap (post Stage 1)
- Stage 2: Evidence ingestion adapters (Sentinel-2, Landsat, NASA EarthData,
  Copernicus, OpenWeather, geo-uploads) → IPFS.
- Stage 3: Verification engine (NDVI, carbon models, anomaly detection).
- Stage 4: Blockchain credit minting (1 credit = 1 verified ton CO₂).
- Stage 5: Marketplace + transfers.
- Stage 6: Retirement (burn) + certificate.
- Stage 7: Public transparency explorer.
