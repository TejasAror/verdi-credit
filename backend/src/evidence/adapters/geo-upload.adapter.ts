import { Injectable } from '@nestjs/common';
import { EvidenceSource } from '@prisma/client';
import {
  AdapterContext,
  EvidenceAdapter,
  NormalizedEvidence,
  RawEvidence,
} from './evidence-adapter.interface';

/**
 * GeoUpload adapter — handles user-supplied geo-tagged evidence files
 * (photo / PDF / JSON). The uploaded file bytes are the raw payload pinned to
 * IPFS; spatial/temporal context comes from the upload form (lat/lng/timestamp).
 */
@Injectable()
export class GeoUploadAdapter implements EvidenceAdapter {
  readonly source = EvidenceSource.GEO_UPLOAD;

  async fetch(ctx: AdapterContext): Promise<RawEvidence> {
    if (!ctx.file) {
      throw new Error('GeoUploadAdapter requires a file in the context.');
    }
    return {
      payload: ctx.file.buffer,
      filename: ctx.file.filename,
      mimeType: ctx.file.mimeType,
      latitude: ctx.latitude,
      longitude: ctx.longitude,
      timestamp: ctx.timestamp,
      meta: {
        originalName: ctx.file.filename,
        mimeType: ctx.file.mimeType,
      },
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
