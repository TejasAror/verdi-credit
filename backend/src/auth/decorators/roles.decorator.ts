import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'verdicred:roles';

/**
 * Restricts a route to the given VerdiCred roles.
 * Used together with {@link RolesGuard}.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

import { Role } from '@prisma/client';
