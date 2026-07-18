import { Injectable } from '@nestjs/common';
import { EvidenceSource } from '@prisma/client';
import {
  AdapterContext,
  EvidenceAdapter,
  NormalizedEvidence,
  RawEvidence,
} from './evidence-adapter.interface';

/**
 * Landsat (USGS) adapter — complementary optical archive with longer history.
 * Builds a reproducible request descriptor pinned to IPFS.
 */
@Injectable()
export class LandsatAdapter implements EvidenceAdapter {
  readonly source = EvidenceSource.LANDSAT;

  async fetch(ctx: AdapterContext): Promise<RawEvidence> {
    const descriptor = {
      provider: 'Landsat',
      collection: 'LANDSAT_8_C2_L2',
      lat: ctx.latitude,
      lng: ctx.longitude,
      from: ctx.fromDate?.toISOString(),
      to: ctx.toDate?.toISOString(),
      bands: ['B4', 'B5'], // red + NIR
      product: 'NDVI',
    };
    return {
      payload: descriptor,
      mimeType: 'application/json',
      filename: `landsat-${ctx.projectId}.json`,
      latitude: ctx.latitude,
      longitude: ctx.longitude,
      timestamp: ctx.toDate ?? ctx.fromDate,
      meta: descriptor,
    };
  }

  async normalize(raw: RawEvidence, _ctx: AdapterContext): Promise<NormalizedEvidence> {
    return {
      source: this.source,
      latitude: raw.latitude,
      longitude: raw.longitude,
      timestamp: raw.timestamp,
      metadata: raw.meta ?? {},
    };
  }
}
