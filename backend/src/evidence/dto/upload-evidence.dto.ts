import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EvidenceSource } from '@prisma/client';
import { LAT_MAX, LAT_MIN, LNG_MAX, LNG_MIN } from './evidence.constants';

/**
 * DTO for `POST /evidence/upload` (multipart/form-data).
 *
 * The file itself is NOT part of this DTO — it is bound separately to the
 * route handler via `@UploadedFile()`. This class only carries the scalar
 * form fields. multipart values arrive as strings, so latitude/longitude use
 * `@Type(() => Number)` + `@IsNumber()` to coerce and then enforce the
 * valid geographic ranges via `@Min/@Max`.
 */
export class UploadEvidenceDto {
  @ApiProperty({
    example: 'a1b2c3d4-1234-5678-90ab-cdef01234567',
    description: 'Project this evidence belongs to.',
  })
  @IsString()
  projectId: string;

  @ApiProperty({
    enum: EvidenceSource,
    example: EvidenceSource.GEO_UPLOAD,
    description: 'Which adapter/source produced this evidence.',
  })
  @IsEnum(EvidenceSource)
  source: EvidenceSource;

  @ApiPropertyOptional({
    type: Number,
    example: -3.4653,
    description: `Latitude in decimal degrees (${LAT_MIN}..${LAT_MAX}). Required for GEO_UPLOAD.`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 10 })
  @Min(LAT_MIN)
  @Max(LAT_MAX)
  latitude?: number;

  @ApiPropertyOptional({
    type: Number,
    example: -62.2159,
    description: `Longitude in decimal degrees (${LNG_MIN}..${LNG_MAX}). Required for GEO_UPLOAD.`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 10 })
  @Min(LNG_MIN)
  @Max(LNG_MAX)
  longitude?: number;

  @ApiPropertyOptional({
    example: '2026-07-15T12:00:00.000Z',
    description: 'ISO-8601 capture timestamp of the evidence.',
  })
  @IsOptional()
  @IsString()
  timestamp?: string;

  @ApiPropertyOptional({
    example: 'Field photo of planted saplings, plot A.',
    description:
      'Free-form note stored in the evidence `metadata` JSON column.',
  })
  @IsOptional()
  @IsString()
  note?: string;


  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Evidence file (required for GEO_UPLOAD)',
  })
  file?: any;
}
