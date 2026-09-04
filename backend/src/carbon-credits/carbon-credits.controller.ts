import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { CarbonCreditsService } from './carbon-credits.service';
import {
  EligibleResponseDto,
  IssueCreditDto,
  IssueCreditResponseDto,
  TransferCreditDto,
  RetireCreditDto,
  PreparedTxDto,
} from './dto/carbon-credits.dto';

@ApiTags('Carbon Credits (Stage 4)')
@Controller('carbon-credits')
export class CarbonCreditsController {
  constructor(private readonly carbonCredits: CarbonCreditsService) {}

  @Get('eligible/:projectId')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Check whether a project is eligible for 1:1 credit issuance (any authenticated user)',
    description:
      'Reads the latest Stage 3 VerificationReport and reports whether it is VERIFIED ' +
      'plus the amount that would be minted (floor of verifiedTonnes).',
  })
  @ApiParam({ name: 'projectId', description: 'Project id (uuid)' })
  @ApiResponse({ status: 200, type: EligibleResponseDto })
  @ApiResponse({ status: 404, description: 'No verification report found.' })
  eligible(@Param('projectId') projectId: string) {
    return this.carbonCredits.eligible(projectId);
  }

  @Post('issue')
  @Roles(Role.AUDITOR, Role.ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Issue carbon credits at 1:1 with a VERIFIED Stage 3 report (Auditor/Admin)',
    description:
      'Automated bridge: latest VERIFIED report -> floor(verifiedTonnes) credits -> ' +
      'oracle-signed mintCredit tx submitted to Solana, returning the tx signature + batch PDA.',
  })
  @ApiResponse({ status: 201, type: IssueCreditResponseDto })
  @ApiResponse({ status: 400, description: 'Report not VERIFIED or invalid input.' })
  @ApiResponse({ status: 401, description: 'Missing/invalid token or role.' })
  @ApiResponse({ status: 403, description: 'Only AUDITOR/ADMIN may issue.' })
  issue(@Body() dto: IssueCreditDto, @CurrentUser() actor: { id: string; role: Role }) {
    if (!actor?.id || !actor?.role) {
      throw new ForbiddenException('Authentication required.');
    }
    return this.carbonCredits.issue(dto, actor);
  }

  @Post('transfer')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Build an owner-signed transfer transaction (client wallet signs + submits)',
  })
  @ApiResponse({ status: 201, type: PreparedTxDto })
  @ApiResponse({ status: 400, description: 'Invalid input.' })
  transfer(@Body() dto: TransferCreditDto): Promise<PreparedTxDto> {
    return this.carbonCredits.transfer(dto.mint, dto.from, dto.to, dto.amount);
  }

  @Post('retire')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Build an owner-signed retire (burn) transaction (client wallet signs + submits)',
  })
  @ApiResponse({ status: 201, type: PreparedTxDto })
  @ApiResponse({ status: 400, description: 'Invalid input.' })
  retire(@Body() dto: RetireCreditDto): Promise<PreparedTxDto> {
    return this.carbonCredits.retire(
      dto.mint,
      dto.owner,
      dto.amount,
      dto.reason,
      dto.reportRef ?? '',
    );
  }

  @Get('config')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Resolve the configured on-chain deployment (program id + credit mint) for the audit UI',
  })
  config() {
    return this.carbonCredits.getConfig();
  }

  @Get(':mint/batches')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List all CreditBatch PDAs for a mint (on-chain audit view)',
  })
  @ApiParam({ name: 'mint', description: 'Credit mint address (base58)' })
  getBatches(@Param('mint') mint: string) {
    return this.carbonCredits.getBatches(mint);
  }

  @Get(':mint/retirements')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List all RetirementRecord PDAs for a mint (retirement ledger)',
  })
  @ApiParam({ name: 'mint', description: 'Credit mint address (base58)' })
  getRetirements(@Param('mint') mint: string) {
    return this.carbonCredits.getRetirements(mint);
  }

  @Get(':mint/project/:projectId/batches')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List the CreditBatch PDAs for a specific project on a mint (project-scoped audit)',
  })
  @ApiParam({ name: 'mint', description: 'Credit mint address (base58)' })
  @ApiParam({ name: 'projectId', description: 'Project id (uuid)' })
  getProjectBatches(@Param('mint') mint: string, @Param('projectId') projectId: string) {
    return this.carbonCredits.getBatchesForProject(mint, projectId);
  }

  @Get(':mint/project/:projectId/retirements')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List the RetirementRecords for a specific project on a mint (project-scoped audit)',
  })
  @ApiParam({ name: 'mint', description: 'Credit mint address (base58)' })
  @ApiParam({ name: 'projectId', description: 'Project id (uuid)' })
  getProjectRetirements(@Param('mint') mint: string, @Param('projectId') projectId: string) {
    return this.carbonCredits.getRetirementsForProject(mint, projectId);
  }
}
