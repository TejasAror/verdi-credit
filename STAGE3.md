# VerdiCred — Stage 3: AI Verification Engine

This document is the **final end-to-end workflow specification + implementation
record** for Stage 3: an automated verification pipeline that validates a carbon
project from its aggregated evidence. It describes the architecture, the mock
algorithms, the data model, the API surface, run/verify steps, and the test
results. The code under `backend/src/verification/**` implements exactly what is
described here.

> **Stage 3 scope:** service architecture + *mock* algorithms (simulated NDVI,
> carbon estimation, and anomaly detection) so the full pipeline runs end-to-end
> before real satellite imagery and AI models are integrated. Every mock is
> isolated inside its own service behind a stable interface, so swapping in a
> real model later is a drop-in change with no impact on the orchestrator, API,
> DB, or PDF/IPFS steps.

---

## 1. Goal & pipeline at a glance

For a given `projectId`, the engine:

1. **Aggregates** all evidence (satellite, geo-upload, IoT/weather) for the project.
2. **Computes vegetation health** via `NDVIService` (simulated NDVI from the
   evidence set, weighted by source).
3. **Estimates carbon sequestration** via `CarbonEstimationService` (area from
   the project polygon × NDVI-scaled sequestration factor).
4. **Detects anomalies/inconsistencies** via `AnomalyDetectionService` (low
   evidence count, duplicate CIDs, over/under-claiming, gaps, out-of-polygon).
5. **Orchestrates** the above and derives a `confidenceScore` + final
   `verification status` via `VerificationService`.
6. **Generates a PDF report**, **pins it to IPFS/Pinata**, **persists the CID**
   in a new `verification_reports` table, advances `Project.status`, and
   **returns the CID + verification metadata**.

```text
            POST /api/verification/:projectId/verify   (DEVELOPER / AUDITOR / ADMIN)
                                   │
                                   ▼
                       VerificationController
                                   │
                                   ▼
                       VerificationService.verify(projectId)
                                   │
   ┌───────────────────────────────┼───────────────────────────────┐
   ▼                               ▼                               ▼
EvidenceService.listByProject   (project row via Prisma)       polygonAreaHa(geoPolygon)
   │                               │                               │
   └───────────────┬───────────────┴───────────────┬───────────────┘
                   ▼                               ▼
           NDVIService.compute()      CarbonEstimationService.estimate()
                   │                               │
                   │   NdviResult                  │   CarbonEstimationResult
                   └───────────────┬───────────────┘
                                   ▼
                    AnomalyDetectionService.detect()
                                   │   Anomaly[]
                                   ▼
              VerificationService → confidenceScore + status
                                   │
                                   ▼
                   ReportGeneratorService.generatePdf(result)
                                   │  Buffer (PDF, %PDF-)
                                   ▼
                       PinataService.pinFile()  → { cid, ipfsUrl }
                                   │
                                   ▼
   Prisma.verificationReport.create({ projectId, verifiedTonnes,
         confidenceScore, status, reportCid, reportUrl, ndviScore,
         anomalies, metadata })  + Project.status update
                                   │
                                   ▼
   VerificationReportResponseDto { id, projectId, projectName, verifiedTonnes,
         confidenceScore, status, reportCid, reportUrl, ndviScore,
         anomalyCount, anomalies, createdAt }
```

**Key invariant (carried over from Stage 2):** the heavy artifact (the PDF
report) lives on IPFS; Postgres stores only the CID + a small denormalized
summary (plus a `metadata` JSON of the full structured result) so the report
can be viewed without re-running the pipeline.

---

## 2. Module layout (what was built)

```text
backend/src/verification/
├── verification.module.ts                 # wires services + EvidenceModule + AuditLogModule
├── verification.controller.ts             # HTTP endpoints (RBAC)
├── verification.service.ts                # orchestrator (VerificationService)
├── verification.types.ts                  # shared interfaces (no infra deps)
├── dto/
│   └── verification-report-response.dto.ts# VerifyRequestDto + VerificationReportResponseDto
├── services/
│   ├── verification.utils.ts              # deterministic seed, polygon area, point-in-polygon
│   ├── ndvi.service.ts                    # NDVIService (mock)
│   ├── carbon-estimation.service.ts       # CarbonEstimationService (mock)
│   └── anomaly-detection.service.ts       # AnomalyDetectionService (mock)
├── report/
│   └── report-generator.service.ts        # PDF builder (pdfkit)
└── *.spec.ts                              # 5 test suites (21 tests)
```

`VerificationService` depends on:
- `EvidenceService` (Stage 2, imported via `EvidenceModule`) — to aggregate evidence
- `PrismaService` — to read `Project` / write `VerificationReport`
- `PinataService` (Stage 2, global) — to pin the PDF
- `NdviService`, `CarbonEstimationService`, `AnomalyDetectionService`
- `ReportGeneratorService`

---

## 3. Data model — `VerificationReport`

```prisma
model VerificationReport {
  id              String          @id @default(uuid())
  projectId       String
  project         Project         @relation(fields: [projectId], references: [id], onDelete: Cascade)
  verifiedTonnes  Float           // AI-estimated sequestered tonnes
  confidenceScore Float           // 0..100
  status          ProjectStatus   @default(PENDING_VERIFICATION)
  reportCid       String           // IPFS CID of the pinned PDF
  reportUrl       String?          // Gateway URL for the report
  ndviScore       Float?           // headline NDVI mean for quick queries
  anomalies       Json?            // serialized anomaly findings
  metadata        Json?            // full structured result (ndvi, carbon, anomalies, evidence)
  createdAt       DateTime        @default(now())

  @@index([projectId])
  @@index([status])
  @@index([createdAt])
}
```

Required spec fields present: `id, projectId, verifiedTonnes, confidenceScore,
reportCid, createdAt` (plus `createdAt`'s companions `status, ndviScore,
anomalies, metadata` for report viewing without re-running). Migration:
`prisma/migrations/<ts>_add_verification_reports/migration.sql` (reproducible,
generated via `prisma migrate diff`, no DB connection needed to produce).

On a successful run, `Project.status` is advanced from `PENDING_VERIFICATION`
to `VERIFIED` / `PENDING_VERIFICATION` / `REJECTED` to reflect the outcome.

---

## 4. Mock algorithms (swap-in ready)

Each algorithm lives behind a typed interface in `verification.types.ts` and is
**deterministic** (seeded by `projectId` + evidence ids) so tests are stable
and re-runs are reproducible. Helpers in `services/verification.utils.ts`
(FNV-1a hash, Mulberry32 PRNG, shoelace polygon area, point-in-polygon) are
shared by the mocks.

### 4.1 NDVIService — vegetation health
```ts
interface NdviResult {
  mean: number; median: number; min: number; max: number; stdDev: number;
  sampleCount: number;
  perSource: { source: EvidenceSource; mean: number; count: number }[];
  health: 'SPARSE' | 'MODERATE' | 'HEALTHY' | 'DENSE';
}
```
- `seed = hash(projectId + evidence.id)`; `jitter = (seededRandom(seed)-0.5)*0.4`
  → sample in `base ± 0.2`, clamped to `[-0.1, 0.95]`.
- `base` by type: REFORESTATION 0.55, SOIL_CARBON 0.35, RENEWABLE_ENERGY 0.20.
- sources weighted: satellite (SENTINEL2/LANDSAT/NASA) 1.0, GEO_UPLOAD 0.7,
  OPENWEATHER 0.3; `mean` = weighted average.
- `health`: `<0.2 SPARSE`, `<0.45 MODERATE`, `<0.7 HEALTHY`, else `DENSE`.

### 4.2 CarbonEstimationService — sequestration
```ts
interface CarbonEstimationResult {
  estimatedTonnes: number; areaHa: number;
  sequestrationFactorTonnesPerHa: number; method: string;
}
```
- `areaHa` from GeoJSON polygon via spherical-excess shoelace → ha; falls back
  to `expectedAnnualTonnes / anchorFactor` when the polygon is unusable.
- `factor = anchorFactor × (ndviMean / anchorNdvi)`, clamped to `[0, 2×anchor]`:
  REFORESTATION 5.0 @0.6, SOIL_CARBON 2.0 @0.45, RENEWABLE_ENERGY 0.2 @0.2.
- `estimatedTonnes = areaHa × factor`; `method` records the exact formula.

### 4.3 AnomalyDetectionService — inconsistencies
```ts
type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH';
interface Anomaly { type: string; severity: AnomalySeverity; message: string; refs?: string[]; }
```
| Type | Trigger | Severity |
|------|---------|----------|
| `EVIDENCE_COUNT_LOW` | `< 3` evidence items | HIGH |
| `DUPLICATE_CID` | two evidence rows share a `cid` | HIGH |
| `CARBON_OVERCLAIM` | `estimatedTonnes > expectedAnnualTonnes × 2` | HIGH |
| `NDVI_LOW` | mean NDVI `< 0.2` on a vegetation project | MEDIUM |
| `TIME_GAP` | max gap between evidence timestamps `> 180d` | MEDIUM |
| `OUT_OF_POLICY_AREA` | evidence lat/lng outside the polygon | MEDIUM |
| `CARBON_UNDERPERFORM` | `estimatedTonnes < expectedAnnualTonnes × 0.3` | LOW |
| `SOURCE_CONFLICT` | per-source NDVI spread `> 0.4` | LOW |

### 4.4 Confidence & status (in `VerificationService`)
```
score = 100
score -= Σ penalties:  HIGH −25, MEDIUM −12, LOW −5
score += coverage bonus:  min(10, evidenceCount)
score += ndviPlausible ? +5 : −10     (plausible ⇒ mean ∈ [0.3, 0.8])
score = clamp(score, 0, 100)

status:
  if any DUPLICATE_CID  OR  score < 40        ⇒ REJECTED
  else if score >= 70                          ⇒ VERIFIED
  else                                          ⇒ PENDING_VERIFICATION
```
`verifiedTonnes` stored = `carbon.estimatedTonnes`. All penalties/bonuses are
recorded in `notes` and persisted in `metadata`.

---

## 5. PDF report (`ReportGeneratorService`)

Built with **pdfkit** (pure-JS, no native deps). The PDF contains six sections:
1. **Header** — title, generated date, report id.
2. **Project Details** — name, type, methodology, declared tonnes, polygon area,
   evidence count, status.
3. **Evidence Summary** — per-source counts.
4. **NDVI / Vegetation Health** — mean/median/min/max/stdDev, sample count,
   health class, per-source breakdown.
5. **Estimated Carbon** — area, factor, estimated tonnes, method string.
6. **Anomaly Findings** — severity-tagged table (or "No anomalies detected").
7. **Confidence & Status** — big score, final status, and the rationale list.

Returns a `Buffer` (starts with `%PDF-`) consumed by `PinataService.pinFile`.

---

## 6. API surface

Base URL: `http://localhost:3001/api`. All routes require
`Authorization: Bearer ***`.

### `POST /api/verification/:projectId/verify` — *DEVELOPER, AUDITOR, ADMIN*
Runs the full pipeline. Optional JSON body `{ "note": string }`.
Returns `201` + `VerificationReportResponseDto`. Each call creates a new report
row (the latest is authoritative) and advances `Project.status`.

### `GET /api/verification/project/:projectId` — *any authenticated user*
Lists all reports for the project, newest-first. → `200` + response[].

### `GET /api/verification/project/:projectId/latest` — *any authenticated user*
The most recent report for the project. → `200` or `404`.

### `GET /api/verification/report/:id` — *any authenticated user*
A single report by id (includes the full `anomalies` array — no re-run needed).
→ `200` or `404`.

### `VerificationReportResponseDto`
```json
{
  "id": "rep_...", "projectId": "...", "projectName": "...",
  "verifiedTonnes": 1284.6, "confidenceScore": 82,
  "status": "VERIFIED", "reportCid": "bafy...", "reportUrl": "https://<gw>/ipfs/bafy...",
  "ndviScore": 0.61, "anomalyCount": 0, "anomalies": [], "createdAt": "2026-07-16T..."
}
```

### RBAC
| Role | Trigger verify | Read reports |
|------|----------------|--------------|
| `DEVELOPER` | ✅ (own project) | ✅ |
| `AUDITOR` | ✅ (any) | ✅ |
| `ADMIN` | ✅ (any) | ✅ |
| `BUYER` | ❌ | ✅ |

---

## 7. Configuration

No new env vars required — Stage 3 reuses `PINATA_JWT` / `PINATA_GATEWAY` from
Stage 2. The only new dependency is **pdfkit** (pure JS):
```bash
npm install pdfkit
```

---

## 8. Running & verifying

```bash
cd backend

# 1. Regenerate the client (picks up VerificationReport) + apply migration.
npx prisma generate
npx prisma migrate deploy          # DATABASE_URL / DIRECT_URL

# 2. Build & start.
npm run build && npm run start:dev

# 3. Unit tests for the engine (services + orchestrator + PDF/IPFS wiring).
npx jest verification --runInBand

# 4. Full suite + type-check.
npx jest --runInBand               # 65 tests across 12 suites
npm run typecheck                  # tsc --noEmit
```

Swagger is served at `http://localhost:3001/api/docs` (the verify endpoint is
documented with request/response schemas and a worked example).

### End-to-end example
```bash
# 1. Auth profile + create a project (Stage 1) and upload >=3 evidence (Stage 2).
# 2. Run verification.
curl -X POST http://localhost:3001/api/verification/$PROJECT_ID/verify \
  -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" \
  -d '{"note":"Quarterly automated verification"}'

# 3. Fetch the latest report (CID + metadata, no re-run).
curl http://localhost:3001/api/verification/project/$PROJECT_ID/latest \
  -H "Authorization: Bearer ***"
```

---

## 9. Test results

`npx jest --runInBand` → **65 tests across 12 suites, all passing**
(21 in the new `verification` module; the rest are the existing Stage-1/2
suites, which remain green — no regressions). `npm run typecheck` and
`npx nest build` both pass clean.

Verification-module coverage:
- `ndvi.service.spec.ts` — determinism, range bounds, empty-evidence, health bands.
- `carbon-estimation.service.spec.ts` — positive estimate, NDVI scaling, area
  fallback, factor clamp.
- `anomaly-detection.service.spec.ts` — all 8 checks fire correctly; clean
  project yields zero anomalies.
- `report-generator.service.spec.ts` — PDF produced (valid `%PDF-` header),
  renders with and without anomalies.
- `verification.service.spec.ts` — full orchestrator wiring with mocked Prisma/
  Evidence/Pinata: 404 on missing project, RBAC forbid, VERIFIED persist,
  DUPLICATE_CID hard-reject, 404 on no reports.

---

## 10. Roadmap / swap-in points

- **Real NDVI:** replace `NDVIService.compute` body with a fetch of the
  Sentinel-2/Landsat scenes (the Stage-2 adapters pin reproducible descriptors)
  → band math `(NIR−Red)/(NIR+Red)`. Interface unchanged.
- **Real carbon model:** swap `CarbonEstimationService.estimate` for a
  methodology-specific allometric / Tier-1/2 equation. Interface unchanged.
- **Real anomaly ML:** replace `AnomalyDetectionService.detect` with a model
  scoring evidence embeddings / time series. Interface unchanged.
- **PDF:** `ReportGeneratorService` is the only place that knows about pdfkit;
  an HTML→PDF renderer can replace it without touching the orchestrator.
- **Unpin-on-delete:** when a retention policy exists, call
  `pinata.unpin(cid)` before dropping a `VerificationReport`.
```
