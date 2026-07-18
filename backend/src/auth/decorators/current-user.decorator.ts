import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extracts the authenticated VerdiCred user from the request.
 * Must be used together with {@link SupabaseAuthGuard}.
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
