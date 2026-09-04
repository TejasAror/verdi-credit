import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ListingStatus, Role } from '@prisma/client';
import { MarketplaceService } from './marketplace.service';

const LISTING = {
  id: '9cdc7b79-8813-473c-ba90-3147593fc653',
  creditId: 'DeTknRJ1orhpEBEqCjdYCCRw6JKEPYLiTUVEZCMaH6p9',
  seller: 'HNDAhSqXTA6woJLRRQpaMsWX171XVsjgxBXRxz95xfSB',
  buyer: null,
  price: 1,
  amount: 1,
  status: ListingStatus.ACTIVE,
  sellerUserId: 'seller-user',
  projectId: 'proj-1',
  projectName: 'Amazon Reforestation Block A',
  projectType: 'REFORESTATION',
  methodology: 'VM0036',
  vintage: 2026,
  verifiedTonnes: null,
  reportCid: null,
  metadata: null,
  txSignature: null,
  settledAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const CUSTODY = {
  publicKey: 'CustodySellerPubKey0000000000000000000000000',
  secret: JSON.stringify(Array.from({ length: 64 }, () => 1)),
};

const SIGNATURE =
  '3xYxK9xByV1TkHnY4TzSWVQW6VzzQrZhX8wjC2V7sN3p1mQcBzW9uRgUuLfHh5FkRpGcXdWaS8rTbYvBgQp4nKfJh';

function build() {
  const db: { listings: any[]; holdings: any[]; keys: any[] } = {
    listings: [{ ...LISTING }],
    holdings: [],
    keys: [],
  };

  const prisma = {
    listing: {
      findUnique: jest.fn(async ({ where }: { where: any }) =>
        db.listings.find((l) => l.id === where.id) ?? null,
      ),
      update: jest.fn(async ({ where, data }: { where: any; data: any }) => {
        const l = db.listings.find((x) => x.id === where.id);
        Object.assign(l, data);
        if (l.settledAt) l.settledAt = new Date(data.settledAt);
        return l;
      }),
    },
    sellerMarketplaceKey: {
      findFirst: jest.fn(async (_args: any) => null as any),
    },
    user: {
      findFirst: jest.fn(async ({ where }: { where: any }) => {
        return where?.walletAddress === 'buyer-wallet-connected'
          ? { id: 'buyer-user', walletAddress: where.walletAddress }
          : null;
      }),
    },
    holding: {
      findUnique: jest.fn(async () =>
        db.holdings.length ? db.holdings[0] : null,
      ),
      update: jest.fn(async ({ data, where }) => {
        const h = db.holdings.find((x) => x.id === where.id);
        Object.assign(h, data);
        return h;
      }),
      create: jest.fn(async ({ data }) => {
        const h = { id: `h-${db.holdings.length + 1}`, ...data };
        db.holdings.push(h);
        return h;
      }),
    },
  };

  const blockchain = {
    verifyOwnership: jest.fn(async () => true),
    settlePurchase: jest.fn(async (params: any) => ({
      txSignature: SIGNATURE,
      onChain: true,
      slot: null,
      settledAt: new Date().toISOString(),
    })),
    buildTransferTx: jest.fn(async () => ({
      transaction: 'base64Tx',
      seller: LISTING.seller,
    })),
    ensureTokenAccount: jest.fn(async () => 'buyerAta'),
    getExplorerUrl: jest.fn(() => 'https://explorer.example/tx'),
  };

  const sellerKeys = {
    resolveActiveSecret: jest.fn(async () => CUSTODY),
    getCustodyBalance: jest.fn(async () => 1),
    ataForPublicKey: jest.fn(() => 'custodyAta'),
  };

  const service = new MarketplaceService(
    prisma as any,
    blockchain as any,
    sellerKeys as any,
  );

  return { service, prisma, blockchain, sellerKeys, db };
}

describe('MarketplaceService — Design A server-side settlement', () => {
  const sellerActor = { id: 'seller-user', role: Role.BUYER };
  const adminActor = { id: 'admin', role: Role.ADMIN };
  const strangerActor = { id: 'stranger', role: Role.BUYER };

  it('settles a purchase server-side with the custody key (no buyer signing)', async () => {
    const { service, blockchain, sellerKeys, prisma } = build();

    const updated = await service.buy(
      LISTING.id,
      { buyer: 'buyer-wallet-connected' },
      sellerActor,
    );

    expect(sellerKeys.resolveActiveSecret).toHaveBeenCalledWith(
      LISTING.seller,
      LISTING.sellerUserId,
    );
    expect(blockchain.verifyOwnership).toHaveBeenCalledWith({
      creditId: LISTING.creditId,
      wallet: CUSTODY.publicKey,
      amount: LISTING.amount,
    });
    // Buyer ATA is guaranteed by the backend, not signed by the buyer wallet.
    expect(blockchain.ensureTokenAccount).toHaveBeenCalledWith(
      LISTING.creditId,
      'buyer-wallet-connected',
    );
    // The server signs with the custody secret; no client signature is recorded.
    expect(blockchain.settlePurchase).toHaveBeenCalledWith({
      creditId: LISTING.creditId,
      seller: CUSTODY.publicKey,
      buyer: 'buyer-wallet-connected',
      amount: LISTING.amount,
      price: LISTING.price,
      sellerSecret: CUSTODY.secret,
    });
    expect(updated.status).toBe(ListingStatus.SOLD);
    expect(updated.buyer).toBe('buyer-wallet-connected');
    expect(updated.txSignature).toBe(SIGNATURE);
    expect(prisma.holding.create).toHaveBeenCalled();
  });

  it('blocks the purchase when the custody wallet is underfunded', async () => {
    const { service, blockchain, sellerKeys } = build();
    sellerKeys.resolveActiveSecret.mockResolvedValue(CUSTODY);
    blockchain.verifyOwnership.mockResolvedValue(false);

    await expect(
      service.buy(LISTING.id, { buyer: 'buyer-wallet-connected' }, sellerActor),
    ).rejects.toThrow(BadRequestException);
    expect(blockchain.settlePurchase).not.toHaveBeenCalled();
  });

  it('blocks the purchase when the seller has no settlement key', async () => {
    const { service, sellerKeys, blockchain } = build();
    sellerKeys.resolveActiveSecret.mockRejectedValue(
      new BadRequestException('no key'),
    );

    await expect(
      service.buy(LISTING.id, { buyer: 'buyer-wallet-connected' }, sellerActor),
    ).rejects.toThrow(BadRequestException);
    expect(blockchain.settlePurchase).not.toHaveBeenCalled();
    expect(blockchain.ensureTokenAccount).not.toHaveBeenCalled();
  });

  it('still records a legacy client-signed transfer when txSignature is provided', async () => {
    const { service, blockchain, sellerKeys } = build();

    await service.buy(
      LISTING.id,
      { buyer: 'buyer-wallet-connected', txSignature: SIGNATURE },
      sellerActor,
    );

    // No custody resolution needed for an already-submitted transfer.
    expect(sellerKeys.resolveActiveSecret).not.toHaveBeenCalled();
    expect(blockchain.settlePurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        seller: LISTING.seller,
        txSignature: SIGNATURE,
      }),
    );
  });

  it('rejects buying your own listing', async () => {
    const { service } = build();
    await expect(
      service.buy(LISTING.id, { buyer: LISTING.seller }, sellerActor),
    ).rejects.toThrow(BadRequestException);
  });

  it('builds a seller-signed deposit transfer into the custody ATA', async () => {
    const { service, blockchain, sellerKeys, prisma } = build();

    const deposit = await service.prepareDeposit(LISTING.id, sellerActor);

    expect(deposit.transaction).toBe('base64Tx');
    expect(deposit.seller).toBe(LISTING.seller);
    expect(deposit.custodyPublicKey).toBe(CUSTODY.publicKey);
    expect(sellerKeys.resolveActiveSecret).toHaveBeenCalled();
    expect(blockchain.buildTransferTx).toHaveBeenCalledWith({
      creditId: LISTING.creditId,
      seller: LISTING.seller,
      buyer: CUSTODY.publicKey,
      amount: LISTING.amount,
    });
    expect(prisma.listing.update).not.toHaveBeenCalled();
  });

  it('rejects deposit actions from non-owners (unless ADMIN)', async () => {
    const { service } = build();
    await expect(
      service.prepareDeposit(LISTING.id, strangerActor),
    ).rejects.toThrow(ForbiddenException);

    const adminDeposit = await service.prepareDeposit(LISTING.id, adminActor);
    expect(adminDeposit.custodyPublicKey).toBe(CUSTODY.publicKey);
  });

  it('confirms a deposit by re-reading the custody balance', async () => {
    const { service, sellerKeys, prisma } = build();

    const check = await service.confirmDeposit(
      LISTING.id,
      sellerActor,
      SIGNATURE,
    );

    expect(check.funded).toBe(true);
    expect(check.custodyBalance).toBe(1);
    expect(sellerKeys.getCustodyBalance).toHaveBeenCalledWith(
      CUSTODY.publicKey,
    );
    expect(prisma.listing.update).not.toHaveBeenCalled();
  });

  it('reports the custody ATA funded state on the listing detail', async () => {
    const { service, sellerKeys, prisma } = build();
    prisma.sellerMarketplaceKey.findFirst.mockResolvedValue({
      publicKey: CUSTODY.publicKey,
      confirmedAt: new Date(),
    });
    sellerKeys.getCustodyBalance.mockResolvedValue(1);

    const dto = await service.findOne(LISTING.id);

    expect(dto.custodyPublicKey).toBe(CUSTODY.publicKey);
    expect(dto.sellerKeyReady).toBe(true);
    expect(dto.custodyFunded).toBe(true);
  });
});