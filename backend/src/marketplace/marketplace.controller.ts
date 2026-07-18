import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
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
import {
  BuyListingDto,
  CancelListingDto,
  CreateListingDto,
  ListingResponseDto,
} from './dto/marketplace.dto';

@ApiTags('Marketplace (Stage 5)')
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

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
}
