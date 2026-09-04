import { randomBytes } from 'node:crypto';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as bs58 from 'bs58';
import * as nacl from 'tweetnacl';
import { SellerKeyStatus } from '@prisma/client';
import { SellerKeyService } from './seller-key.service';
import { encryptSecret } from './seller-keys.crypto';

const MINT = 'DeTknRJ1orhpEBEqCjdYCCRw6JKEPYLiTUVEZCMaH6p9';

const now = () => new Date('2026-01-01T00:00:00.000Z');

function mkPrisma(state: { users: any[]; keys: any[] }) {
  return {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id?: string } }) => {
        if (!where.id) return null;
        return state.users.find((u) => u.id === where.id) ?? null;
      }),
    },
    sellerMarketplaceKey: {
      findUnique: jest.fn(async ({ where }: { where: any }) => {
        if (where?.id) return state.keys.find((k) => k.id === where.id) ?? null;
        const c = where?.sellerUserId_walletAddress_status;
        if (c) {
          return (
            state.keys.find(
              (k) =>
                k.sellerUserId === c.sellerUserId &&
                k.walletAddress === c.walletAddress &&
                k.status === c.status,
            ) ?? null
          );
        }
        return null;
      }),
      findFirst: jest.fn(async ({ where }: { where: any }) => {
        return (
          state.keys.find((k) =>
            Object.entries(where).every(([f, v]) => k[f] === v),
          ) ?? null
        );
      }),
      findMany: jest.fn(async ({ where }: { where: any }) =>
        state.keys.filter((k) =>
          Object.entries(where).every(([f, v]) => k[f] === v),
        ),
      ),
      create: jest.fn(async ({ data }: { data: any }) => {
        const row = {
          id: `key-${state.keys.length + 1}`,
          ...data,
          createdAt: now(),
          updatedAt: now(),
        };
        state.keys.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: any; data: any }) => {
        const k = state.keys.find((x) => x.id === where.id);
        Object.assign(k, data);
        return k;
      }),
    },
  };
}

function buildService(state: { users?: any[]; keys?: any[] } = {}) {
  const normalized = { users: state.users ?? [], keys: state.keys ?? [] };
  const masterKey = randomBytes(32);
  const solana = {
    ensureTokenAccount: jest.fn(async () => 'custodyAtaB58'),
    getTokenBalance: jest.fn(async () => 0),
  };
  const config = {
    get: jest.fn((k: string) =>
      k === 'MARKETPLACE_SELLER_KEY_ENCRYPTION_KEY'
        ? Buffer.from(masterKey).toString('base64')
        : undefined,
    ),
  };
  const solanaConfig = { creditMint: { toBase58: () => MINT } };
  const service = new SellerKeyService(
    mkPrisma(normalized) as any,
    config as any,
    solana as any,
    solanaConfig as any,
  );
  return {
    service,
    solana,
    masterKey,
    masterKeyB64: Buffer.from(masterKey).toString('base64'),
    prisma: (service as any).prisma,
  };
}

describe('SellerKeyService', () => {
  const walletAddress = bs58.encode(
    Uint8Array.from(
      'VerdiCredSellerMainWallet000000000000000000000000'.slice(0, 32),
    ),
  );

  it('provisions a key, encrypts the secret, and never returns it', async () => {
    const state = { users: [{ id: 'u1', walletAddress }], keys: [] as any[] };
    const { service, solana, prisma } = buildService(state);

    const res = await service.provision('u1', walletAddress);

    expect(solana.ensureTokenAccount).toHaveBeenCalledWith(MINT, 'stub');
    expect(prisma.sellerMarketplaceKey.create).toHaveBeenCalled();
    const data = prisma.sellerMarketplaceKey.create.mock.calls[0][0].data;
    expect(data.encryptedSecret).toEqual(expect.any(String));
    expect(data.encryptedSecret.length).toBeGreaterThan(40);
    // The plaintext (64-byte JSON array) never appears in the stored value.
    expect(data.encryptedSecret).not.toContain('[7,7,7');

    // Public response surfaces only safe fields.
    expect(res.publicKey).toBe('stub');
    expect(res.custodyAta).toBe('custodyAtaB58');
    expect(res).not.toHaveProperty('encryptedSecret');
    expect(res).not.toHaveProperty('secret');
    expect(JSON.stringify(res)).not.toContain('secretKey');
  });

  it('rejects provisioning for a wallet not linked to the user', async () => {
    const state = { users: [{ id: 'u1', walletAddress }], keys: [] as any[] };
    const { service } = buildService(state);
    await expect(
      service.provision('u1', bs58.encode(Uint8Array.from(new Array(32).fill(9)))),
    ).rejects.toThrow(ForbiddenException);
  });

  it('is idempotent — reuses an existing ACTIVE key', async () => {
    const state = {
      users: [{ id: 'u1', walletAddress }],
      keys: [
        {
          id: 'key-1',
          sellerUserId: 'u1',
          walletAddress,
          publicKey: 'stub',
          encryptedSecret: 'enc',
          status: SellerKeyStatus.ACTIVE,
          confirmedAt: null,
          createdAt: now(),
          updatedAt: now(),
        },
      ],
    };
    const { service, solana } = buildService(state);
    const res = await service.provision('u1', walletAddress);
    expect(res.id).toBe('key-1');
    expect(solana.ensureTokenAccount).not.toHaveBeenCalled();
  });

  it('confirms custody with a valid wallet signature', async () => {
    const kp = nacl.sign.keyPair.fromSeed(randomBytes(32));
    const wallet = bs58.encode(kp.publicKey);
    const state = {
      users: [{ id: 'u1', walletAddress: wallet }],
      keys: [
        {
          id: 'key-1',
          sellerUserId: 'u1',
          walletAddress: wallet,
          publicKey: 'stub',
          encryptedSecret: 'enc',
          status: SellerKeyStatus.ACTIVE,
          confirmedAt: null,
          createdAt: now(),
          updatedAt: now(),
        },
      ],
    };
    const { service } = buildService(state);
    const message = 'VerdiCred Marketplace Settlement Key\n\nWallet: sign-me';
    const sig = nacl.sign.detached(
      new TextEncoder().encode(message),
      kp.secretKey,
    );
    const res = await service.confirm(
      'u1',
      'key-1',
      Buffer.from(sig).toString('base64'),
      message,
    );
    expect(res.confirmed).toBe(true);
  });

  it('rejects confirm with an invalid signature', async () => {
    const state = {
      users: [{ id: 'u1', walletAddress }],
      keys: [
        {
          id: 'key-1',
          sellerUserId: 'u1',
          walletAddress,
          publicKey: 'stub',
          encryptedSecret: 'enc',
          status: SellerKeyStatus.ACTIVE,
          confirmedAt: null,
          createdAt: now(),
          updatedAt: now(),
        },
      ],
    };
    const { service } = buildService(state);
    await expect(
      service.confirm(
        'u1',
        'key-1',
        Buffer.from(new Uint8Array(64)).toString('base64'),
        'nope',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('resolves and decrypts an ACTIVE confirmed key for settlement', async () => {
    const secretArray = Array.from({ length: 64 }, (_, i) => i % 251);
    const { service, masterKey } = buildService({ users: [], keys: [] });
    const encrypted = encryptSecret(
      new TextEncoder().encode(JSON.stringify(secretArray)),
      masterKey,
    );
    const state = {
      users: [{ id: 'u1', walletAddress }],
      keys: [
        {
          id: 'key-1',
          sellerUserId: 'u1',
          walletAddress,
          publicKey: 'custody-pub',
          encryptedSecret: encrypted,
          status: SellerKeyStatus.ACTIVE,
          confirmedAt: now(),
          createdAt: now(),
          updatedAt: now(),
        },
      ],
    };
    const svc = new SellerKeyService(
      buildService(state).service['prisma'] as any,
      { get: (k: string) => k === 'MARKETPLACE_SELLER_KEY_ENCRYPTION_KEY' ? Buffer.from(masterKey).toString('base64') : undefined } as any,
      { ensureTokenAccount: jest.fn(), getTokenBalance: jest.fn() } as any,
      { creditMint: { toBase58: () => MINT } } as any,
    );
    const resolved = await svc.resolveActiveSecret(walletAddress, 'u1');
    expect(resolved.publicKey).toBe('custody-pub');
    expect(JSON.parse(resolved.secret)).toEqual(secretArray);
  });

  it('blocks settlement when the key is unconfirmed', async () => {
    const secretArray = Array.from({ length: 64 }, () => 1);
    const { service, masterKey } = buildService({ users: [], keys: [] });
    const encrypted = encryptSecret(
      new TextEncoder().encode(JSON.stringify(secretArray)),
      masterKey,
    );
    const state = {
      keys: [
        {
          id: 'key-1',
          sellerUserId: 'u1',
          walletAddress,
          publicKey: 'custody-pub',
          encryptedSecret: encrypted,
          status: SellerKeyStatus.ACTIVE,
          confirmedAt: null,
          createdAt: now(),
          updatedAt: now(),
        },
      ],
    };
    const svc = new SellerKeyService(
      buildService(state).service['prisma'] as any,
      { get: (k: string) => k === 'MARKETPLACE_SELLER_KEY_ENCRYPTION_KEY' ? Buffer.from(masterKey).toString('base64') : undefined } as any,
      { ensureTokenAccount: jest.fn(), getTokenBalance: jest.fn() } as any,
      { creditMint: { toBase58: () => MINT } } as any,
    );
    await expect(svc.resolveActiveSecret(walletAddress, 'u1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('blocks settlement when no key exists', async () => {
    const { service } = buildService({ users: [], keys: [] });
    await expect(service.resolveActiveSecret(walletAddress, 'u1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('revoke flips an owned key to REVOKED', async () => {
    const state = {
      keys: [
        {
          id: 'key-1',
          sellerUserId: 'u1',
          walletAddress,
          publicKey: 'stub',
          encryptedSecret: 'enc',
          status: SellerKeyStatus.ACTIVE,
          confirmedAt: now(),
          createdAt: now(),
          updatedAt: now(),
        },
      ],
    };
    const { service } = buildService(state);
    const res = await service.revoke('u1', 'key-1');
    expect(res.status).toBe(SellerKeyStatus.REVOKED);
    await expect(service.revoke('u1', 'missing')).rejects.toThrow();
  });
});