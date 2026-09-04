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

  /**
   * Links a Phantom wallet to the authenticated user by verifying a signed message.
   */
  async linkWallet(
    supabaseId: string,
    dto: { walletAddress: string; signature: string; message: string },
  ) {
    const user = await this.usersService.findBySupabaseId(supabaseId);
    if (!user) {
      throw new Error('User profile not found. Call /auth/profile first.');
    }
    return this.usersService.linkWallet(user.id, dto.walletAddress, dto.signature, dto.message);
  }
}
