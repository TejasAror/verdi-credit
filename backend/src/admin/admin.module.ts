import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { UsersService } from '../users/users.service';

@Module({
  imports: [AuditLogModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
