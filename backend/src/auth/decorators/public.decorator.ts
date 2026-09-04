import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route as PUBLIC — the global SupabaseAuthGuard will skip JWT
 * verification for it. Used by the Stage 7 Public Transparency Explorer, which
 * must be reachable by anyone (no Supabase account required) so the lifecycle
 * of carbon credits can be transparently verified.
 *
 * Usage:
 *   @Public()
 *   @Get('credits/:id')
 *   findOne() { ... }
 */
export const IS_PUBLIC_KEY = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
