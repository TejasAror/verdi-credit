import { Injectable } from '@nestjs/common';

export interface GeoValidationResult {
  overlapDetected: boolean;
  checkedAt: string;
  message?: string;
}

/**
 * GeoValidationService
 * ---------------------
 * Stage 1 mock implementation of the anti-double-counting pre-screen.
 *
 * FUTURE: This service will run a spatial intersection (PostGIS `ST_Overlaps`
 * / `ST_Intersects` or a point-in-polygon check) against all existing project
 * polygons to detect overlapping claims before a project is accepted.
 *
 * For now it deterministically returns `overlapDetected: false` so the
 * onboarding flow is fully exercisable end-to-end.
 */
@Injectable()
export class GeoValidationService {
  async validate(_polygon: unknown): Promise<GeoValidationResult> {
    // MOCK: no overlap detected. Replace with a real spatial query later.
    return {
      overlapDetected: false,
      checkedAt: new Date().toISOString(),
      message: 'Mock validation — no spatial store configured yet.',
    };
  }
}
