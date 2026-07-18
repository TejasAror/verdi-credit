import 'reflect-metadata';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';

// Helper: build an ExecutionContext whose handler carries @Roles() metadata.
const makeCtx = (user: any, roles?: Role[]) => {
  const target: Record<string, any> = { constructor: class {} };
  const handler: Record<string, any> = function handler() {};
  if (roles) {
    Reflect.defineMetadata(ROLES_KEY, roles, handler);
  }
  const request = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => target.constructor,
  } as any;
};

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  it('allows any authenticated user when no @Roles() is set', () => {
    expect(guard.canActivate(makeCtx({ role: Role.BUYER }))).toBe(true);
  });

  it('allows a user whose role matches the required roles', () => {
    const ctx = makeCtx({ role: Role.ADMIN }, [Role.DEVELOPER, Role.ADMIN]);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws UnauthorizedException when the role does not match', () => {
    const ctx = makeCtx({ role: Role.BUYER }, [Role.DEVELOPER, Role.ADMIN]);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('throws when there is no authenticated user', () => {
    const ctx = makeCtx(undefined, [Role.ADMIN]);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
