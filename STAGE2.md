# VerdiCred — Stage 2: Evidence Ingestion Layer

This document covers everything added in **Stage 2**: a modular, source-agnostic
evidence collection system that pulls/accepts environmental data from five
different providers, normalizes it into one unified model, pins the raw payload
to IPFS (Pinata), and persists only the returned CID together with
spatio-temporal metadata — all behind RBAC and audit logging.

---

## 1. What was built

| Concern | Where | Notes |
|---------|-------|-------|
| **Evidence model** | `prisma/schema.prisma` (`Evidence`) | Linked to `Project`; fields `id, projectId, source, status, cid, ipfsUrl, latitude, longitude, timestamp, metadata (Json), createdAt, updatedAt`. |
| **Source enums** | `prisma/schema.prisma` | `EvidenceSource { SENTINEL2, LANDSAT, NASA_EARTHDATA, OPENWEATHER, GEO_UPLOAD }`, `EvidenceStatus { PENDING, VERIFIED, REJECTED }`. |
| **Adapter interface** | `evidence/adapters/evidence-adapter.interface.ts` | `EvidenceAdapter` with `fetch(ctx)` + `normalize(raw, ctx)` → `NormalizedEvidence`. |
| **5 adapters** | `evidence/adapters/*` | Sentinel2, Landsat, NASAEarthData, OpenWeather, GeoUpload. |
| **Adapter registry** | `evidence/adapters/adapter-registry.service.ts` | Auto-resolves the right adapter by `EvidenceSource`. |
| **Pinata IPFS** | `evidence/pinata/pinata.service.ts` | Pins raw file bytes **and** JSON payloads; stores only the returned CID. |
| **Evidence service** | `evidence/evidence.service.ts` | Orchestrates validate → adapter → pin → persist → audit. |
| **RBAC + guards** | `auth/guards/*`, `auth/decorators/roles.decorator.ts` | DEVELOPER/ADMIN upload; AUDITOR/BUYER read-only; ADMIN-only delete. |
| **Endpoints** | `evidence/evidence.controller.ts`, `projects/projects.controller.ts` | `POST /evidence/upload`, `GET /projects/:id/evidence`, `GET /evidence/:id`, `DELETE /evidence/:id`. |
| **Audit logging** | `audit-log/audit-log.service.ts` | `EVIDENCE_UPLOADED`, `EVIDENCE_DELETED`, `EVIDENCE_VIEWED`. |
| **Swagger** | `main.ts`, controller `@Api*` decorators | Multipart upload examples included. |
| **Tests** | `*.spec.ts` (7 suites) | Adapters, registry, pinata, DTO validation, roles guard, service, controller. |
| **Migration** | `prisma/migrations/2026*/migrate.sql` | Reproducible, schema-only (no DB connection required to generate). |

---

## 2. Architecture & data flow

```
                         ┌────────────────────────────────────────┐
  multipart/form-data    │            POST /evidence/upload          │
  (projectId, source,   │                                         │
   lat, lng, ts, file?) │   EvidenceController (DEVELOPER/ADMIN)  │
         │               └───────────────┬─────────────────────────┘
         ▼                               ▼
  ParseFilePipe                  EvidenceService.upload()
  (type + 10MB size)                  │
                                     ├─ 1. Project exists?  (404)
                                     ├─ 2. RBAC: DEVELOPER owns project?
                                     │        ADMIN anywhere? else 403
                                     ├─ 3. GEO_UPLOAD ⇒ file + lat/lng
                                     │        required; mime ∈ {png,jpeg,pdf,json}
                                     ├─ 4. lat/lng range (−90..90 / −180..180)
                                     ▼
                         AdapterRegistryService.get(source)
                                     │
                                     ▼
                       adapter.fetch(ctx)  ──► RawEvidence
                                     │            (file bytes OR JSON descriptor)
                                     ▼
                       adapter.normalize(raw, ctx) ──► NormalizedEvidence
                                     ▼
                         PinataService.pinFile() / pinJson()
                                     │
                                     ▼  returns { cid, ipfsUrl }
                         prisma.evidence.create({ cid, lat, lng, ts, metadata })
                                     ▼
                         AuditLog.recordEvidenceAction(EVIDENCE_UPLOADED)
```

**Key invariant:** *the raw evidence payload lives on IPFS; the database stores
only the CID + spatial/temporal/metadata.* Nothing sensitive or large is kept
in Postgres.

---

## 3. The five adapters

All implement the same `EvidenceAdapter` contract so the service is agnostic to
where evidence comes from.

| Adapter | Source | `fetch()` behaviour | Raw payload pinned |
|---------|--------|--------------------|-------------------|
| **Sentinel2Adapter** | `SENTINEL2` | Builds a reproducible Copernicus/Sentinel Hub request **descriptor** (collection `S2MSI2A`, bands B04/B08, NDVI) for the supplied lat/lng/window. | JSON descriptor |
| **LandsatAdapter** | `LANDSAT` | Reproducible USGS request descriptor (collection `LANDSAT_8_C2_L2`, bands B4/B5, NDVI). | JSON descriptor |
| **NASAEarthDataAdapter** | `NASA_EARTHDATA` | Reproducible NASA EarthData descriptor (dataset `GPM_3IMERGDF`, precipitation) — reads `NASA_API_KEY`. | JSON descriptor |
| **OpenWeatherAdapter** | `OPENWEATHER` | **LIVE** One Call 3.0 fetch when `OPENWEATHER_API_KEY` is set; falls back to a reproducible descriptor when it is not. | JSON (live data or descriptor) |
| **GeoUploadAdapter** | `GEO_UPLOAD` | Wraps the uploaded file `(buffer, filename, mimeType)`; lat/lng/timestamp come from the form. | Raw file bytes |

> **Why descriptors for the satellite sources?**
> Sentinel-2 / Landsat / NASA EarthData require OAuth/Earthdata-login and
> large scene downloads — out of scope for a clean Stage-2 ingestion. Pinning a
> *reproducible request descriptor* keeps the exact query auditable and immutable
> on IPFS, and the same adapter can be upgraded to a live fetch later without
> touching the service or DB. OpenWeather is genuinely keyed and free-tier, so
> it demonstrates the live path today.

Every adapter's `normalize()` returns the identical shape:
```ts
interface NormalizedEvidence {
  source: EvidenceSource;
  latitude?: number;
  longitude?: number;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}
```

---

## 4. API surface

All routes require `Authorization: Bearer <supabase-jwt>`.

### `POST /api/evidence/upload`  *(DEVELOPER, ADMIN)*
`Content-Type: multipart/form-data`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `projectId` | string (uuid) | ✅ | Target project. |
| `source` | enum | ✅ | One of `SENTINEL2, LANDSAT, NASA_EARTHDATA, OPENWEATHER, GEO_UPLOAD`. |
| `latitude` | number | GEO_UPLOAD only | −90..90. |
| `longitude` | number | GEO_UPLOAD only | −180..180. |
| `timestamp` | string (ISO-8601) | ❌ | Capture time. |
| `note` | string | ❌ | Free-form; stored in `metadata.note`. |
| `file` | binary | GEO_UPLOAD only | `image/png`, `image/jpeg`, `application/pdf`, `application/json`; ≤ 10 MB. |

Returns `201` + the created `Evidence` (with `cid`).

### `GET /api/projects/:id/evidence`  *(any authenticated user)*
Lists the project's evidence, newest-first. → `200` + `Evidence[]`.

### `GET /api/evidence/:id`  *(any authenticated user)*
Single record. → `200` + `Evidence`. **An AUDITOR's view is audit-logged**
(`EVIDENCE_VIEWED`) for compliance oversight.

### `DELETE /api/evidence/:id`  *(ADMIN only)*
Hard-deletes the evidence row and writes `EVIDENCE_DELETED`. → `200 {id,deleted:true}`.

### RBAC matrix
| Role | Upload | Read | Delete |
|------|--------|------|--------|
| `BUYER` | ❌ | ✅ | ❌ |
| `DEVELOPER` | ✅ (own projects) | ✅ | ❌ |
| `AUDITOR` | ❌ | ✅ (view → audited) | ❌ |
| `ADMIN` | ✅ (any project) | ✅ | ✅ |

---

## 5. Configuration (`.env`)

| Variable | Purpose |
|----------|---------|
| `PINATA_JWT` | Pinata API JWT — server-only, used to pin to IPFS. |
| `PINATA_GATEWAY` | Gateway host used to build retrievable URLs (`https://<gw>/ipfs/<cid>`). |
| `NASA_API_KEY` | NASA EarthData (used by `NASAEarthDataAdapter`). |
| `OPENWEATHER_API_KEY` | OpenWeather One Call 3.0 — enables a **live** fetch. |
| `SUPABASE_URL` | Supabase project URL (token verification). |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; admin/seed scripts that bypass RLS. |

See `backend/.env.example` for the full template.

---

## 6. Running & verifying

```bash
cd backend

# 1. Generate the client + apply the migration to your Supabase Postgres.
npx prisma generate
npx prisma migrate deploy          # uses DATABASE_URL / DIRECT_URL

# 2. Build & start.
npm run build && npm run start:dev

# 3. Tests (7 suites: adapters, registry, pinata, DTO, guard, service, controller).
npx jest --runInBand

# 4. Type-check only.
npm run typecheck
```

Swagger (with a worked multipart upload example) is served at
`http://localhost:3001/api/docs`.

### Example upload (GEO_UPLOAD)
```bash
curl -X POST http://localhost:3001/api/evidence/upload \
  -H "Authorization: Bearer <supabase-jwt>" \
  -F "projectId=a1b2c3d4-..." \
  -F "source=GEO_UPLOAD" \
  -F "latitude=-3.4653" \
  -F "longitude=-62.2159" \
  -F "timestamp=2026-07-15T12:00:00.000Z" \
  -F "note=Plot A saplings" \
  -F "file=@plotA.png;type=image/png"
```

---

## 7. Test results

`npx jest --runInBand` → **45 tests across 7 suites, all passing** (adapters
contract + GeoUpload + OpenWeather fallback; registry resolution; Pinata pin
file/JSON/error/gateway; DTO range validation incl. boundary values; RolesGuard
allow/deny/unauthenticated; EvidenceService upload/list/getById/delete with
RBAC + audit; EvidenceController delegation).

---

## 8. Notes / roadmap

- Satellite adapters currently pin *reproducible descriptors* (not full scenes) —
  the live-fetch upgrade is a drop-in change inside each adapter's `fetch()`.
- `Evidence.meta` carries source-specific fields; `status` starts at `PENDING`
  and is intended to be advanced by the Stage-3 verification engine.
- IPFS pins are currently **add-only** (no unpin on delete) — wire
  `pinata.unpin(cid)` into `EvidenceService.remove()` once retention policy is set.
