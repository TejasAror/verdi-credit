import { Injectable, Logger } from '@nestjs/common';
import { EvidenceSource, ProjectType } from '@prisma/client';
import {
  EvidenceItem,
  NdviHealth,
  NdviResult,
  NdviPerSource,
} from '../verification.types';
import {
  baseNdviForType,
  clamp,
  hashString,
  seededRandom,
  sourceWeight,
} from './verification.utils';

/**
 * NDVIService (Stage 3 mock)
 * --------------------------
 * Computes vegetation health for a project from its aggregated evidence.
 *
 * MOCK ALGORITHM: each evidence item yields one synthetic NDVI sample derived
 * deterministically from (projectId + evidence.id), centered on a type-based
 * base value with bounded jitter, and weighted by source reliability. The
 * real integration will fetch Sentinel-2/Landsat scenes (the Stage-2 adapters
 * already pin reproducible descriptors) and compute (NIR - Red)/(NIR + Red).
 *
 * The interface ({@link NdviResult}) is stable: swapping in the real model is
 * a drop-in change inside `compute()`.
 */
@Injectable()
export class NdviService {
  private readonly logger = new Logger(NdviService.name);

  compute(
    projectId: string,
    projectType: ProjectType,
    evidence: EvidenceItem[],
  ): NdviResult {
    const base = baseNdviForType(projectType);

    if (!evidence || evidence.length === 0) {
      return this.emptyResult(base);
    }

    const perSourceMap = new Map<EvidenceSource, { sum: number; count: number }>();
    let weightedSum = 0;
    let weightTotal = 0;
    let min = Infinity;
    let max = -Infinity;
    const samples: number[] = [];

    for (const item of evidence) {
      const seed = hashString(`${projectId}:${item.id}`);
      const jitter = (seededRandom(seed) - 0.5) * 0.4; // ±0.2
      const sample = clamp(base + jitter, -0.1, 0.95);

      const w = sourceWeight(item.source);
      weightedSum += sample * w;
      weightTotal += w;
      min = Math.min(min, sample);
      max = Math.max(max, sample);
      samples.push(sample);

      const prev = perSourceMap.get(item.source) ?? { sum: 0, count: 0 };
      perSourceMap.set(item.source, { sum: prev.sum + sample, count: prev.count + 1 });
    }

    const mean = weightTotal > 0 ? weightedSum / weightTotal : base;
    const sorted = [...samples].sort((a, b) => a - b);
    const median = medianOf(sorted);
    const stdDev = stdDevOf(samples, mean);

    const perSource: NdviPerSource[] = [...perSourceMap.entries()].map(
      ([source, { sum, count }]) => ({
        source,
        mean: round2(sum / count),
        count,
      }),
    );

    this.logger.log(
      `NDVI computed for ${projectId}: mean=${round2(mean)} (n=${evidence.length})`,
    );

    return {
      mean: round2(mean),
      median: round2(median),
      min: round2(min),
      max: round2(max),
      stdDev: round2(stdDev),
      sampleCount: evidence.length,
      perSource,
      health: healthFromMean(mean),
    };
  }

  private emptyResult(base: number): NdviResult {
    return {
      mean: 0,
      median: 0,
      min: 0,
      max: 0,
      stdDev: 0,
      sampleCount: 0,
      perSource: [],
      health: base < 0.2 ? 'SPARSE' : 'MODERATE',
    };
  }
}

function healthFromMean(mean: number): NdviHealth {
  if (mean < 0.2) return 'SPARSE';
  if (mean < 0.45) return 'MODERATE';
  if (mean < 0.7) return 'HEALTHY';
  return 'DENSE';
}

function medianOf(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function stdDevOf(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
