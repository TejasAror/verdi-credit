import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Generic cursor/offset paged query shared by explorer list endpoints. */
export class ExplorerPageQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-based).', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page.', default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Free-text search across ids, names, wallets, mints, CIDs, tx signatures.',
    maxLength: 160,
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  @ApiPropertyOptional({
    description: 'Sort field.',
    enum: ['createdAt', 'updatedAt', 'totalMinted', 'totalRetired', 'projectName', 'mint', 'slot'],
    default: 'updatedAt',
  })
  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'totalMinted', 'totalRetired', 'projectName', 'mint', 'slot'])
  sortBy?: 'createdAt' | 'updatedAt' | 'totalMinted' | 'totalRetired' | 'projectName' | 'mint' | 'slot' =
    'updatedAt';

  @ApiPropertyOptional({ description: 'Sort direction.', enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ description: 'Filter credits by project id (credits endpoint only).', maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Filter projects by status (projects endpoint only).',
    enum: ['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'RETIRED'],
  })
  @IsOptional()
  @IsIn(['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'RETIRED'])
  status?: 'DRAFT' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED' | 'RETIRED';
}

/** Paged response envelope used by every explorer list endpoint. */
export class ExplorerPageDto<T> {
  @ApiProperty({ isArray: true })
  items: T[];

  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
  @ApiProperty() totalPages: number;
}

/** Credit (mint) lifecycle snapshot — public view. */
export class CreditSnapshotDto {
  @ApiProperty() creditId: string;
  @ApiPropertyOptional({ nullable: true }) projectId: string | null;
  @ApiPropertyOptional({ nullable: true }) projectName: string | null;
  @ApiPropertyOptional({ nullable: true }) projectType: string | null;
  @ApiPropertyOptional({ nullable: true }) methodology: string | null;
  @ApiPropertyOptional({ nullable: true }) vintage: number | null;
  @ApiProperty() totalMinted: number;
  @ApiProperty() totalRetired: number;
  @ApiProperty() circulatingSupply: number;
  @ApiPropertyOptional({ nullable: true }) currentOwner: string | null;
  @ApiPropertyOptional({ nullable: true }) reportStatus: string | null;
  @ApiPropertyOptional({ nullable: true }) reportCid: string | null;
  @ApiPropertyOptional({ type: [String], nullable: true }) evidenceCids: string[] | null;
  @ApiProperty() transferCount: number;
  @ApiProperty() fullyRetired: boolean;
  @ApiPropertyOptional({ nullable: true }) lastSignature: string | null;
  @ApiPropertyOptional({ nullable: true }) lastSlot: string | null;
  @ApiPropertyOptional({ nullable: true }) lastEventAt: string | null;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
}

/** A single decoded on-chain event — public view. */
export class IndexedEventDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['CREDIT_MINTED', 'CREDIT_TRANSFERRED', 'CREDIT_RETIRED', 'ORACLE_AUTHORITY_CHANGED'] })
  eventType: string;
  @ApiProperty() signature: string;
  @ApiProperty() eventIndex: number;
  @ApiProperty() slot: string;
  @ApiPropertyOptional({ nullable: true }) blockTime: string | null;
  @ApiProperty() programId: string;
  @ApiPropertyOptional({ nullable: true }) mint: string | null;
  @ApiPropertyOptional({ nullable: true }) projectId: string | null;
  @ApiPropertyOptional() accounts: Record<string, string> | null;
  @ApiProperty() payload: Record<string, unknown>;
  @ApiProperty() createdAt: string;
}

/** Ownership transfer entry — public view. */
export class OwnershipTransferDto {
  @ApiProperty() id: string;
  @ApiProperty() mint: string;
  @ApiProperty() fromWallet: string;
  @ApiProperty() toWallet: string;
  @ApiProperty() amount: number;
  @ApiProperty() signature: string;
  @ApiProperty() slot: string;
  @ApiPropertyOptional({ nullable: true }) blockTime: string | null;
  @ApiProperty() seq: number;
  @ApiProperty() createdAt: string;
}

/** A single on-chain transaction — public view. */
export class ExplorerTransactionDto {
  @ApiProperty() signature: string;
  @ApiPropertyOptional({ nullable: true }) mint: string | null;
  @ApiProperty({ enum: ['MINT', 'TRANSFER', 'RETIRE', 'AUTHORITY', 'OTHER'] })
  kind: string;
  @ApiPropertyOptional({ nullable: true }) summary: string | null;
  @ApiPropertyOptional({ nullable: true }) signer: string | null;
  @ApiProperty() slot: string;
  @ApiPropertyOptional({ nullable: true }) blockTime: string | null;
  @ApiProperty() instructionCount: number;
  @ApiProperty() success: boolean;
  @ApiProperty() createdAt: string;
}

/** Indexed retirement — public view. */
export class IndexedRetirementDto {
  @ApiProperty() id: string;
  @ApiProperty() retirementRecord: string;
  @ApiProperty() owner: string;
  @ApiProperty() mint: string;
  @ApiProperty() batch: string;
  @ApiProperty() amount: number;
  @ApiPropertyOptional({ nullable: true }) reason: string | null;
  @ApiPropertyOptional({ nullable: true }) reportRef: string | null;
  @ApiProperty() signature: string;
  @ApiProperty() slot: string;
  @ApiPropertyOptional({ nullable: true }) blockTime: string | null;
  @ApiProperty() totalRetired: number;
  @ApiProperty() createdAt: string;
}

/** Project lifecycle snapshot — public view. */
export class ProjectSnapshotDto {
  @ApiProperty() projectId: string;
  @ApiPropertyOptional({ nullable: true }) ownerId: string | null;
  @ApiPropertyOptional({ nullable: true }) projectName: string | null;
  @ApiPropertyOptional({ nullable: true }) projectType: string | null;
  @ApiPropertyOptional({ nullable: true }) methodology: string | null;
  @ApiPropertyOptional({ nullable: true }) expectedAnnualTonnes: number | null;
  @ApiPropertyOptional({ nullable: true }) status: string | null;
  @ApiPropertyOptional({ type: [String] }) creditIds: string[];
  @ApiProperty() totalMinted: number;
  @ApiProperty() totalRetired: number;
  @ApiProperty() circulatingSupply: number;
  @ApiProperty() evidenceCount: number;
  @ApiProperty() verificationCount: number;
  @ApiProperty() retirementCount: number;
  @ApiPropertyOptional({ nullable: true }) lastSignature: string | null;
  @ApiPropertyOptional({ nullable: true }) lastSlot: string | null;
  @ApiPropertyOptional({ nullable: true }) lastEventAt: string | null;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
}

/** Stage 1-6 off-chain artifact references merged into a credit/project view. */
export class EvidenceRefDto {
  @ApiProperty() id: string;
  @ApiProperty() source: string;
  @ApiProperty() status: string;
  @ApiProperty() cid: string;
  @ApiPropertyOptional({ nullable: true }) ipfsUrl: string | null;
  @ApiPropertyOptional({ nullable: true }) latitude: number | null;
  @ApiPropertyOptional({ nullable: true }) longitude: number | null;
  @ApiProperty() createdAt: string;
}

export class VerificationReportRefDto {
  @ApiProperty() id: string;
  @ApiProperty() verifiedTonnes: number;
  @ApiProperty() confidenceScore: number;
  @ApiProperty() status: string;
  @ApiProperty() reportCid: string;
  @ApiPropertyOptional({ nullable: true }) reportUrl: string | null;
  @ApiPropertyOptional({ nullable: true }) ndviScore: number | null;
  @ApiProperty() createdAt: string;
}

/** A node in the visual lifecycle timeline. */
export class LifecycleEventDto {
  @ApiProperty({
    enum: ['PROJECT_REGISTERED', 'EVIDENCE_UPLOADED', 'AI_VERIFIED', 'CREDIT_ISSUED', 'TRANSFERRED', 'RETIRED'],
  })
  stage: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional({ nullable: true }) description?: string | null;
  @ApiPropertyOptional({ nullable: true }) timestamp?: string | null;
  @ApiPropertyOptional({ nullable: true }) txSignature?: string | null;
  @ApiPropertyOptional({ nullable: true }) refId?: string | null;
  @ApiPropertyOptional({ nullable: true }) link?: string | null;
}

/** Aggregated explorer result returned by the public search-by-credit endpoint. */
export class CreditExplorerResultDto {
  @ApiProperty() found: boolean;
  @ApiPropertyOptional({ nullable: true }) credit: CreditSnapshotDto | null;
  @ApiPropertyOptional({ type: [LifecycleEventDto] }) lifecycle: LifecycleEventDto[];
  @ApiPropertyOptional({ type: [IndexedEventDto] }) events: IndexedEventDto[];
  @ApiPropertyOptional({ type: [OwnershipTransferDto] }) ownershipHistory: OwnershipTransferDto[];
  @ApiPropertyOptional({ type: [ExplorerTransactionDto] }) transactions: ExplorerTransactionDto[];
  @ApiPropertyOptional({ type: [IndexedRetirementDto] }) retirements: IndexedRetirementDto[];
  @ApiPropertyOptional({ type: [EvidenceRefDto] }) evidence: EvidenceRefDto[];
  @ApiPropertyOptional({ type: [VerificationReportRefDto] }) verificationReports: VerificationReportRefDto[];
}

/** Aggregated explorer result returned by the public search-by-project endpoint. */
export class ProjectExplorerResultDto {
  @ApiProperty() found: boolean;
  @ApiPropertyOptional({ nullable: true }) project: ProjectSnapshotDto | null;
  @ApiPropertyOptional({ type: [LifecycleEventDto] }) lifecycle: LifecycleEventDto[];
  @ApiPropertyOptional({ type: [CreditSnapshotDto] }) credits: CreditSnapshotDto[];
  @ApiPropertyOptional({ type: [EvidenceRefDto] }) evidence: EvidenceRefDto[];
  @ApiPropertyOptional({ type: [VerificationReportRefDto] }) verificationReports: VerificationReportRefDto[];
  @ApiPropertyOptional({ type: [IndexedRetirementDto] }) retirements: IndexedRetirementDto[];
}

/** Indexer health / status — public view. */
export class IndexerStatusDto {
  @ApiProperty() enabled: boolean;
  @ApiProperty() running: boolean;
  @ApiProperty() cluster: string;
  @ApiProperty() programId: string;
  @ApiProperty() lastSlot: string;
  @ApiPropertyOptional({ nullable: true }) lastSignature: string | null;
  @ApiProperty() eventsIndexed: string;
  @ApiProperty() txsProcessed: string;
  @ApiPropertyOptional({ nullable: true }) lastPolledAt: string | null;
  @ApiPropertyOptional({ nullable: true }) lastBackfillAt: string | null;
  @ApiProperty() isBackfilling: boolean;
  @ApiProperty() creditCount: number;
  @ApiProperty() projectCount: number;
}

/** Query accepted by POST /explorer/search — a unified find-by-id/credit/project. */
export class ExplorerSearchDto {
  @ApiProperty({
    description:
      'A Credit ID (on-chain mint / token address) or a Project ID (VerdiCred project uuid). The explorer resolves which one automatically.',
    maxLength: 120,
    example: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wOGZcV9m2X1Y',
  })
  @IsString()
  @MaxLength(120)
  query: string;
}

/** POST /explorer/search — unified result wrapper. */
export class ExplorerSearchResultDto {
  @ApiProperty({ enum: ['CREDIT', 'PROJECT', 'NONE'] })
  kind: 'CREDIT' | 'PROJECT' | 'NONE';
  @ApiProperty() query: string;
  @ApiPropertyOptional({ nullable: true }) credit: CreditExplorerResultDto | null;
  @ApiPropertyOptional({ nullable: true }) project: ProjectExplorerResultDto | null;
}
