import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogAction, RetirementStatus, Role } from '@prisma/client';
import { RetirementService } from './retirement.service';
import { RetirementBlockchainService } from './retirement-blockchain.service';
import { CertificateGeneratorService } from './certificate-generator.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';

/** Build a fake Prisma client whose transaction callback receives the mock. */
function makePrisma(holding: any, createdRow: any, updatedHolding: any) {
  const tx = {
    holding: {
      findUnique: jest.fn().mockResolvedValue(holding),
      update: jest.fn().mockResolvedValue(updatedHolding),
    },
    retirement: {
      create: jest.fn().mockResolvedValue(createdRow),
      update: jest.fn().mockResolvedValue({ ...createdRow, certificateCid: 'cid123', status: RetirementStatus.CERTIFIED }),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    listing: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<any>) => fn(tx)),
    holding: { findMany: jest.fn() },
    retirement: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
  return { prisma, tx };
}

describe('RetirementService', () => {
  let service: RetirementService;
  let blockchain: jest.Mocked<RetirementBlockchainService>;
  let certificate: jest.Mocked<CertificateGeneratorService>;
  let audit: jest.Mocked<AuditLogService>;

  const actor = { id: 'user-1', role: Role.BUYER, email: 'a@b.com' };

  const baseHolding = {
    id: 'holding-1',
    ownerId: 'user-1',
    walletAddress: 'WalletX1111111111111111111111111111111111',
    projectId: 'proj-1',
    tokenMint: 'MintX1111111111111111111111111111111111111',
    projectName: 'Amazon Reforestation',
    methodology: 'VM0036',
    vintage: 2026,
    availableBalance: 100,
    totalRetired: 0,
  };

  const createdRow = {
    id: 'ret-1',
    retirementId: 'uuid-ret',
    holdingId: 'holding-1',
    projectId: 'proj-1',
    tokenMint: baseHolding.tokenMint,
    retiredAmount: 30,
    retiredBy: 'user-1',
    walletAddress: baseHolding.walletAddress,
    reason: 'Net zero',
    reasonCategory: 'NET_ZERO',
    transactionSignature: 'mock_retire_abc',
    certificateCid: null,
    certificateUrl: null,
    status: RetirementStatus.CONFIRMED,
    organization: 'Acme',
    projectName: 'Amazon Reforestation',
    methodology: 'VM0036',
    vintage: 2026,
    metadata: { explorerUrl: null },
    timestamp: new Date('2026-07-18T00:00:00Z'),
    createdAt: new Date('2026-07-18T00:00:00Z'),
    updatedAt: new Date('2026-07-18T00:00:00Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetirementService,
        {
          provide: PrismaService,
          useValue: makePrisma(baseHolding, createdRow, {
            ...baseHolding,
            availableBalance: 70,
            totalRetired: 30,
          }).prisma,
        },
        {
          provide: RetirementBlockchainService,
          useValue: {
            retireCredits: jest
              .fn()
              .mockResolvedValue({
                txSignature: 'mock_retire_abc',
                onChain: false,
                slot: null,
                retiredAt: '2026-07-18T00:00:00.000Z',
              }),
            getExplorerUrl: jest.fn().mockReturnValue(null),
            mockMode: true,
          },
        },
        {
          provide: CertificateGeneratorService,
          useValue: {
            generateAndPin: jest
              .fn()
              .mockResolvedValue({ cid: 'cid123', url: 'https://ipfs.io/cid123', certificateId: 'VC-RET-ABC' }),
            renderPdf: jest.fn(),
            pdfToBuffer: jest.fn().mockResolvedValue(Buffer.from('pdf')),
            buildVerifyUrl: jest.fn().mockReturnValue('https://x/verify'),
          },
        },
        {
          provide: AuditLogService,
          useValue: { recordEvidenceAction: jest.fn().mockResolvedValue({}), recordAction: jest.fn().mockResolvedValue({}) },
        },
      ],
    }).compile();

    service = module.get(RetirementService);
    blockchain = module.get(RetirementBlockchainService);
    certificate = module.get(CertificateGeneratorService);
    audit = module.get(AuditLogService);
  });

  it('retires credits: validates, burns, persists, decrements, certifies', async () => {
    const result = await service.retire(
      {
        holdingId: 'holding-1',
        amount: 30,
        reasonCategory: 'NET_ZERO',
        reason: 'Net zero',
        walletAddress: baseHolding.walletAddress,
        organization: 'Acme',
      },
      actor,
    );

    expect(blockchain.retireCredits).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 30, tokenMint: baseHolding.tokenMint }),
    );
    expect(certificate.generateAndPin).toHaveBeenCalled();
    expect(result.certificateCid).toBe('cid123');
    expect(result.status).toBe(RetirementStatus.CERTIFIED);
    expect(audit.recordAction).toHaveBeenCalledTimes(2);
    expect(audit.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditLogAction.CREDIT_RETIRED }),
    );
  });

  it('rejects retirement when balance is insufficient', async () => {
    await expect(
      service.retire(
        { holdingId: 'holding-1', amount: 200, reasonCategory: 'NET_ZERO', reason: 'x' },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects retirement of a holding the user does not own', async () => {
    const { prisma } = makePrisma(
      { ...baseHolding, ownerId: 'other-user' },
      createdRow,
      baseHolding,
    );
    // Recreate service with a custom prisma that returns a foreign holding.
    const svc = new RetirementService(
      prisma as any,
      blockchain as any,
      certificate as any,
      audit as any,
    );
    await expect(
      svc.retire(
        { holdingId: 'holding-1', amount: 10, reasonCategory: 'NET_ZERO', reason: 'x' },
        actor,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects retirement when wallet does not match the holding wallet', async () => {
    await expect(
      service.retire(
        {
          holdingId: 'holding-1',
          amount: 10,
          reasonCategory: 'NET_ZERO',
          reason: 'x',
          walletAddress: 'WrongWallet2222222222222222222222222222222222',
        },
        actor,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws when the holding does not exist', async () => {
    const { prisma } = makePrisma(null, createdRow, baseHolding);
    const svc = new RetirementService(
      prisma as any,
      blockchain as any,
      certificate as any,
      audit as any,
    );
    await expect(
      svc.retire(
        { holdingId: 'nope', amount: 10, reasonCategory: 'NET_ZERO', reason: 'x' },
        actor,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('cancels marketplace listings that exceed the remaining balance', async () => {
    // Holding with only 20 available; listing of 50 should be cancelled.
    const { prisma, tx } = makePrisma(
      { ...baseHolding, availableBalance: 20 },
      { ...createdRow, retiredAmount: 20 },
      { ...baseHolding, availableBalance: 0, totalRetired: 20 },
    );
    tx.listing.findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'listing-1', amount: 50, creditId: baseHolding.tokenMint, status: 'ACTIVE' }]);
    const svc = new RetirementService(
      prisma as any,
      blockchain as any,
      certificate as any,
      audit as any,
    );
    await svc.retire(
      { holdingId: 'holding-1', amount: 20, reasonCategory: 'COMPLIANCE', reason: 'r' },
      actor,
    );
    expect(tx.listing.update).toHaveBeenCalledWith({
      where: { id: 'listing-1' },
      data: { status: 'CANCELLED' },
    });
  });

  it('history scopes non-admin users to their own retirements', async () => {
    const prisma = {
      retirement: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const svc = new RetirementService(
      prisma as any,
      blockchain as any,
      certificate as any,
      audit as any,
    );
    await svc.history(actor, { page: 1, limit: 10 });
    expect(prisma.retirement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ retiredBy: 'user-1' }),
      }),
    );
  });

  it('history lets ADMIN see all retirements', async () => {
    const prisma = {
      retirement: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const svc = new RetirementService(
      prisma as any,
      blockchain as any,
      certificate as any,
      audit as any,
    );
    await svc.history({ id: 'admin', role: Role.ADMIN }, { page: 1, limit: 10 });
    const where = prisma.retirement.findMany.mock.calls[0][0].where;
    expect(where.retiredBy).toBeUndefined();
  });

  it('getById blocks a user from viewing another user’s retirement', async () => {
    const prisma = {
      retirement: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...createdRow, retiredBy: 'other-user' }),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    const svc = new RetirementService(
      prisma as any,
      blockchain as any,
      certificate as any,
      audit as any,
    );
    await expect(svc.getById('ret-1', actor)).rejects.toThrow(ForbiddenException);
  });
});
