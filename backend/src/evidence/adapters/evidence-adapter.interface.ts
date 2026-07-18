import { EvidenceSource } from '@prisma/client';

/**
 * The unified, source-agnostic shape that every adapter normalizes external
 * data into before it is pinned to IPFS and persisted as an `Evidence` row.
 * Fields mirror the Prisma `Evidence` model (minus DB-managed fields).
 */
export interface NormalizedEvidence {
  source: EvidenceSource;
  cid?: string; // not set by adapters; assigned after IPFS pin
  latitude?: number;
  longitude?: number;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Common contract for every evidence source adapter.
 *
 * - `fetch()` pulls raw data for a project (coordinates / period) from the
 *   external provider (or, for uploads, wraps the supplied file).
 * - `normalize()` transforms the raw payload into {@link NormalizedEvidence}.
 */
export interface EvidenceAdapter {
  readonly source: EvidenceSource;
  fetch(context: AdapterContext): Promise<RawEvidence>;
  normalize(raw: RawEvidence, context: AdapterContext): Promise<NormalizedEvidence>;
}

/** Inputs every adapter receives. */
export interface AdapterContext {
  projectId: string;
  /** Project centroid / area hint for spatial adapters. */
  latitude?: number;
  longitude?: number;
  /** Inclusive capture window for remote adapters. */
  fromDate?: Date;
  toDate?: Date;
  /** For GEO_UPLOAD: the already-read file bytes + original name + mime. */
  file?: { buffer: Buffer; filename: string; mimeType: string };
  /** Optional caller-supplied overrides for capture time. */
  timestamp?: Date;
}

/** Raw payload returned by `fetch()` — provider-specific, not yet normalized. */
export interface RawEvidence {
  /** The bytes that will be pinned to IPFS (file or serialized JSON). */
  payload: Buffer | Record<string, unknown>;
  /** When payload is a file. */
  filename?: string;
  mimeType?: string;
  /** Extracted spatial/temporal hints (adapters may pre-extract). */
  latitude?: number;
  longitude?: number;
  timestamp?: Date;
  /** Provider-specific structured fields kept in metadata. */
  meta?: Record<string, unknown>;
}
