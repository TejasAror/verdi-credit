import { Body, Controller, Get, Param, Post, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { VerificationService } from './verification.service';
import { VerificationReportResponseDto, VerifyRequestDto } from './dto/verification-report-response.dto';

@ApiTags('Verification')
@Controller('verification')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post(':projectId/verify')
  @Roles(Role.DEVELOPER, Role.AUDITOR, Role.ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Run the full verification pipeline for a project (Developer/Auditor/Admin)',
    description:
      'Aggregates evidence → NDVI → carbon → anomaly detection → confidence → PDF → ' +
      'pins the report to IPFS, persists the CID, and returns the verification metadata. ' +
      'Creates a new VerificationReport each call (the latest is authoritative). Advances ' +
      'Project.status to VERIFIED / PENDING_VERIFICATION / REJECTED.',
  })
  @ApiParam({ name: 'projectId', description: 'Project id (uuid)' })
  @ApiResponse({ status: 201, type: VerificationReportResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input.' })
  @ApiResponse({ status: 401, description: 'Missing/invalid token or role.' })
  @ApiResponse({ status: 403, description: 'Not allowed to verify this project.' })
  @ApiResponse({ status: 404, description: 'Project not found.' })
  verify(
    @Param('projectId') projectId: string,
    @Body() body: VerifyRequestDto,
    @CurrentUser() actor: { id: string; role: Role },
  ) {
    if (!actor?.id || !actor?.role) {
      throw new UnauthorizedException('Authentication required.');
    }
    return this.verificationService.verify({
      projectId,
      actorId: actor.id,
      actorRole: actor.role,
      note: body.note,
    });
  }

  @Get('project/:projectId')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List all verification reports for a project (any authenticated user)',
  })
  @ApiParam({ name: 'projectId', description: 'Project id (uuid)' })
  @ApiResponse({ status: 200, type: VerificationReportResponseDto, isArray: true })
  @ApiResponse({ status: 404, description: 'Project not found.' })
  listByProject(@Param('projectId') projectId: string) {
    return this.verificationService.listByProject(projectId);
  }

  @Get('project/:projectId/latest')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Get the most recent verification report for a project (any authenticated user)',
  })
  @ApiParam({ name: 'projectId', description: 'Project id (uuid)' })
  @ApiResponse({ status: 200, type: VerificationReportResponseDto })
  @ApiResponse({ status: 404, description: 'No report found.' })
  latest(@Param('projectId') projectId: string) {
    return this.verificationService.latestForProject(projectId);
  }

  @Get('report/:id')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Get a single verification report by id (any authenticated user)',
    description: 'Returns the full report including structured anomalies — no re-run needed.',
  })
  @ApiParam({ name: 'id', description: 'Verification report id (uuid)' })
  @ApiResponse({ status: 200, type: VerificationReportResponseDto })
  @ApiResponse({ status: 404, description: 'Verification report not found.' })
  getById(@Param('id') id: string) {
    return this.verificationService.getById(id);
  }
}
