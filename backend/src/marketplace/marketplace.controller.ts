import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Delete,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Actor, MarketplaceService } from './marketplace.service';
import { SellerKeyService, SellerKeyResponse } from './seller-key.service';
import {
  BuyListingDto,
  CancelListingDto,
  ConfirmSellerKeyDto,
  CreateListingDto,
  DepositCheckDto,
  DepositConfirmDto,
  ListingResponseDto,
  ProvisionSellerKeyDto,
  SellerKeyResponseDto,
} from './dto/marketplace.dto';

@ApiTags('Marketplace (Stage 5)')
@Controller('marketplace')
export class MarketplaceController {
  constructor(
    private readonly marketplace: MarketplaceService,
    private readonly sellerKeys: SellerKeyService,
  ) {}

  @Get('listings')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List all ACTIVE listings (any authenticated user)',
    description: 'Powers the Marketplace browse page. Returns ACTIVE listings, newest first.',
  })
  @ApiResponse({ status: 200, type: ListingResponseDto, isArray: true })
  findActive(): Promise<ListingResponseDto[]> {
    return this.marketplace.findActive();
  }

  @Get('listings/all')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List every listing regardless of status (Admin/Auditor)',
    description: 'Full history including SOLD and CANCELLED listings for audit.',
  })
  @ApiResponse({ status: 200, type: ListingResponseDto, isArray: true })
  findAll(): Promise<ListingResponseDto[]> {
    return this.marketplace.findAll();
  }

  @Get('listings/:id')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Fetch a single listing with full details (any authenticated user)',
    description: 'Powers the Credit Details page: project, verification, ownership and pricing.',
  })
  @ApiParam({ name: 'id', description: 'Listing id (uuid)' })
  @ApiResponse({ status: 200, type: ListingResponseDto })
  @ApiResponse({ status: 404, description: 'Listing not found.' })
  findOne(@Param('id') id: string): Promise<ListingResponseDto> {
    return this.marketplace.findOne(id);
  }

  @Post('listings')
  @Roles(Role.DEVELOPER, Role.BUYER, Role.ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Create a listing (credit owner only)',
    description:
      'Lists a verified carbon credit for sale. The seller wallet must own the ' +
      'credit (checked via BlockchainService). Sets status=ACTIVE.',
  })
  @ApiResponse({ status: 201, type: ListingResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input or duplicate active listing.' })
  @ApiResponse({ status: 403, description: 'Seller wallet does not own the credit.' })
  create(
    @Body() dto: CreateListingDto,
    @CurrentUser() actor: Actor,
  ): Promise<ListingResponseDto> {
    if (!actor?.id) throw new ForbiddenException('Authentication required.');
    return this.marketplace.create(dto, actor);
  }

  @Post('listings/:id/buy')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Buy a listing (any authenticated user with a wallet)',
    description:
      'Transfers credit ownership to the buyer wallet and settles via ' +
      'BlockchainService. Only ACTIVE listings; cannot buy your own listing.',
  })
  @ApiParam({ name: 'id', description: 'Listing id (uuid)' })
  @ApiResponse({ status: 201, type: ListingResponseDto })
  @ApiResponse({ status: 400, description: 'Listing not ACTIVE or self-purchase.' })
  @ApiResponse({ status: 404, description: 'Listing not found.' })
  buy(
    @Param('id') id: string,
    @Body() dto: BuyListingDto,
    @CurrentUser() actor: Actor,
  ): Promise<ListingResponseDto> {
    if (!actor?.id) throw new ForbiddenException('Authentication required.');
    return this.marketplace.buy(id, dto, actor);
  }

  @Post('listings/:id/buy-prepare')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Prepare an owner-signed purchase (transfer) transaction',
    description:
      'Validates the listing is ACTIVE and returns a base64-encoded `transferCredit` transaction for the seller wallet to sign with Phantom. Submit the returned signature via POST /marketplace/listings/:id/buy (client-signed settlement).',
  })
  @ApiParam({ name: 'id', description: 'Listing id (uuid)' })
  @ApiResponse({ status: 201, description: 'Ready-to-sign transaction.' })
  @ApiResponse({ status: 400, description: 'Listing not ACTIVE or self-purchase.' })
  @ApiResponse({ status: 404, description: 'Listing not found.' })
  buyPrepare(
    @Param('id') id: string,
    @Body() dto: BuyListingDto,
    @CurrentUser() actor: Actor,
  ): Promise<{ transaction: string; seller: string; listingId: string; amount: number }> {
    if (!actor?.id) throw new ForbiddenException('Authentication required.');
    return this.marketplace.prepareBuy(id, actor, dto.buyer);
  }

  @Post('listings/:id/cancel')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Cancel a listing (owner only)',
    description:
      'Only the listing owner (its VerdiCred user and seller wallet) — or an ' +
      'ADMIN — may cancel, and only while ACTIVE. Sets status=CANCELLED.',
  })
  @ApiParam({ name: 'id', description: 'Listing id (uuid)' })
  @ApiResponse({ status: 201, type: ListingResponseDto })
  @ApiResponse({ status: 400, description: 'Listing not ACTIVE.' })
  @ApiResponse({ status: 403, description: 'Not the listing owner.' })
  @ApiResponse({ status: 404, description: 'Listing not found.' })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelListingDto,
    @CurrentUser() actor: Actor,
  ): Promise<ListingResponseDto> {
    if (!actor?.id) throw new ForbiddenException('Authentication required.');
    return this.marketplace.cancel(id, dto, actor);
  }

  // ---------------------------------------------------------------------------
  // Seller settlement keys (Design A server-side settlement)
  // ---------------------------------------------------------------------------

  @Post('seller-keys')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Provision a server-side settlement (custody) key for the seller wallet',
    description:
      'Generates a fresh ed25519 keypair, encrypts its secret at rest (AES-256-GCM ' +
      'under a server-only master key), creates its Token-2022 ATA (server-funded) and ' +
      'stores exactly one ACTIVE key per (user, wallet). Only the PUBLIC key and ATA are ' +
      'returned — the secret never leaves the backend. The seller must then confirm the ' +
      'key by signing a challenge with their linked wallet and deposit the listed credits ' +
      'into the custody ATA before purchases settle server-side.',
  })
  @ApiResponse({ status: 201, type: SellerKeyResponseDto })
  @ApiResponse({ status: 403, description: 'Wallet is not linked to the user.' })
  provisionKey(
    @Body() dto: ProvisionSellerKeyDto,
    @CurrentUser() actor: Actor,
  ): Promise<SellerKeyResponse> {
    if (!actor?.id) throw new ForbiddenException('Authentication required.');
    return this.sellerKeys.provision(actor.id, dto.walletAddress);
  }

  @Post('seller-keys/:id/confirm')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Confirm a settlement key with the seller wallet signature',
    description:
      'Verifies the seller\'s ed25519 signature over the challenge message (signed by ' +
      'the linked main wallet) and marks the key confirmed. Only confirmed keys can ' +
      'settle purchases.',
  })
  @ApiParam({ name: 'id', description: 'Settlement key id (uuid)' })
  @ApiResponse({ status: 200, type: SellerKeyResponseDto })
  confirmKey(
    @Param('id') id: string,
    @Body() dto: ConfirmSellerKeyDto,
    @CurrentUser() actor: Actor,
  ): Promise<SellerKeyResponse> {
    if (!actor?.id) throw new ForbiddenException('Authentication required.');
    return this.sellerKeys.confirm(actor.id, id, dto.signature, dto.message);
  }

  @Get('seller-keys')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'List the caller\'s settlement keys',
    description: 'Returns only public fields (publicKey, ATA, status, confirmed).',
  })
  @ApiResponse({ status: 200, type: SellerKeyResponseDto, isArray: true })
  listKeys(@CurrentUser() actor: Actor): Promise<SellerKeyResponse[]> {
    if (!actor?.id) throw new ForbiddenException('Authentication required.');
    return this.sellerKeys.listForUser(actor.id);
  }

  @Delete('seller-keys/:id')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Revoke a settlement key',
    description:
      'Sets status=REVOKED so it can no longer settle purchases. Deposited credits ' +
      'are NOT moved; the seller should withdraw them via the documented manual flow.',
  })
  @ApiResponse({ status: 200, type: SellerKeyResponseDto })
  revokeKey(
    @Param('id') id: string,
    @CurrentUser() actor: Actor,
  ): Promise<SellerKeyResponse> {
    if (!actor?.id) throw new ForbiddenException('Authentication required.');
    return this.sellerKeys.revoke(actor.id, id);
  }

  // ---------------------------------------------------------------------------
  // Seller deposit (fund the custody ATA)
  // ---------------------------------------------------------------------------

  @Post('listings/:id/deposit-prepare')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Prepare a seller-signed deposit transfer into the custody ATA',
    description:
      'Only the listing seller (or an ADMIN) may call this. Builds a ready-to-sign ' +
      '`transferCredit` transaction from the seller\'s main wallet to the custody ATA. ' +
      'The seller signs it once with Phantom, submits, then confirms via ' +
      'POST /marketplace/listings/:id/deposit-confirm.',
  })
  @ApiParam({ name: 'id', description: 'Listing id (uuid)' })
  @ApiResponse({ status: 201, description: 'Ready-to-sign deposit transaction.' })
  @ApiResponse({ status: 403, description: 'Not the listing owner.' })
  depositPrepare(
    @Param('id') id: string,
    @CurrentUser() actor: Actor,
  ): Promise<{ transaction: string; seller: string; listingId: string; amount: number; custodyPublicKey: string; custodyAta: string }> {
    if (!actor?.id) throw new ForbiddenException('Authentication required.');
    return this.marketplace.prepareDeposit(id, actor);
  }

  @Post('listings/:id/deposit-confirm')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Verify the seller\'s deposit reached the custody ATA',
    description:
      'Only the listing seller (or an ADMIN) may call this. Re-checks the on-chain ' +
      'balance of the custody ATA against the listing amount and returns the funding ' +
      'state. No chain write is performed.',
  })
  @ApiParam({ name: 'id', description: 'Listing id (uuid)' })
  @ApiResponse({ status: 201, type: DepositCheckDto })
  @ApiResponse({ status: 403, description: 'Not the listing owner.' })
  depositConfirm(
    @Param('id') id: string,
    @Body() dto: DepositConfirmDto,
    @CurrentUser() actor: Actor,
  ): Promise<DepositCheckDto> {
    if (!actor?.id) throw new ForbiddenException('Authentication required.');
    return this.marketplace.confirmDeposit(id, actor, dto.txSignature);
  }
}
