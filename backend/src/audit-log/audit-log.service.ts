import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogAction, Role } from '@prisma/client';

export interface AuditLogEntry {
  id: string;
  actorId: string;
  targetId: string;
  action: AuditLogAction;
  previousRole: Role | null;
  newRole: Role | null;
  evidenceId: string | null;
  reason: string | null;
  createdAt: Date;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends an immutable audit entry for a role change. Never updated or
   * deleted — this is the compliance record.
   */
  async recordRoleChange(params: {
    actorId: string;
    targetId: string;
    previousRole: Role;
    newRole: Role;
    reason?: string;
  }): Promise<AuditLogEntry> {
    const action: AuditLogAction =
      params.previousRole === params.newRole
        ? AuditLogAction.ROLE_CHANGED
        : // Lexicographic promotion heuristic: ADMIN > AUDITOR > DEVELOPER > BUYER
          RANK[params.newRole] > RANK[params.previousRole]
          ? AuditLogAction.ROLE_PROMOTED
          : AuditLogAction.ROLE_DEMOTED;

    return this.prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        targetId: params.targetId,
        action,
        previousRole: params.previousRole,
        newRole: params.newRole,
        reason: params.reason,
      },
    });
  }

  /** Returns audit entries, newest first, optionally filtered by target. */
  async list(targetId?: string, limit = 100): Promise<AuditLogEntry[]> {
    return this.prisma.auditLog.findMany({
      where: targetId ? { targetId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Records a generic audit event with no evidence linkage (e.g. a credit
   * retirement). `evidenceId` is left null so the audit row does not have to
   * reference an Evidence record. Used by Stage 6 retirement logging.
   */
  async recordAction(params: {
    actorId: string;
    targetId: string;
    action: AuditLogAction;
    reason?: string;
  }): Promise<AuditLogEntry> {
    return this.prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        targetId: params.targetId,
        action: params.action,
        reason: params.reason,
        evidenceId: null,
      },
    });
  }

  /**
   * Records an evidence-related audit event (upload / delete / view).
   * Role fields are left null for these actions.
   */
  async recordEvidenceAction(params: {
    actorId: string;
    targetId: string;
    action: AuditLogAction;
    evidenceId: string;
    reason?: string;
  }): Promise<AuditLogEntry> {
    return this.prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        targetId: params.targetId,
        action: params.action,
        evidenceId: params.evidenceId,
        reason: params.reason,
      },
    });
  }
}

// Higher number = higher privilege. Used only to label promote/demote.
const RANK: Record<Role, number> = {
  BUYER: 0,
  DEVELOPER: 1,
  AUDITOR: 2,
  ADMIN: 3,
};
