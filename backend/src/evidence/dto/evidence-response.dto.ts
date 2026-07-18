import { ApiProperty } from '@nestjs/swagger';
import { EvidenceSource, EvidenceStatus } from '@prisma/client';

export class EvidenceResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() projectId: string;
  @ApiProperty({ enum: EvidenceSource }) source: EvidenceSource;
  @ApiProperty({ enum: EvidenceStatus }) status: EvidenceStatus;
  @ApiProperty() cid: string;
  @ApiProperty({ required: false, nullable: true }) ipfsUrl: string | null;
  @ApiProperty({ required: false, nullable: true }) latitude: number | null;
  @ApiProperty({ required: false, nullable: true }) longitude: number | null;
  @ApiProperty({ required: false, nullable: true }) timestamp: string | null;
  @ApiProperty({ required: false, nullable: true }) metadata: unknown;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
}
