import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { AdminService } from './admin.service';
import { ChangeRoleDto } from './dto/change-role.dto';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @Roles(Role.ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List all registered users and their current roles (Admin only)',
  })
  listUsers() {
    return this.adminService.listUsers();
  }

  @Patch('users/:id/role')
  @Roles(Role.ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Promote or demote a user role (Admin only)',
    description:
      'Changes the target user role and writes an immutable audit-log entry. ' +
      'Admins cannot change their own role, and the last ADMIN cannot be removed.',
  })
  changeRole(
    @Param('id') id: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() actor: { id: string },
  ) {
    if (!actor?.id) {
      throw new ForbiddenException('Authentication required.');
    }
    return this.adminService.changeRole(id, dto, actor.id);
  }

  @Get('audit-logs')
  @Roles(Role.ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List role-change audit entries, newest first (Admin only)',
  })
  auditLogs() {
    return this.adminService.listAuditLogs();
  }
}
