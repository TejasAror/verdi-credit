import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ChangeRoleDto } from './dto/change-role.dto';
import { Role, User } from '@prisma/client';

export interface RoleChangeResult {
  id: string;
  email: string | null;
  role: Role;
  previousRole: Role;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Lists all registered users (id, email, role, createdAt). */
  async listUsers(): Promise<User[]> {
    return this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  }

  /** Returns audit entries, newest first. */
  async listAuditLogs() {
    return this.auditLog.list();
  }

  /**
   * Changes a user's role. Only callable by an ADMIN (enforced by the route
   * guard). Additional safeguards:
   *  - Cannot change your own role (no self-promotion / self-demotion).
   *  - Cannot remove the last ADMIN (prevents locking everyone out).
   */
  async changeRole(
    targetId: string,
    dto: ChangeRoleDto,
    actorId: string,
  ): Promise<RoleChangeResult> {
    if (targetId === actorId) {
      throw new ForbiddenException('You cannot change your own role.');
    }

    const target = await this.usersService.findById(targetId);
    if (!target) {
      throw new NotFoundException(`User "${targetId}" not found.`);
    }

    // Prevent deleting the last admin.
    if (
      target.role === Role.ADMIN &&
      dto.role !== Role.ADMIN
    ) {
      const adminCount = await this.prisma.user.count({
        where: { role: Role.ADMIN },
      });
      if (adminCount <= 1) {
        throw new BadRequestException(
          'Cannot remove the last ADMIN role from the system.',
        );
      }
    }

    const previousRole = target.role;
    if (previousRole === dto.role) {
      // No-op still returns cleanly; we do not write an audit entry for a
      // non-change to avoid noise.
      return {
        id: target.id,
        email: target.email,
        role: target.role,
        previousRole,
      };
    }

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { role: dto.role },
    });

    await this.auditLog.recordRoleChange({
      actorId,
      targetId,
      previousRole,
      newRole: dto.role,
      reason: dto.reason,
    });

    return {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      previousRole,
    };
  }
}
