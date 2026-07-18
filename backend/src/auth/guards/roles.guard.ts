import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '@prisma/client';

/**
 * Enforces role-based access control for routes decorated with `@Roles(...)`.
 * Requires the request to already carry an authenticated user (via
 * {@link SupabaseAuthGuard}), which populates `request.user.role`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() decorator → open to any authenticated user.
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      throw new UnauthorizedException('User role is missing.');
    }

    const hasRole = requiredRoles.some((role) => user.role === role);
    if (!hasRole) {
      throw new UnauthorizedException(
        `Access denied. Required role(s): ${requiredRoles.join(', ')}.`,
      );
    }

    return true;
  }
}
