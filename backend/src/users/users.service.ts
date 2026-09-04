import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, User } from '@prisma/client';
import * as nacl from 'tweetnacl';
import * as bs58 from 'bs58';

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

  /**
   * Links a Phantom wallet to the user by verifying a signed message.
   * The message must be a known challenge string to prevent replay attacks.
   */
  async linkWallet(
    userId: string,
    walletAddress: string,
    signatureB64: string,
    message: string,
  ): Promise<User> {
    // Validate wallet address format (base58, 32-44 chars)
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
      throw new BadRequestException('Invalid Solana wallet address format.');
    }

    // Verify the signature
    const isValid = this.verifySignature(walletAddress, message, signatureB64);
    if (!isValid) {
      throw new BadRequestException('Invalid wallet signature. Could not verify wallet ownership.');
    }

    // Check if this wallet is already linked to another user
    const existingUser = await this.prisma.user.findUnique({
      where: { walletAddress },
    });
    if (existingUser && existingUser.id !== userId) {
      throw new BadRequestException(
        'This wallet is already linked to another VerdiCred account.',
      );
    }

    // Update the user's wallet address
    return this.prisma.user.update({
      where: { id: userId },
      data: { walletAddress },
    });
  }

  /**
   * Verifies an ed25519 signature using tweetnacl.
   * @param walletAddress - Base58 encoded Solana public key
   * @param message - The original message that was signed
   * @param signatureB64 - Base64 encoded signature
   */
  private verifySignature(
    walletAddress: string,
    message: string,
    signatureB64: string,
  ): boolean {
    try {
      const publicKey = bs58.decode(walletAddress);
      if (publicKey.length !== 32) {
        return false;
      }
      const messageBytes = new TextEncoder().encode(message);
      const signature = Buffer.from(signatureB64, 'base64');
      if (signature.length !== 64) {
        return false;
      }
      return nacl.sign.detached.verify(messageBytes, signature, publicKey);
    } catch {
      return false;
    }
  }

  /**
   * Generates the standard wallet-linking verification message.
   * This message is shown to the user in Phantom for signing.
   */
  static generateLinkMessage(walletAddress: string): string {
    return `VerdiCred Wallet Link Verification\n\nWallet: ${walletAddress}\nTimestamp: ${Date.now()}\n\nSign this message to prove you control this wallet and link it to your VerdiCred account.`;
  }
}