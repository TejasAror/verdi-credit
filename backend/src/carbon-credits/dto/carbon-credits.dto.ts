import { IsBase64, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** GET /carbon-credits/config */
export class CarbonCreditConfigDto {
  @ApiProperty({ example: '41jbriQNyaJLuUfJWennbwVqGTQeBDc94Ywj4pGBarnv' })
  programId: string;

  @ApiProperty({ example: 'devnet' })
  cluster: string;

  @ApiPropertyOptional({ example: 'DeTknRJ1orhpEBEqCjdYCCRw6JKEPYLiTUVEZCMaH6p9' })
  creditMint: string | null;

  @ApiProperty({ example: true })
  onChainEnabled: boolean;
}

/** GET /carbon-credits/eligible/:projectId */
export class EligibleResponseDto {
  @ApiProperty({ example: true })
  eligible: boolean;

  @ApiProperty({ example: 'proj-uuid' })
  projectId: string;

  @ApiProperty({ example: 1250.7 })
  verifiedTonnes: number;

  @ApiProperty({ example: 'bafy...' })
  reportCid: string;

  @ApiPropertyOptional({ example: 'bafy...' })
  evidenceCid?: string | null;

  @ApiPropertyOptional({ example: ['bafy...'] })
  evidenceCids?: string[];

  @ApiProperty({ example: 'VM0036' })
  methodology: string;

  @ApiProperty({ example: 'VERIFIED' })
  status: string;

  @ApiProperty({ example: 82 })
  confidenceScore: number;

  @ApiPropertyOptional({ example: 'Latest VERIFIED report is ready for 1:1 issuance.' })
  message?: string;
}

/** POST /carbon-credits/issue */
export class IssueCreditDto {
  @ApiProperty({ example: 'proj-uuid' })
  @IsString()
  projectId: string;

  @ApiProperty({ description: 'Recipient wallet (base58) that will receive the minted credits.' })
  @IsString()
  @Matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, { message: 'recipient must be a valid base58 Solana address' })
  recipient: string;

  @ApiPropertyOptional({ description: 'Vintage override; defaults to the verification year.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  vintage?: number;
}

/** POST /carbon-credits/issue — response */
export class IssueCreditResponseDto {
  @ApiProperty({ example: '4xKp...' })
  txSignature: string;

  @ApiProperty({ example: '9xY...' })
  batchPda: string;

  @ApiProperty({ example: '6Bfx...' })
  mint: string;

  @ApiProperty({ description: 'Credits issued = floor(verifiedTonnes).' })
  amount: number;

  @ApiProperty({ example: 'proj-uuid' })
  projectId: string;

  @ApiProperty({ example: 2026 })
  vintage: number;
}

/** POST /carbon-credits/transfer */
export class TransferCreditDto {
  @ApiProperty({ example: '6Bfx...' })
  @IsString()
  mint: string;

  @ApiProperty({ description: 'Owner (sender) wallet — must sign the returned tx.' })
  @IsString()
  from: string;

  @ApiProperty({ description: 'Recipient wallet.' })
  @IsString()
  to: string;

  @ApiProperty({ example: 250 })
  @IsInt()
  @Min(1)
  amount: number;
}

/** POST /carbon-credits/retire */
export class RetireCreditDto {
  @ApiProperty({ example: '6Bfx...' })
  @IsString()
  mint: string;

  @ApiProperty({ description: 'Owner wallet — must sign the returned tx.' })
  @IsString()
  owner: string;

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({ example: 'Voluntary offset for Q3 emissions' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ example: 'bafy...' })
  @IsOptional()
  @IsString()
  reportRef?: string;
}

/** A base64-serialized, owner-signed-ready transaction. */
export class PreparedTxDto {
  @ApiProperty({ description: 'base64 Transaction for the client wallet to sign + submit.' })
  @IsBase64()
  transaction: string;

  @ApiProperty({ description: 'The wallet that must sign the transaction.' })
  requiresSigner: string;
}
