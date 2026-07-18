import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EvidenceSource } from '@prisma/client';
import {
  AdapterContext,
  EvidenceAdapter,
  NormalizedEvidence,
  RawEvidence,
} from './evidence-adapter.interface';

/**
 * OpenWeather adapter — local climate context for the project polygon.
 *
 * OpenWeather's One Call API (3.0) is a genuinely keyed, free-tier endpoint,
 * so unlike the satellite archives (which are staged as reproducible request
 * descriptors for Stage 2), this adapter performs a LIVE fetch when
 * OPENWEATHER_API_KEY is configured. The raw API response is pinned to IPFS
 * verbatim for auditability. If no key is present we fall back to a
 * reproducible request descriptor so the ingestion flow still works end-to-end.
 */
@Injectable()
export class OpenWeatherAdapter implements EvidenceAdapter {
  readonly source = EvidenceSource.OPENWEATHER;
  private readonly logger = new Logger(OpenWeatherAdapter.name);
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENWEATHER_API_KEY') ?? '';
  }

  async fetch(ctx: AdapterContext): Promise<RawEvidence> {
    const lat = ctx.latitude;
    const lng = ctx.longitude;

    if (lat === undefined || lng === undefined) {
      throw new Error(
        'OpenWeatherAdapter requires latitude and longitude to query the API.',
      );
    }

    // Live fetch only when a key is configured; otherwise emit a descriptor.
    if (!this.apiKey) {
      this.logger.warn(
        'OPENWEATHER_API_KEY not set — emitting a reproducible descriptor instead of a live fetch.',
      );
      const descriptor = {
        provider: 'OpenWeather',
        endpoint: 'one-call',
        lat,
        lng,
        timestamp: ctx.timestamp?.toISOString(),
        apiKeyPresent: false,
        note: 'No API key configured; live fetch skipped.',
      };
      return {
        payload: descriptor,
        mimeType: 'application/json',
        filename: `openweather-${ctx.projectId}.json`,
        latitude: lat,
        longitude: lng,
        timestamp: ctx.timestamp,
        meta: descriptor,
      };
    }

    const url =
      `https://api.openweathermap.org/data/3.0/onecall` +
      `?lat=${lat}&lon=${lng}&units=metric&appid=${this.apiKey}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenWeather HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as Record<string, unknown>;
      const payload = {
        provider: 'OpenWeather',
        endpoint: 'one-call',
        lat,
        lng,
        fetchedAt: new Date().toISOString(),
        data: json,
      };
      return {
        payload,
        mimeType: 'application/json',
        filename: `openweather-${ctx.projectId}.json`,
        latitude: lat,
        longitude: lng,
        timestamp: ctx.timestamp ?? new Date(),
        meta: { provider: 'OpenWeather', units: 'metric' },
      };
    } catch (err) {
      // Surface the failure rather than silently pinning a partial descriptor.
      this.logger.error(`OpenWeather fetch failed: ${(err as Error).message}`);
      throw err;
    }
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
