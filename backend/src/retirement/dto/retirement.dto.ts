import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** A Solana transaction signature: 64 bytes base58-encoded (87-88 chars). */
const BASE58_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{87,88}$/;

/** Canonical retirement reason categories offered by the UI. */
export const RETIREMENT_REASON_CATEGORIES = [
  'NET_ZERO',
  'CORPORATE_ESG',
  'CARBON_OFFSET',
  'COMPLIANCE',
  'CUSTOM',
] as const;

export type RetirementReasonCategory =
  (typeof RETIREMENT_REASON_CATEGORIES)[number];

/** POST /retirements — request body. */
export class RetireCreditsDto {
  @ApiProperty({
    description: 'Holding id of the owned credit position to retire from.',
    example: 'clx...uuid',
  })
  @IsString()
  holdingId: string;

  @ApiProperty({ description: 'Number of credits (tonnes) to retire.', example: 100 })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({
    description:
      'Retirement reason category. NET_ZERO, CORPORATE_ESG, CARBON_OFFSET, COMPLIANCE, or CUSTOM.',
    enum: RETIREMENT_REASON_CATEGORIES,
    example: 'NET_ZERO',
  })
  @IsIn(RETIREMENT_REASON_CATEGORIES)
  reasonCategory: RetirementReasonCategory;

  @ApiProperty({
    description:
      'Mandatory human-readable retirement reason. For CUSTOM, this is free text; for other categories it may be a specific statement.',
    example: 'Voluntary net-zero commitment for FY2026 Scope 1 emissions',
  })
  @IsString()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({
    description:
      'The connected wallet address (base58) that owns the credits and authorizes the retirement. Must match the holding wallet.',
    example: 'HNDAhSqXTA6woJLRRQpaMsWX171XVsjgxBXRxz95xfSB',
  })
  @IsOptional()
  @Matches(BASE58, { message: 'walletAddress must be a valid base58 Solana address' })
  walletAddress?: string;

  @ApiPropertyOptional({
    description: 'Organization name shown on the certificate.', example: 'Acme Corp',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  organization?: string;

  @ApiPropertyOptional({
    description:
      'Owner (wallet) signing secret (JSON / base58 / csv). Server-signed settlement: the backend signs + submits the burn. Automated tests / managed custody only. Mutually exclusive with `txSignature`.',
  })
  @IsOptional()
  @IsString()
  ownerSecret?: string;

  @ApiPropertyOptional({
    description:
      'An already-submitted on-chain burn signature (client-signed flow). When present, the backend records it as the settlement proof and performs no further chain write. Mutually exclusive with `ownerSecret`.',
  })
  @IsOptional()
  @Matches(BASE58_SIGNATURE, { message: 'txSignature must be a valid base58 Solana signature' })
  txSignature?: string;
}

/** GET /retirements — query params for history. */
export class RetirementHistoryQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-based).', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page.', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Free-text search across ids, reason, project, wallet.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by retirement reason category.',
    enum: RETIREMENT_REASON_CATEGORIES,
  })
  @IsOptional()
  @IsIn(RETIREMENT_REASON_CATEGORIES)
  reasonCategory?: RetirementReasonCategory;

  @ApiPropertyOptional({
    description: 'Filter by retirement status.',
    enum: ['PENDING', 'CONFIRMED', 'CERTIFIED'],
  })
  @IsOptional()
  @IsIn(['PENDING', 'CONFIRMED', 'CERTIFIED'])
  status?: 'PENDING' | 'CONFIRMED' | 'CERTIFIED';

  @ApiPropertyOptional({ description: 'Filter by project id.' })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Sort field.',
    enum: ['timestamp', 'createdAt', 'retiredAmount'],
    default: 'timestamp',
  })
  @IsOptional()
  @IsIn(['timestamp', 'createdAt', 'retiredAmount'])
  sortBy?: 'timestamp' | 'createdAt' | 'retiredAmount' = 'timestamp';

  @ApiPropertyOptional({
    description: 'Sort direction.',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';
}

/** GET /retirements/:id and list item. */
export class RetirementResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() retirementId: string;
  @ApiProperty() projectId: string;
  @ApiProperty() tokenMint: string;
  @ApiProperty() retiredAmount: number;
  @ApiProperty() retiredBy: string;
  @ApiProperty() walletAddress: string;
  @ApiProperty() reason: string;
  @ApiProperty() reasonCategory: string;
  @ApiProperty() transactionSignature: string;
  @ApiPropertyOptional({ nullable: true }) certificateCid: string | null;
  @ApiPropertyOptional({ nullable: true }) certificateUrl: string | null;
  @ApiProperty() status: string;
  @ApiPropertyOptional({ nullable: true }) organization: string | null;
  @ApiPropertyOptional({ nullable: true }) projectName: string | null;
  @ApiPropertyOptional({ nullable: true }) methodology: string | null;
  @ApiPropertyOptional({ nullable: true }) vintage: number | null;
  @ApiPropertyOptional({ nullable: true }) explorerUrl: string | null;
  @ApiPropertyOptional({ nullable: true }) ipfsUrl: string | null;
  @ApiPropertyOptional({ nullable: true }) certificateId: string | null;
  @ApiPropertyOptional({ nullable: true }) verifyUrl: string | null;
  @ApiProperty() timestamp: string;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
}

/** GET /retirements — paged response. */
export class RetirementHistoryResponseDto {
  @ApiProperty({ type: [RetirementResponseDto] })
  items: RetirementResponseDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  totalPages: number;
}
