import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { GeoValidationService } from './geo-validation.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import {
  Project,
  ProjectStatus,
  Role,
} from '@prisma/client';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly geoValidation: GeoValidationService,
  ) {}

  /**
   * Creates a project for the authenticated user. Runs the (mock) geo
   * overlap pre-screen first to support future anti-double-counting.
   */
  async create(dto: CreateProjectDto, supabaseId: string): Promise<Project> {
    const owner = await this.usersService.findBySupabaseId(supabaseId);
    if (!owner) {
      throw new ForbiddenException(
        'No VerdiCred profile found. Call POST /api/auth/profile first.',
      );
    }

    // Anti-double-counting pre-screen (mock for Stage 1).
    const geoCheck = await this.geoValidation.validate(dto.geoPolygon);
    if (geoCheck.overlapDetected) {
      throw new ForbiddenException(
        'The submitted polygon overlaps an existing project boundary.',
      );
    }

    return this.prisma.project.create({
      data: {
        ownerId: owner.id,
        projectName: dto.projectName,
        projectType: dto.projectType,
        methodology: dto.methodology,
        expectedAnnualTonnes: dto.expectedAnnualTonnes,
        geoPolygon: dto.geoPolygon,
        status: ProjectStatus.PENDING_VERIFICATION,
      },
    });
  }

  async findAll(): Promise<Project[]> {
    return this.prisma.project.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string): Promise<Project> {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundException(`Project "${id}" not found.`);
    }
    return project;
  }

  /**
   * Updates a project. DEVELOPER owners may edit their own projects;
   * AUDITOR/ADMIN may edit any (e.g. to change status). Enforced here so the
   * rule lives in one place regardless of which guard the route declares.
   */
  async update(
    id: string,
    dto: UpdateProjectDto,
    supabaseId: string,
  ): Promise<Project> {
    const existing = await this.findOne(id);
    const user = await this.usersService.findBySupabaseId(supabaseId);
    if (!user) {
      throw new ForbiddenException('No VerdiCred profile found.');
    }

    const isOwner = existing.ownerId === user.id;
    const canEditAny = user.role === Role.ADMIN || user.role === Role.AUDITOR;

    // Non-owners may only change status (auditors/admin).
    if (!isOwner && !canEditAny) {
      throw new ForbiddenException('You can only edit your own projects.');
    }
    if (!isOwner && canEditAny && Object.keys(dto).some((k) => k !== 'status')) {
      throw new ForbiddenException(
        'Auditors/Admins may only update a project status.',
      );
    }

    return this.prisma.project.update({
      where: { id },
      data: { ...dto },
    });
  }
}
