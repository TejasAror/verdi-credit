import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ListingStatus, ProjectType } from '@prisma/client';

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** POST /marketplace/listings — create a listing. */
export class CreateListingDto {
  @ApiProperty({
    description: 'On-chain credit identifier (mint / batch address, base58).',
    example: '6Bfx...',
  })
  @IsString()
  @Matches(BASE58, { message: 'creditId must be a valid base58 Solana address' })
  creditId: string;

  @ApiProperty({
    description: 'Seller wallet (base58) — must be the connected wallet and current credit owner.',
    example: 'HNDAhSqXTA6woJLRRQpaMsWX171XVsjgxBXRxz95xfSB',
  })
  @IsString()
  @Matches(BASE58, { message: 'seller must be a valid base58 Solana address' })
  seller: string;

  @ApiProperty({ description: 'Sale price (USDC / platform unit).', example: 24.5 })
  @IsNumber()
  @Min(0.000001, { message: 'price must be greater than 0' })
  price: number;

  @ApiPropertyOptional({ description: 'Credits (tonnes) offered.', example: 100, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @ApiPropertyOptional({ description: 'Originating project id (uuid).' })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ example: 'Amazon Reforestation Block A' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  projectName?: string;

  @ApiPropertyOptional({ enum: ProjectType })
  @IsOptional()
  @IsString()
  projectType?: ProjectType;

  @ApiPropertyOptional({ example: 'VM0036' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  methodology?: string;

  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @IsInt()
  @Min(1)
  vintage?: number;

  @ApiPropertyOptional({ example: 1250.7 })
  @IsOptional()
  @IsNumber()
  verifiedTonnes?: number;

  @ApiPropertyOptional({ example: 'bafy...' })
  @IsOptional()
  @IsString()
  reportCid?: string;
}

/** POST /marketplace/listings/:id/buy — purchase a listing. */
export class BuyListingDto {
  @ApiProperty({
    description: 'Buyer wallet (base58) — the connected wallet authorizing the purchase.',
    example: 'HNDAhSqXTA6woJLRRQpaMsWX171XVsjgxBXRxz95xfSB',
  })
  @IsString()
  @Matches(BASE58, { message: 'buyer must be a valid base58 Solana address' })
  buyer: string;
}

/** POST /marketplace/listings/:id/cancel — cancel a listing. */
export class CancelListingDto {
  @ApiProperty({
    description: 'Wallet requesting the cancel (base58) — must equal the listing seller.',
    example: 'HNDAhSqXTA6woJLRRQpaMsWX171XVsjgxBXRxz95xfSB',
  })
  @IsString()
  @Matches(BASE58, { message: 'seller must be a valid base58 Solana address' })
  seller: string;
}

/** A listing as returned by the API. */
export class ListingResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() creditId: string;
  @ApiProperty() seller: string;
  @ApiPropertyOptional({ nullable: true }) buyer: string | null;
  @ApiProperty() price: number;
  @ApiProperty() amount: number;
  @ApiProperty({ enum: ['ACTIVE', 'SOLD', 'CANCELLED'] }) status: ListingStatus;
  @ApiPropertyOptional({ nullable: true }) projectId: string | null;
  @ApiPropertyOptional({ nullable: true }) projectName: string | null;
  @ApiPropertyOptional({ nullable: true }) projectType: ProjectType | null;
  @ApiPropertyOptional({ nullable: true }) methodology: string | null;
  @ApiPropertyOptional({ nullable: true }) vintage: number | null;
  @ApiPropertyOptional({ nullable: true }) verifiedTonnes: number | null;
  @ApiPropertyOptional({ nullable: true }) reportCid: string | null;
  @ApiPropertyOptional({ nullable: true }) txSignature: string | null;
  @ApiPropertyOptional({ nullable: true }) explorerUrl?: string | null;
  @ApiPropertyOptional({ nullable: true }) settledAt: string | null;
  @ApiPropertyOptional({ nullable: true }) metadata?: unknown;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
}
