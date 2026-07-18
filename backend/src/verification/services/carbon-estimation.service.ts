import { Injectable, Logger } from '@nestjs/common';
import { ProjectType } from '@prisma/client';
import {
  CarbonEstimationResult,
  NdviResult,
} from '../verification.types';
import { clamp, polygonAreaHa } from './verification.utils';

/**
 * CarbonEstimationService (Stage 3 mock)
 * --------------------------------------
 * Estimates sequestered CO2e tonnes for a project from its polygon area and
 * the NDVI-derived vegetation health.
 *
 * MOCK ALGORITHM:
 *   areaHa = polygonAreaHa(geoPolygon)                  (shoelace, m² → ha)
 *   factor = typeFactor * (ndviMean / typeNdviAnchor)   (tonnes/ha/yr)
 *   estimatedTonnes = areaHa * factor
 *
 * The real integration will replace `estimate()` with a methodology-specific
 * allometric / Tier-1/2 equation (e.g. IPCC wetlands, AFOLU defaults). The
 * {@link CarbonEstimationResult} contract is stable.
 */
@Injectable()
export class CarbonEstimationService {
  private readonly logger = new Logger(CarbonEstimationService.name);

  // Nominal sequestration factor (t/ha/yr) and the NDVI mean it assumes.
  private readonly ANCHORS: Record<ProjectType, { factor: number; ndvi: number }> = {
    [ProjectType.REFORESTATION]: { factor: 5.0, ndvi: 0.6 },
    [ProjectType.SOIL_CARBON]: { factor: 2.0, ndvi: 0.45 },
    [ProjectType.RENEWABLE_ENERGY]: { factor: 0.2, ndvi: 0.2 },
  };

  estimate(
    projectId: string,
    projectType: ProjectType,
    geoPolygon: unknown,
    expectedAnnualTonnes: number,
    ndvi: NdviResult,
  ): CarbonEstimationResult {
    const anchor = this.ANCHORS[projectType] ?? this.ANCHORS[ProjectType.REFORESTATION];

    let areaHa = polygonAreaHa(geoPolygon);
    // Fallback when no usable polygon: invert a nominal factor from the claim.
    if (areaHa <= 0) {
      areaHa = expectedAnnualTonnes / anchor.factor;
    }

    const ndviRatio = ndvi.mean > 0 ? ndvi.mean / anchor.ndvi : 0;
    const factor = clamp(anchor.factor * ndviRatio, 0, anchor.factor * 2);
    const estimatedTonnes = areaHa * factor;

    const method =
      `estimatedTonnes = areaHa(${round2(areaHa)} ha) × ` +
      `factor(${round2(factor)} t/ha/yr); ` +
      `factor = ${anchor.factor} × (ndviMean ${ndvi.mean} / ${anchor.ndvi}) ` +
      `[type=${projectType}]`;

    this.logger.log(
      `Carbon estimate for ${projectId}: ${round2(estimatedTonnes)} t ` +
        `(area=${round2(areaHa)} ha, factor=${round2(factor)})`,
    );

    return {
      estimatedTonnes: round2(estimatedTonnes),
      areaHa: round2(areaHa),
      sequestrationFactorTonnesPerHa: round2(factor),
      method,
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
