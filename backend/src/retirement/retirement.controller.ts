import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  Body,
  ForbiddenException,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RetirementService, RetirementActor } from './retirement.service';
import {
  RetireCreditsDto,
  RetirementHistoryQueryDto,
  RetirementResponseDto,
  RetirementHistoryResponseDto,
} from './dto/retirement.dto';

@ApiTags('Credit Retirement (Stage 6)')
@Controller('retirements')
export class RetirementController {
  constructor(private readonly retirement: RetirementService) {}

  @Get('holdings')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: "List the caller's owned credit holdings available to retire",
    description:
      'Returns all holdings with a positive available balance so the Retire Credits page can offer a picker with balance, project, vintage, methodology, and token details.',
  })
  @ApiResponse({ status: 200, description: 'Owned holdings.' })
  myHoldings(@CurrentUser() actor: RetirementActor) {
    if (!actor?.id) throw new ForbiddenException('Authentication required.');
    return this.retirement.myHoldings(actor);
  }

  @Post('prepare')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Prepare an owner-signed retirement (burn) transaction',
    description:
      'Validates ownership + available balance and returns a base64-encoded `retireCredit` transaction for the connected owner wallet to sign with Phantom. Submit the returned signature via POST /retirements (client-signed settlement).',
  })
  @ApiResponse({ status: 201, description: 'Ready-to-sign transaction.' })
  @ApiResponse({ status: 400, description: 'Invalid input / insufficient balance.' })
  @ApiResponse({ status: 403, description: 'Not the holding owner.' })
  @ApiResponse({ status: 404, description: 'Holding not found.' })
  prepare(
    @Body() dto: RetireCreditsDto,
    @CurrentUser() actor: RetirementActor,
  ) {
    if (!actor?.id) throw new ForbiddenException('Authentication required.');
    return this.retirement.prepare(dto, actor);
  }

  @Post()
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Retire (burn/lock) owned carbon credits',
    description:
      'Validates ownership + available balance, invokes the Solana retirement instruction, persists an immutable Retirement record, generates + pins a PDF Retirement Certificate to IPFS (storing only the CID), decrements the holding balance, and reconciles marketplace listings.',
  })
  @ApiResponse({ status: 201, type: RetirementResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input / insufficient balance.' })
  @ApiResponse({ status: 403, description: 'Not the holding owner.' })
  @ApiResponse({ status: 404, description: 'Holding not found.' })
  retire(
    @Body() dto: RetireCreditsDto,
    @CurrentUser() actor: RetirementActor,
  ): Promise<RetirementResponseDto> {
    if (!actor?.id) throw new ForbiddenException('Authentication required.');
    return this.retirement.retire(dto, actor);
  }

  @Get()
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List retirement history (paged, searchable, filterable)',
    description:
      'ADMIN sees all retirements; other roles see only their own. Supports pagination, free-text search, and filters by reason category, status, and project.',
  })
  @ApiResponse({ status: 200, type: RetirementHistoryResponseDto })
  history(
    @Query() query: RetirementHistoryQueryDto,
    @CurrentUser() actor: RetirementActor,
  ): Promise<RetirementHistoryResponseDto> {
    if (!actor?.id) throw new ForbiddenException('Authentication required.');
    return this.retirement.history(actor, query);
  }

  @Get(':id')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Fetch a single retirement by id',
    description: 'Returns full retirement details. Users may only view their own; ADMIN may view any.',
  })
  @ApiParam({ name: 'id', description: 'Retirement id (uuid)' })
  @ApiResponse({ status: 200, type: RetirementResponseDto })
  @ApiResponse({ status: 403, description: 'Not your retirement.' })
  @ApiResponse({ status: 404, description: 'Retirement not found.' })
  getById(
    @Param('id') id: string,
    @CurrentUser() actor: RetirementActor,
  ): Promise<RetirementResponseDto> {
    if (!actor?.id) throw new ForbiddenException('Authentication required.');
    return this.retirement.getById(id, actor);
  }

  @Get(':id/certificate')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Download the PDF Retirement Certificate (inline)',
    description:
      'Regenerates the certificate PDF from the immutable retirement record and streams it. Users may only view their own certificates; ADMIN may view any.',
  })
  @ApiParam({ name: 'id', description: 'Retirement id (uuid)' })
  @ApiResponse({ status: 200, description: 'application/pdf stream.' })
  @ApiResponse({ status: 404, description: 'Certificate not generated yet.' })
  async downloadCertificate(
    @Param('id') id: string,
    @CurrentUser() actor: RetirementActor,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (!actor?.id) throw new ForbiddenException('Authentication required.');
    const { buffer, certificateId } = await this.retirement.getCertificatePdf(id, actor);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="retirement-certificate-${certificateId}.pdf"`,
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(buffer);
  }
}
