import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, User } from '@prisma/client';

export interface SupabaseUserClaim {
  supabaseId: string;
  email?: string | null;
}

/**
 * Application-side user store. The canonical identity lives in Supabase Auth;
 * this service maps it to a VerdiCred `User` row (profile + role).
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findBySupabaseId(supabaseId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { supabaseId } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Returns the VerdiCred user for the given Supabase identity, creating a new
   * profile on first sight. New profiles default to the BUYER role; the first
   * user in the system (or an Admin-invited email) can be promoted via the
   * Admin endpoints / Supabase SQL.
   */
  async ensureUser(claim: SupabaseUserClaim): Promise<User> {
    const existing = await this.findBySupabaseId(claim.supabaseId);
    if (existing) {
      return existing;
    }

    return this.prisma.user.create({
      data: {
        supabaseId: claim.supabaseId,
        email: claim.email ?? '',
        role: Role.BUYER,
      },
    });
  }

  async updateRole(userId: string, role: Role): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data: { role } });
  }
}
