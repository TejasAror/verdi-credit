import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';
import { RolesGuard } from './guards/roles.guard';

/**
 * Global auth wiring. `SupabaseAuthGuard` runs first (validates the JWT and
 * populates `request.user`), then `RolesGuard` enforces `@Roles()` rules.
 * Controllers opt into RBAC per-route via the `@Roles(...)` decorator.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    UsersService,
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [UsersService, AuthService],
})
export class AuthModule {}
