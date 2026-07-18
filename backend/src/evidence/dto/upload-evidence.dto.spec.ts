import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UploadEvidenceDto } from './upload-evidence.dto';
import { EvidenceSource } from '@prisma/client';

describe('UploadEvidenceDto', () => {
  const base = {
    projectId: 'a1b2c3d4-1234-5678-90ab-cdef01234567',
    source: EvidenceSource.GEO_UPLOAD,
    latitude: -3.4653,
    longitude: -62.2159,
  };

  it('passes with valid numbers for latitude/longitude', async () => {
    const dto = plainToInstance(UploadEvidenceDto, base);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('coerces string multipart values into numbers', async () => {
    const dto = plainToInstance(UploadEvidenceDto, {
      ...base,
      latitude: '-3.4',
      longitude: '-62.2',
    });
    // @Type(()=>Number) converts the string field.
    expect(typeof dto.latitude).toBe('number');
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects latitude out of range (<-90 or >90)', async () => {
    const tooNorth = plainToInstance(UploadEvidenceDto, {
      ...base,
      latitude: 95,
    });
    expect(await validate(tooNorth)).not.toHaveLength(0);

    const tooSouth = plainToInstance(UploadEvidenceDto, {
      ...base,
      latitude: -91,
    });
    expect(await validate(tooSouth)).not.toHaveLength(0);
  });

  it('rejects longitude out of range (<-180 or >180)', async () => {
    const tooEast = plainToInstance(UploadEvidenceDto, {
      ...base,
      longitude: 200,
    });
    expect(await validate(tooEast)).not.toHaveLength(0);

    const tooWest = plainToInstance(UploadEvidenceDto, {
      ...base,
      longitude: -181,
    });
    expect(await validate(tooWest)).not.toHaveLength(0);
  });

  it('accepts boundary values (-90/-180 and 90/180)', async () => {
    const edge = plainToInstance(UploadEvidenceDto, {
      ...base,
      latitude: 90,
      longitude: 180,
    });
    expect(await validate(edge)).toHaveLength(0);
  });

  it('accepts missing optional lat/lng', async () => {
    const partial = plainToInstance(UploadEvidenceDto, {
      projectId: 'p1',
      source: EvidenceSource.SENTINEL2,
    });
    expect(await validate(partial)).toHaveLength(0);
  });

  it('rejects an invalid source enum', async () => {
    const bad = plainToInstance(UploadEvidenceDto, {
      ...base,
      source: 'NOT_A_SOURCE',
    } as any);
    expect(await validate(bad)).not.toHaveLength(0);
  });
});
