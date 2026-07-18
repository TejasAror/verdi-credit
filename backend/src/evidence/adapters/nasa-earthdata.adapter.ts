import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EvidenceSource } from '@prisma/client';
import {
  AdapterContext,
  EvidenceAdapter,
  NormalizedEvidence,
  RawEvidence,
} from './evidence-adapter.interface';

/**
 * NASA EarthData adapter — precipitation / soil-moisture context used by the
 * carbon estimation models (esp. soil carbon). Reads NASA_API_KEY from env.
 * Builds a reproducible request descriptor pinned to IPFS.
 */
@Injectable()
export class NASAEarthDataAdapter implements EvidenceAdapter {
  readonly source = EvidenceSource.NASA_EARTHDATA;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('NASA_API_KEY') ?? '';
  }

  async fetch(ctx: AdapterContext): Promise<RawEvidence> {
    const descriptor = {
      provider: 'NASA EarthData',
      dataset: 'GPM_3IMERGDF',
      product: 'precipitation_cal',
      lat: ctx.latitude,
      lng: ctx.longitude,
      from: ctx.fromDate?.toISOString(),
      to: ctx.toDate?.toISOString(),
      apiKeyPresent: Boolean(this.apiKey),
    };
    return {
      payload: descriptor,
      mimeType: 'application/json',
      filename: `nasa-${ctx.projectId}.json`,
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
