import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ExplorerService } from './explorer.service';
import {
  CreditExplorerResultDto,
  CreditSnapshotDto,
  ExplorerPageDto,
  ExplorerPageQueryDto,
  ExplorerSearchDto,
  ExplorerSearchResultDto,
  IndexedEventDto,
  IndexedRetirementDto,
  IndexerStatusDto,
  OwnershipTransferDto,
  ProjectExplorerResultDto,
  ProjectSnapshotDto,
  ExplorerTransactionDto,
} from './dto/explorer.dto';

/**
 * Public Transparency Explorer (Stage 7).
 *
 * Every route is `@Public()` — no Supabase JWT is required, so anyone can
 * transparently verify the full lifecycle of a carbon credit or project:
 * registration → evidence → AI verification → on-chain issuance → transfers →
 * retirement. All data is sourced from the chain-indexed tables maintained by
 * the Solana indexer plus the off-chain Stage 1–6 records.
 *
 * Responses are cached with `Cache-Control: public` so the explorer scales and
 * is resilient to chain RPC rate limits.
 */
@ApiTags('Public Transparency Explorer (Stage 7)')
@Controller('explorer')
export class ExplorerController {
  constructor(private readonly explorer: ExplorerService) {}

  private cacheHeaders() {
    return { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=30' };
  }

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Explorer + indexer health/status (public)' })
  @ApiResponse({ status: 200, type: IndexerStatusDto })
  async status(): Promise<IndexerStatusDto> {
    const s = await this.explorer.getStatus();
    return {
      enabled: s.enabled,
      running: s.running,
      cluster: s.cluster,
      programId: s.programId,
      lastSlot: s.lastSlot,
      lastSignature: s.lastSignature,
      eventsIndexed: s.eventsIndexed,
      txsProcessed: s.txsProcessed,
      lastPolledAt: s.lastPolledAt,
      lastBackfillAt: s.lastBackfillAt,
      isBackfilling: s.isBackfilling,
      creditCount: s.creditCount,
      projectCount: s.projectCount,
    };
  }

  @Public()
  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unified search by Credit ID (mint) or Project ID',
    description:
      'Accepts a base58 credit mint or a VerdiCred project uuid and returns the ' +
      'full aggregated explorer view for whichever it resolves to.',
  })
  @ApiResponse({ status: 200, type: ExplorerSearchResultDto })
  async search(@Body() dto: ExplorerSearchDto): Promise<ExplorerSearchResultDto> {
    return this.explorer.search(dto.query);
  }

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Unified search by `q` query param (public)' })
  @ApiQuery({ name: 'q', description: 'Credit ID (mint) or Project ID', required: true })
  @ApiResponse({ status: 200, type: ExplorerSearchResultDto })
  async searchQuery(@Query('q') q: string): Promise<ExplorerSearchResultDto> {
    return this.explorer.search(q ?? '');
  }

  @Public()
  @Get('credits')
  @ApiOperation({ summary: 'List all indexed credits (paged, searchable, sortable)' })
  @ApiResponse({ status: 200, type: ExplorerPageDto<CreditSnapshotDto> })
  async listCredits(@Query() query: ExplorerPageQueryDto): Promise<ExplorerPageDto<CreditSnapshotDto>> {
    return this.explorer.listCredits(query);
  }

  @Public()
  @Get('credits/:creditId')
  @ApiOperation({
    summary: 'Full credit lifecycle explorer result (public)',
    description:
      'Returns the credit snapshot, on-chain events, ownership history, transaction ' +
      'history, retirements, and the Stage 1–6 evidence + verification reports.',
  })
  @ApiParam({ name: 'creditId', description: 'On-chain token mint (base58)' })
  @ApiResponse({ status: 200, type: CreditExplorerResultDto })
  async getCredit(@Param('creditId') creditId: string): Promise<CreditExplorerResultDto> {
    return this.explorer.getCredit(creditId);
  }

  @Public()
  @Get('projects')
  @ApiOperation({ summary: 'List all indexed projects (paged, searchable, sortable)' })
  @ApiResponse({ status: 200, type: ExplorerPageDto<ProjectSnapshotDto> })
  async listProjects(@Query() query: ExplorerPageQueryDto): Promise<ExplorerPageDto<ProjectSnapshotDto>> {
    return this.explorer.listProjects(query);
  }

  @Public()
  @Get('projects/:projectId')
  @ApiOperation({
    summary: 'Full project lifecycle explorer result (public)',
    description:
      'Returns the project snapshot, credits, evidence, verification reports and ' +
      'retirements for the project.',
  })
  @ApiParam({ name: 'projectId', description: 'VerdiCred project uuid' })
  @ApiResponse({ status: 200, type: ProjectExplorerResultDto })
  async getProject(@Param('projectId') projectId: string): Promise<ProjectExplorerResultDto> {
    return this.explorer.getProject(projectId);
  }

  @Public()
  @Get('credits/:creditId/events')
  @ApiOperation({ summary: 'On-chain events for a credit (paged)' })
  @ApiParam({ name: 'creditId', description: 'On-chain token mint (base58)' })
  @ApiResponse({ status: 200, type: ExplorerPageDto<IndexedEventDto> })
  async creditEvents(
    @Param('creditId') creditId: string,
    @Query() query: ExplorerPageQueryDto,
  ): Promise<ExplorerPageDto<IndexedEventDto>> {
    return this.explorer.listEvents(creditId, query);
  }

  @Public()
  @Get('credits/:creditId/ownership')
  @ApiOperation({ summary: 'Ownership transfer history for a credit (paged)' })
  @ApiParam({ name: 'creditId', description: 'On-chain token mint (base58)' })
  @ApiResponse({ status: 200, type: ExplorerPageDto<OwnershipTransferDto> })
  async creditOwnership(
    @Param('creditId') creditId: string,
    @Query() query: ExplorerPageQueryDto,
  ): Promise<ExplorerPageDto<OwnershipTransferDto>> {
    return this.explorer.listTransfers(creditId, query);
  }

  @Public()
  @Get('credits/:creditId/transactions')
  @ApiOperation({ summary: 'Blockchain transaction history for a credit (paged)' })
  @ApiParam({ name: 'creditId', description: 'On-chain token mint (base58)' })
  @ApiResponse({ status: 200, type: ExplorerPageDto<ExplorerTransactionDto> })
  async creditTransactions(
    @Param('creditId') creditId: string,
    @Query() query: ExplorerPageQueryDto,
  ): Promise<ExplorerPageDto<ExplorerTransactionDto>> {
    return this.explorer.listTransactions(creditId, query);
  }

  @Public()
  @Get('credits/:creditId/retirements')
  @ApiOperation({ summary: 'Retirements for a credit (paged)' })
  @ApiParam({ name: 'creditId', description: 'On-chain token mint (base58)' })
  @ApiResponse({ status: 200, type: ExplorerPageDto<IndexedRetirementDto> })
  async creditRetirements(
    @Param('creditId') creditId: string,
    @Query() query: ExplorerPageQueryDto,
  ): Promise<ExplorerPageDto<IndexedRetirementDto>> {
    return this.explorer.listRetirements(creditId, query);
  }

  @Public()
  @Get('events')
  @ApiOperation({ summary: 'All indexed on-chain events (paged, searchable)' })
  @ApiResponse({ status: 200, type: ExplorerPageDto<IndexedEventDto> })
  async allEvents(@Query() query: ExplorerPageQueryDto): Promise<ExplorerPageDto<IndexedEventDto>> {
    return this.explorer.listEvents(undefined, query);
  }

  @Public()
  @Get('transactions')
  @ApiOperation({ summary: 'All indexed on-chain transactions (paged, searchable)' })
  @ApiResponse({ status: 200, type: ExplorerPageDto<ExplorerTransactionDto> })
  async allTransactions(@Query() query: ExplorerPageQueryDto): Promise<ExplorerPageDto<ExplorerTransactionDto>> {
    return this.explorer.listTransactions(undefined, query);
  }

  @Public()
  @Get('retirements')
  @ApiOperation({ summary: 'All indexed retirements (paged, searchable)' })
  @ApiResponse({ status: 200, type: ExplorerPageDto<IndexedRetirementDto> })
  async allRetirements(@Query() query: ExplorerPageQueryDto): Promise<ExplorerPageDto<IndexedRetirementDto>> {
    return this.explorer.listRetirements(undefined, query);
  }

  @Public()
  @Post('resync')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Trigger a full re-index / resynchronization (public, idempotent)',
    description:
      'Re-runs the historical backfill and rebuilds all denormalized snapshots. ' +
      'Safe to call repeatedly; every write is idempotent (keyed on unique constraints).',
  })
  @ApiResponse({ status: 202, description: 'Resync accepted.' })
  async resync(): Promise<{ eventsIndexed: string; txsProcessed: string }> {
    return this.explorer.resync();
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Rebuild all denormalized snapshots from indexed events (public)' })
  @ApiResponse({ status: 202, description: 'Refresh accepted.' })
  async refresh(): Promise<{ projects: number; credits: number }> {
    return this.explorer.refresh();
  }
}
