import { Injectable, Logger } from '@nestjs/common';
import { ProjectType } from '@prisma/client';
import {
  Anomaly,
  AnomalyResult,
  CarbonEstimationResult,
  EvidenceItem,
  NdviResult,
} from '../verification.types';
import { pointInPolygon } from './verification.utils';

/**
 * AnomalyDetectionService (Stage 3 mock)
 * --------------------------------------
 * Scans the aggregated evidence + computed NDVI/carbon for inconsistencies or
 * suspicious patterns. Each check emits an {@link Anomaly} tagged with a
 * severity used by the orchestrator to derive the confidence score / status.
 *
 * MOCK ALGORITHM: rule-based heuristics over the evidence set. The real
 * integration will replace `detect()` with a model scoring embeddings / time
 * series; the {@link AnomalyResult} contract is stable.
 */
@Injectable()
export class AnomalyDetectionService {
  private readonly logger = new Logger(AnomalyDetectionService.name);

  private readonly LOW_EVIDENCE_THRESHOLD = 3;
  private readonly OVERCLAIM_MULTIPLIER = 2;
  private readonly UNDERPERFORM_MULTIPLIER = 0.3;
  private readonly LOW_NDVI_THRESHOLD = 0.2;
  private readonly MAX_TIME_GAP_DAYS = 180;
  private readonly SOURCE_SPREAD_THRESHOLD = 0.4;

  detect(params: {
    projectId: string;
    projectType: ProjectType;
    expectedAnnualTonnes: number;
    geoPolygon: unknown;
    evidence: EvidenceItem[];
    ndvi: NdviResult;
    carbon: CarbonEstimationResult;
  }): AnomalyResult {
    const { projectType, expectedAnnualTonnes, geoPolygon, evidence, ndvi, carbon } =
      params;
    const anomalies: Anomaly[] = [];
    const vegProject =
      projectType === ProjectType.REFORESTATION ||
      projectType === ProjectType.SOIL_CARBON;

    // 1. Low evidence count.
    if (evidence.length < this.LOW_EVIDENCE_THRESHOLD) {
      anomalies.push({
        type: 'EVIDENCE_COUNT_LOW',
        severity: 'HIGH',
        message: `Only ${evidence.length} evidence item(s) supplied (minimum ${this.LOW_EVIDENCE_THRESHOLD} expected for a trustworthy verdict).`,
      });
    }

    // 2. Duplicate CIDs (same payload pinned twice).
    const seen = new Map<string, number>();
    for (const e of evidence) {
      seen.set(e.cid, (seen.get(e.cid) ?? 0) + 1);
    }
    const dupCids = [...seen.entries()].filter(([, n]) => n > 1).map(([c]) => c);
    if (dupCids.length > 0) {
      anomalies.push({
        type: 'DUPLICATE_CID',
        severity: 'HIGH',
        message: `Duplicate evidence CIDs detected (${dupCids.length}); identical payloads may be double-counted.`,
        refs: dupCids,
      });
    }

    // 3. Carbon over-claim vs declared expectation.
    if (carbon.estimatedTonnes > expectedAnnualTonnes * this.OVERCLAIM_MULTIPLIER) {
      anomalies.push({
        type: 'CARBON_OVERCLAIM',
        severity: 'HIGH',
        message: `Estimated ${round2(carbon.estimatedTonnes)} t exceeds ${this.OVERCLAIM_MULTIPLIER}× the declared ${expectedAnnualTonnes} t.`,
      });
    }

    // 4. Low vegetation health on a vegetation project.
    if (vegProject && ndvi.mean < this.LOW_NDVI_THRESHOLD) {
      anomalies.push({
        type: 'NDVI_LOW',
        severity: 'MEDIUM',
        message: `Mean NDVI ${ndvi.mean} is below the ${this.LOW_NDVI_THRESHOLD} plausibility floor for ${projectType}.`,
      });
    }

    // 5. Time gap between evidence captures too large.
    const times = evidence
      .map((e) => e.timestamp?.getTime())
      .filter((t): t is number => typeof t === 'number' && !Number.isNaN(t))
      .sort((a, b) => a - b);
    if (times.length >= 2) {
      const gapDays = (times[times.length - 1] - times[0]) / 86_400_000;
      if (gapDays > this.MAX_TIME_GAP_DAYS) {
        anomalies.push({
          type: 'TIME_GAP',
          severity: 'MEDIUM',
          message: `Evidence spans ${Math.round(gapDays)} days (> ${this.MAX_TIME_GAP_DAYS} day max gap); monitoring continuity is suspect.`,
        });
      }
    }

    // 6. Evidence outside the declared project polygon.
    if (geoPolygon) {
      const outside = evidence.filter(
        (e) =>
          e.latitude !== null &&
          e.longitude !== null &&
          !pointInPolygon(e.longitude, e.latitude, geoPolygon),
      );
      if (outside.length > 0) {
        anomalies.push({
          type: 'OUT_OF_POLICY_AREA',
          severity: 'MEDIUM',
          message: `${outside.length} evidence item(s) fall outside the declared project polygon.`,
          refs: outside.map((e) => e.id),
        });
      }
    }

    // 7. Severe underperformance vs declared expectation.
    if (
      carbon.estimatedTonnes > 0 &&
      carbon.estimatedTonnes < expectedAnnualTonnes * this.UNDERPERFORM_MULTIPLIER
    ) {
      anomalies.push({
        type: 'CARBON_UNDERPERFORM',
        severity: 'LOW',
        message: `Estimated ${round2(carbon.estimatedTonnes)} t is below ${this.UNDERPERFORM_MULTIPLIER * 100}% of the declared ${expectedAnnualTonnes} t.`,
      });
    }

    // 8. Source conflict: large spread between per-source NDVI means.
    if (ndvi.perSource.length >= 2) {
      const means = ndvi.perSource.map((p) => p.mean);
      const spread = Math.max(...means) - Math.min(...means);
      if (spread > this.SOURCE_SPREAD_THRESHOLD) {
        anomalies.push({
          type: 'SOURCE_CONFLICT',
          severity: 'LOW',
          message: `Per-source NDVI spread is ${round2(spread)} (${this.SOURCE_SPREAD_THRESHOLD} threshold); sources disagree on vegetation health.`,
        });
      }
    }

    this.logger.log(
      `Anomaly detection for ${params.projectId}: ${anomalies.length} finding(s)`,
    );
    return { anomalies };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
