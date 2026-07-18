import { EvidenceSource, ProjectStatus, ProjectType } from '@prisma/client';

/**
 * Shared types for the Stage 3 AI Verification Engine.
 *
 * These interfaces are intentionally infrastructure-free (no Prisma, no Nest)
 * so each algorithm service can be unit-tested in isolation and swapped for a
 * real implementation (satellite NDVI, allometric carbon model, anomaly ML)
 * without touching the orchestrator, API, or PDF/IPFS steps.
 */

/** A flattened view of an Evidence row that the algorithms consume. */
export interface EvidenceItem {
  id: string;
  source: EvidenceSource;
  cid: string;
  latitude: number | null;
  longitude: number | null;
  timestamp: Date | null;
  metadata?: Record<string, unknown> | null;
}

export type NdviHealth = 'SPARSE' | 'MODERATE' | 'HEALTHY' | 'DENSE';

export interface NdviPerSource {
  source: EvidenceSource;
  mean: number;
  count: number;
}

export interface NdviResult {
  /** Weighted mean NDVI across all evidence (-0.1 .. 0.95). */
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
  /** Number of evidence samples used. */
  sampleCount: number;
  perSource: NdviPerSource[];
  health: NdviHealth;
}

export interface CarbonEstimationResult {
  /** Estimated sequestered CO2e in tonnes. */
  estimatedTonnes: number;
  /** Project area in hectares derived from the geo-polygon. */
  areaHa: number;
  /** Tonnes per hectare per year used in the estimation. */
  sequestrationFactorTonnesPerHa: number;
  /** Human-readable formula + inputs for auditability. */
  method: string;
}

export type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Anomaly {
  type: string;
  severity: AnomalySeverity;
  message: string;
  /** Optional references (evidence ids, cids) for traceability. */
  refs?: string[];
}

export interface AnomalyResult {
  anomalies: Anomaly[];
}

/** The full structured output of one verification run. */
export interface VerificationResult {
  projectId: string;
  projectName: string;
  projectType: ProjectType;
  methodology: string;
  expectedAnnualTonnes: number;
  /** Polygon area in hectares (derived once, reused by report + carbon). */
  areaHa: number;
  evidence: EvidenceItem[];
  ndvi: NdviResult;
  carbon: CarbonEstimationResult;
  anomalies: Anomaly[];
  confidenceScore: number; // 0..100
  status: ProjectStatus; // VERIFIED | PENDING_VERIFICATION | REJECTED
  /** The AI-estimated verified tonnes (== carbon.estimatedTonnes). */
  verifiedTonnes: number;
  /** Rationale for the confidence score / status thresholds. */
  notes: string[];
}
