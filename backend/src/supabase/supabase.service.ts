import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoTrueClient } from '@supabase/auth-js';

/**
 * Thin auth client used by the backend to verify Supabase JWTs.
 *
 * Why GoTrueClient (auth-js) instead of the full supabase-js client:
 * supabase-js eagerly constructs a Realtime (WebSocket) client, which on
 * Node < 22 requires the `ws` package. The backend only verifies tokens via
 * `getUser(token)` (a pure REST call), so we depend on the auth engine
 * directly — no WebSocket, no extra dependency, identical behaviour.
 */
@Injectable()
export class SupabaseService {
  public readonly auth: GoTrueClient;

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('SUPABASE_URL');
    const anonKey = this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!url || !anonKey) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_ANON_KEY must be set in the environment.',
      );
    }

    this.auth = new GoTrueClient({
      url: `${url}/auth/v1`,
      headers: { apikey: anonKey },
      autoRefreshToken: false,
      persistSession: false,
    });
  }
}
