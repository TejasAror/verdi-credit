import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService
 * --------------
 * Wraps PrismaClient and connects on module init. A short retry loop is used
 * because Supabase's connection pooler can reject the very first connection
 * attempt after idle (cold start) — we don't want that to crash the API.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly MAX_ATTEMPTS = 5;

  async onModuleInit() {
    let attempt = 0;
    while (attempt < this.MAX_ATTEMPTS) {
      attempt++;
      try {
        await this.$connect();
        this.logger.log('Connected to database.');
        return;
      } catch (err) {
        this.logger.warn(
          `DB connect attempt ${attempt}/${this.MAX_ATTEMPTS} failed: ${
            (err as Error).message
          }`,
        );
        if (attempt === this.MAX_ATTEMPTS) throw err;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
