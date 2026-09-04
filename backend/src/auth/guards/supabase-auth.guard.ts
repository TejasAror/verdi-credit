import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SupabaseService } from '../../supabase/supabase.service';
import { UsersService } from '../../users/users.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Validates the Supabase JWT sent in the `Authorization: Bearer <token>`
 * header, resolves the VerdiCred application profile (including role + DB id),
 * and attaches it to `request.user`.
 *
 * The guard uses Supabase's `getUser(token)` which verifies the JWT signature
 * and expiry against the project's JWT secret — no local secret is needed.
 * The associated VerdiCred profile is created on first sight (default role
 * BUYER) so that role-based access control always has a resolved role.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly usersService: UsersService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Public routes (e.g. the Stage 7 explorer) skip authentication entirely.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header.');
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException(
        'Malformed Authorization header. Expected "Bearer <token>".',
      );
    }

    const { data, error } = await this.supabaseService.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    const profile = await this.usersService.ensureUser({
      supabaseId: data.user.id,
      email: data.user.email,
    });

    request.user = {
      supabaseId: profile.supabaseId,
      email: profile.email,
      id: profile.id,
      role: profile.role,
    };

    return true;
  }
}
