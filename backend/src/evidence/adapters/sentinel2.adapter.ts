import { Injectable } from '@nestjs/common';
import { EvidenceSource } from '@prisma/client';
import {
  AdapterContext,
  EvidenceAdapter,
  NormalizedEvidence,
  RawEvidence,
} from './evidence-adapter.interface';

/**
 * Sentinel-2 (ESA/Copernicus) adapter — optical NDVI source.
 *
 * In production this would call the Copernicus / Sentinel Hub OData API for a
 * tile covering (lat,lng) within the date window. For Stage 2 we build a
 * structured request descriptor (the "raw" payload) and normalize it into the
 * unified Evidence shape. The descriptor is what gets pinned to IPFS, keeping
 * the exact query reproducible/auditable.
 */
@Injectable()
export class Sentinel2Adapter implements EvidenceAdapter {
  readonly source = EvidenceSource.SENTINEL2;

  async fetch(ctx: AdapterContext): Promise<RawEvidence> {
    const descriptor = {
      provider: 'Sentinel-2',
      collection: 'S2MSI2A',
      lat: ctx.latitude,
      lng: ctx.longitude,
      from: ctx.fromDate?.toISOString(),
      to: ctx.toDate?.toISOString(),
      bands: ['B04', 'B08'], // red + NIR for NDVI
      product: 'NDVI',
    };
    return {
      payload: descriptor,
      mimeType: 'application/json',
      filename: `sentinel2-${ctx.projectId}.json`,
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
