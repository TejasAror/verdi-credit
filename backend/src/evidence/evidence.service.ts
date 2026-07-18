import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PinataService } from './pinata/pinata.service';
import { AdapterRegistryService } from './adapters/adapter-registry.service';
import {
  AdapterContext,
  RawEvidence,
} from './adapters/evidence-adapter.interface';
import { UploadEvidenceDto } from './dto/upload-evidence.dto';
import {
  ALLOWED_MIME_TYPES,
  LAT_MAX,
  LAT_MIN,
  LNG_MAX,
  LNG_MIN,
  MAX_FILE_SIZE_BYTES,
} from './dto/evidence.constants';
import {
  AuditLogAction,
  Evidence,
  EvidenceSource,
  EvidenceStatus,
  Role,
} from '@prisma/client';

export interface EvidenceUploadInput {
  dto: UploadEvidenceDto;
  projectId: string;
  actorId: string;
  actorRole: Role;
  supabaseId: string;
  file?: { buffer: Buffer; filename: string; mimeType: string };
}

@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly auditLog: AuditLogService,
    private readonly pinata: PinataService,
    private readonly adapters: AdapterRegistryService,
  ) {}

  /**
   * Uploads evidence for a project. Enforces:
   *  - project exists
   *  - actor may write (DEVELOPER owns project, or ADMIN)
   *  - GEO_UPLOAD requires a file of an allowed type/size + lat/lng
   * Then runs the adapter, pins the raw payload to IPFS, persists the CID, and
   * writes an audit entry.
   */
  async upload(input: EvidenceUploadInput): Promise<Evidence> {
    const { dto, projectId, actorId, actorRole, supabaseId, file } = input;

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException(`Project "${projectId}" not found.`);
    }

    // RBAC: DEVELOPER only on own projects; ADMIN anywhere; others blocked.
    const owner = await this.usersService.findBySupabaseId(supabaseId);
    if (!owner) {
      throw new ForbiddenException(
        'No VerdiCred profile found. Call POST /api/auth/profile first.',
      );
    }
    const isOwner = project.ownerId === owner.id;
    if (actorRole === Role.DEVELOPER && !isOwner) {
      throw new ForbiddenException(
        'You can only upload evidence to your own projects.',
      );
    }
    if (
      actorRole !== Role.DEVELOPER &&
      actorRole !== Role.ADMIN
    ) {
      throw new ForbiddenException(
        'Your role cannot upload evidence.',
      );
    }

    if (dto.source === EvidenceSource.GEO_UPLOAD) {
      if (!file) {
        throw new BadRequestException('GEO_UPLOAD requires a file.');
      }
      if (!ALLOWED_MIME_TYPES.includes(file.mimeType as any)) {
        throw new BadRequestException(
          `Unsupported file type "${file.mimeType}". Allowed: ${ALLOWED_MIME_TYPES.join(', ')}.`,
        );
      }
      if (file.buffer.length > MAX_FILE_SIZE_BYTES) {
        throw new BadRequestException(
          `File exceeds the ${MAX_FILE_SIZE_BYTES} byte limit.`,
        );
      }
      if (dto.latitude === undefined || dto.longitude === undefined) {
        throw new BadRequestException(
          'GEO_UPLOAD requires latitude and longitude.',
        );
      }
    }

    // latitude/longitude are already coerced to numbers by the DTO's
    // @Type(()=>Number) + @IsNumber() validation. Re-validate ranges here so
    // the invariant holds even if a controller bypasses the DTO (defense-in-depth).
    const lat = dto.latitude;
    const lng = dto.longitude;
    if (lat !== undefined && (lat < LAT_MIN || lat > LAT_MAX)) {
      throw new BadRequestException(
        `latitude must be between ${LAT_MIN} and ${LAT_MAX}.`,
      );
    }
    if (lng !== undefined && (lng < LNG_MIN || lng > LNG_MAX)) {
      throw new BadRequestException(
        `longitude must be between ${LNG_MIN} and ${LNG_MAX}.`,
      );
    }

    const ts = dto.timestamp ? new Date(dto.timestamp) : undefined;
    if (dto.timestamp && Number.isNaN(ts!.getTime())) {
      throw new BadRequestException('Invalid timestamp (expected ISO-8601).');
    }

    const context: AdapterContext = {
      projectId,
      latitude: lat,
      longitude: lng,
      timestamp: ts,
      file,
    };

    const adapter = this.adapters.get(dto.source);
    const raw: RawEvidence = await adapter.fetch(context);
    const normalized = await adapter.normalize(raw, context);

    // Pin the raw payload to IPFS.
    const pin = Buffer.isBuffer(raw.payload)
      ? await this.pinata.pinFile(
          raw.payload,
          raw.filename ?? `evidence-${projectId}`,
          raw.mimeType ?? 'application/octet-stream',
        )
      : await this.pinata.pinJson(raw.payload, raw.filename);

    const metadata: Record<string, unknown> = {
      ...(normalized.metadata ?? {}),
      ...(dto.note ? { note: dto.note } : {}),
      pinnedAt: new Date().toISOString(),
    };

    const evidence = await this.prisma.evidence.create({
      data: {
        projectId,
        source: dto.source,
        status: EvidenceStatus.PENDING,
        cid: pin.cid,
        ipfsUrl: pin.ipfsUrl,
        latitude: normalized.latitude ?? null,
        longitude: normalized.longitude ?? null,
        timestamp: normalized.timestamp ?? null,
        metadata: metadata as any,
      },
    });

    await this.auditLog.recordEvidenceAction({
      actorId,
      targetId: actorId,
      action: AuditLogAction.EVIDENCE_UPLOADED,
      evidenceId: evidence.id,
      reason: `source=${dto.source} cid=${pin.cid}`,
    });

    this.logger.log(
      `Evidence ${evidence.id} uploaded for project ${projectId} (source=${dto.source}, cid=${pin.cid})`,
    );
    return evidence;
  }

  /** Lists evidence for a project. Caller must be able to read it. */
  async listByProject(
    projectId: string,
    actorRole: Role,
  ): Promise<Evidence[]> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException(`Project "${projectId}" not found.`);
    }
    // READ: everyone authenticated can read (per spec: auditors/buyers read-only).
    if (
      actorRole !== Role.ADMIN &&
      actorRole !== Role.AUDITOR &&
      actorRole !== Role.BUYER &&
      actorRole !== Role.DEVELOPER
    ) {
      throw new ForbiddenException('Not authorized to view evidence.');
    }
    return this.prisma.evidence.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: string, actorId: string, actorRole: Role): Promise<Evidence> {
    const evidence = await this.prisma.evidence.findUnique({ where: { id } });
    if (!evidence) {
      throw new NotFoundException(`Evidence "${id}" not found.`);
    }
    // Audit an auditor's view of evidence (read for compliance oversight).
    if (actorRole === Role.AUDITOR) {
      await this.auditLog.recordEvidenceAction({
        actorId,
        targetId: actorId,
        action: AuditLogAction.EVIDENCE_VIEWED,
        evidenceId: id,
      });
    }
    return evidence;
  }

  /** Deletes evidence. ADMIN only. */
  async remove(id: string, actorId: string): Promise<{ id: string; deleted: boolean }> {
    const evidence = await this.prisma.evidence.findUnique({ where: { id } });
    if (!evidence) {
      throw new NotFoundException(`Evidence "${id}" not found.`);
    }
    await this.prisma.evidence.delete({ where: { id } });
    await this.auditLog.recordEvidenceAction({
      actorId,
      targetId: actorId,
      action: AuditLogAction.EVIDENCE_DELETED,
      evidenceId: id,
      reason: `cid=${evidence.cid}`,
    });
    return { id, deleted: true };
  }
}
