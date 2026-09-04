import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import * as bs58 from 'bs58';
import * as nacl from 'tweetnacl';
import { SellerKeyStatus, SellerMarketplaceKey } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SolanaIssuanceService } from '../carbon-credits/solana-issuance.service';
import { SolanaConfigService } from '../carbon-credits/solana-config.service';
import { decryptSecret, encryptSecret, parseMasterKey } from './seller-keys.crypto';

/** Public (safe) view of a provisioned seller settlement key. */
export interface SellerKeyResponse {
  id: string;
  walletAddress: string;
  /** Custody keypair public key (base58) — the on-chain settlement signer. */
  publicKey: string;
  /** Token-2022 ATA of the custody key where listed credits are deposited. */
  ata: string;
  /** base58 ATA address, redundant-safe */
  custodyAta: string;
  status: SellerKeyStatus;
  confirmed: boolean;
  createdAt: string;
}

/** Decrypted settlement material — only ever used inside the service layer. */
export interface ResolvedSellerKey {
  key: SellerMarketplaceKey;
  /** Custody keypair public key (base58) that owns the deposited credits. */
  publicKey: string;
  /** Plaintext Solana secret (JSON array string) — never logged / serialized. */
  secret: string;
}

/**
 * SellerKeyService — provision, confirm, store and resolve the marketplace
 * custody keys behind Design A (server-side settlement).
 *
 * Security posture:
 *  - The custody keypair is generated server-side; its SECRET is encrypted at
 *    rest (AES-256-GCM) and NEVER leaves this service layer in plaintext.
 *  - The seller confirms the key by signing a challenge with their linked
 *    wallet (proving they control the wallet the credits are minted to).
 *  - The public key / ATA are the only parts exposed to the frontend.
 */
@Injectable()
export class SellerKeyService {
  private readonly logger = new Logger(SellerKeyService.name);
  private readonly masterKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    private readonly solana: SolanaIssuanceService,
    private readonly solanaConfig: SolanaConfigService,
  ) {
    this.masterKey = parseMasterKey(config.get<string>('MARKETPLACE_SELLER_KEY_ENCRYPTION_KEY'));
  }

  // ---------------------------------------------------------------------------
  // Provision / confirm / revoke
  // ---------------------------------------------------------------------------

  /**
   * Provision a custody settlement keypair for the authenticated seller's
   * linked wallet. Creates the keypair, encrypts its secret, creates the
   * Token-2022 ATA (server-funded) and stores one ACTIVE row per wallet.
   */
  async provision(userId: string, walletAddress: string): Promise<SellerKeyResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.walletAddress !== walletAddress) {
      throw new ForbiddenException(
        'The wallet must be linked to your VerdiCred account before provisioning a settlement key.',
      );
    }

    const existing = await this.prisma.sellerMarketplaceKey.findUnique({
      where: { sellerUserId_walletAddress_status: { sellerUserId: userId, walletAddress, status: SellerKeyStatus.ACTIVE } },
    });
    if (existing) {
      return this.toResponse(existing, this.ataFor(existing.publicKey));
    }

    const keypair = Keypair.generate();
    const secretJson = JSON.stringify(Array.from(keypair.secretKey));
    const encrypted = encryptSecret(new TextEncoder().encode(secretJson), this.masterKey);
    // Create the custody Token-2022 ATA so the deposit target exists. Best-effort:
    // if it fails we still record the key and surface the error to the caller.
    const ata = await this.solana.ensureTokenAccount(
      this.solanaConfig.creditMint?.toBase58() ?? '',
      keypair.publicKey.toBase58(),
    );

    const row = await this.prisma.sellerMarketplaceKey.create({
      data: {
        sellerUserId: userId,
        walletAddress,
        publicKey: keypair.publicKey.toBase58(),
        encryptedSecret: encrypted,
        status: SellerKeyStatus.ACTIVE,
        confirmedAt: null,
      },
    });

    this.logger.log(
      `Provisioned marketplace settlement key ${row.id} for user ${userId} (wallet ${walletAddress}, custody ${row.publicKey} → ${ata}).`,
    );
    return this.toResponse(row, ata);
  }

  /** Confirm custody of the main wallet by verifying the seller's signature. */
  async confirm(userId: string, keyId: string, signatureB64: string, message: string): Promise<SellerKeyResponse> {
    const key = await this.getOwnedKey(userId, keyId);
    if (!this.verifySignature(key.walletAddress, message, signatureB64)) {
      throw new BadRequestException('Invalid wallet signature. Could not verify wallet ownership.');
    }
    const updated = await this.prisma.sellerMarketplaceKey.update({
      where: { id: keyId },
      data: { confirmedAt: new Date() },
    });
    return this.toResponse(updated, this.ataFor(updated.publicKey));
  }

  /** List the caller's settlement keys (public fields only). */
  async listForUser(userId: string): Promise<SellerKeyResponse[]> {
    const rows = await this.prisma.sellerMarketplaceKey.findMany({
      where: { sellerUserId: userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toResponse(r, this.ataFor(r.publicKey)));
  }

  /** Revoke a settlement key (status → REVOKED). Stops future settlements. */
  async revoke(userId: string, keyId: string): Promise<SellerKeyResponse> {
    const key = await this.getOwnedKey(userId, keyId);
    const updated = await this.prisma.sellerMarketplaceKey.update({
      where: { id: key.id },
      data: { status: SellerKeyStatus.REVOKED },
    });
    this.logger.log(`Revoked marketplace settlement key ${key.id} by user ${userId}.`);
    return this.toResponse(updated, this.ataFor(updated.publicKey));
  }

  // ---------------------------------------------------------------------------
  // Settlement resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolve the seller's ACTIVE, confirmed custody key and decrypt its secret.
   * Called by the buy flow to settle server-side without any client signing.
   */
  async resolveActiveSecret(walletAddress: string, sellerUserId?: string | null): Promise<ResolvedSellerKey> {
    const where = sellerUserId
      ? { sellerUserId, walletAddress, status: SellerKeyStatus.ACTIVE }
      : { walletAddress, status: SellerKeyStatus.ACTIVE };
    const key = await this.prisma.sellerMarketplaceKey.findFirst({ where });
    if (!key) {
      throw new BadRequestException(
        'The seller has not provisioned a settlement key for this listing. ' +
          'The seller must set up their sales wallet before this listing can be purchased.',
      );
    }
    if (!key.confirmedAt) {
      throw new BadRequestException(
        'The seller has not confirmed their settlement key. Purchases are blocked until the seller verifies their sales wallet.',
      );
    }
    const secret = new TextDecoder().decode(
      decryptSecret(key.encryptedSecret, this.masterKey),
    );
    return { key, publicKey: key.publicKey, secret };
  }

  /** Read the custody ATA balance for the credit mint (0 when unterminated). */
  async getCustodyBalance(publicKey: string): Promise<number> {
    return this.solana.getTokenBalance(publicKey);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async getOwnedKey(
    userId: string,
    keyId: string,
  ): Promise<SellerMarketplaceKey> {
    const key = await this.prisma.sellerMarketplaceKey.findUnique({
      where: { id: keyId },
    });
    if (!key || key.sellerUserId !== userId) {
      throw new NotFoundException(`Settlement key "${keyId}" not found.`);
    }
    return key;
  }

  private ataFor(publicKeyB58: string): string {
    return this.ataForPublicKey(publicKeyB58);
  }

  /** Derive the Token-2022 ATA for a custody public key ('' when no mint configured). */
  public ataForPublicKey(publicKeyB58: string): string {
    const mint = this.solanaConfig.creditMint;
    if (!mint) return '';
    return getAssociatedTokenAddressSync(
      mint,
      new PublicKey(publicKeyB58),
      false,
      TOKEN_2022_PROGRAM_ID,
    ).toBase58();
  }

  private verifySignature(walletAddress: string, message: string, signatureB64: string): boolean {
    try {
      const publicKey = bs58.decode(walletAddress);
      if (publicKey.length !== 32) return false;
      const messageBytes = new TextEncoder().encode(message);
      const signature = Buffer.from(signatureB64, 'base64');
      if (signature.length !== 64) return false;
      return nacl.sign.detached.verify(messageBytes, signature, publicKey);
    } catch {
      return false;
    }
  }

  private toResponse(row: SellerMarketplaceKey, ata: string): SellerKeyResponse {
    return {
      id: row.id,
      walletAddress: row.walletAddress,
      publicKey: row.publicKey,
      ata,
      custodyAta: ata,
      status: row.status,
      confirmed: row.confirmedAt !== null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}