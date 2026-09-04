import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('profile')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Provision / fetch the VerdiCred profile for the auth user',
    description:
      'Call this once after Supabase sign-up (or any time) to create the ' +
      'application-side profile and resolve the user role.',
  })
  provisionProfile(@CurrentUser() user: { supabaseId: string; email?: string }) {
    return this.authService.provisionProfile(user);
  }

  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({ summary: 'Get the current authenticated profile' })
  getMe(@CurrentUser() user: { supabaseId: string }) {
    return this.authService.getProfile(user);
  }

  @Post('link-wallet')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Link a Phantom wallet to the authenticated user',
    description:
      'Verifies a signed message from the wallet to prove ownership, then stores the wallet address on the user profile. Call this after connecting Phantom on the frontend.',
  })
  linkWallet(
    @CurrentUser() user: { supabaseId: string },
    @Body()
    dto: {
      walletAddress: string;
      signature: string;
      message: string;
    },
  ) {
    return this.authService.linkWallet(user.supabaseId, dto);
  }
}
