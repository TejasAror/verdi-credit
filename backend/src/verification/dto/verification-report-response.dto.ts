import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ProjectStatus } from '@prisma/client';
import { Anomaly } from '../verification.types';

/** Optional body for POST /verification/:projectId/verify. */
export class VerifyRequestDto {
  @ApiProperty({
    required: false,
    description: 'Free-form operator note recorded in the report + audit trail.',
    example: 'Quarterly automated verification run.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** API response for any verification report. */
export class VerificationReportResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() projectId: string;
  @ApiProperty() projectName: string;
  @ApiProperty({ description: 'AI-estimated sequestered tonnes (CO2e).' })
  verifiedTonnes: number;
  @ApiProperty({ description: 'Confidence score 0–100.' })
  confidenceScore: number;
  @ApiProperty({ enum: ProjectStatus })
  status: ProjectStatus;
  @ApiProperty({ description: 'IPFS CID of the pinned PDF report.' })
  reportCid: string;
  @ApiProperty({ required: false, nullable: true })
  reportUrl: string | null;
  @ApiProperty({ required: false, nullable: true, description: 'Headline NDVI mean.' })
  ndviScore: number | null;
  @ApiProperty({ description: 'Number of anomalies detected.' })
  anomalyCount: number;
  @ApiProperty({ type: () => [Object], description: 'Anomaly findings.' })
  anomalies: Anomaly[];
  @ApiProperty() createdAt: string;
}
