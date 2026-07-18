import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiParam, ApiResponse } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { EvidenceService } from '../evidence/evidence.service';
import { EvidenceResponseDto } from '../evidence/dto/evidence-response.dto';

@ApiTags('Projects')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly evidenceService: EvidenceService,
  ) {}

  @Post()
  @Roles(Role.DEVELOPER, Role.ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Register a new carbon project (Developer/Admin)',
    description:
      'geoPolygon, methodology and expectedAnnualTonnes are mandatory. ' +
      'Runs a geo overlap pre-screen and sets status=PENDING_VERIFICATION.',
  })
  create(
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: { supabaseId: string },
  ) {
    return this.projectsService.create(dto, user.supabaseId);
  }

  @Get()
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({ summary: 'List all registered projects (any authenticated user)' })
  findAll() {
    return this.projectsService.findAll();
  }

  @Get(':id')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({ summary: 'Get a single project by id' })
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Get(':id/evidence')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List all evidence for a project (any authenticated user)',
    description:
      'Read access for every authenticated role (Auditors/Buyers read-only). ' +
      'Returns the project’s evidence records, newest first.',
  })
  @ApiParam({ name: 'id', description: 'Project id (uuid)' })
  @ApiResponse({ status: 200, type: EvidenceResponseDto, isArray: true })
  @ApiResponse({ status: 404, description: 'Project not found.' })
  listEvidence(
    @Param('id') id: string,
    @CurrentUser() actor: { role: Role },
  ) {
    return this.evidenceService.listByProject(id, actor.role);
  }

  @Patch(':id')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Update a project',
    description:
      'Owners (DEVELOPER) may edit their own project. AUDITOR/ADMIN may change status.',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: { supabaseId: string },
  ) {
    if (!user?.supabaseId) {
      throw new ForbiddenException('Authentication required.');
    }
    return this.projectsService.update(id, dto, user.supabaseId);
  }
}
