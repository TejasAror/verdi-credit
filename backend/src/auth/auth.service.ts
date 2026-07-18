import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { SupabaseUserClaim } from '../users/users.service';

export interface AuthenticatedContext {
  supabaseId: string;
  email?: string | null;
}

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Provisions (or returns) the VerdiCred application profile for the
   * authenticated Supabase user and returns the resolved role + DB id.
   */
  async provisionProfile(claim: SupabaseUserClaim) {
    const user = await this.usersService.ensureUser(claim);
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  async getProfile(claim: SupabaseUserClaim) {
    return this.usersService.findBySupabaseId(claim.supabaseId);
  }
}
