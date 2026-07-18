import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { SupabaseModule } from './supabase/supabase.module';
import { ProjectsModule } from './projects/projects.module';
import { AdminModule } from './admin/admin.module';
import { EvidenceModule } from './evidence/evidence.module';
import { VerificationModule } from './verification/verification.module';
import { CarbonCreditsModule } from './carbon-credits/carbon-credits.module';
import { MarketplaceModule } from './marketplace/marketplace.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '.env.local'] }),
    PrismaModule,
    SupabaseModule,
    AuthModule,
    ProjectsModule,
    AdminModule,
    EvidenceModule,
    VerificationModule,
    CarbonCreditsModule,
    MarketplaceModule,
  ],
})
export class AppModule {}
