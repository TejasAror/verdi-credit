/* eslint-disable */
// End-to-end DB test of the Stage 6 retirement lifecycle against the live DB.
// Uses the REAL PrismaService (reads .env) but mocks the blockchain + Pinata
// so no network/Solana/IPFS calls are needed. Validates the DB transaction:
//   - Retirement row persisted with certificateCid
//   - Holding.availableBalance decremented, totalRetired incremented
//   - marketplace listing exceeding remaining balance auto-cancelled
//   - audit log row written
import { PrismaService } from './dist/src/prisma/prisma.service';
import { RetirementService } from './dist/src/retirement/retirement.service';
import { AuditLogService } from './dist/src/audit-log/audit-log.service';
import { RetirementBlockchainService } from './dist/src/retirement/retirement-blockchain.service';
import { CertificateGeneratorService } from './dist/src/retirement/certificate-generator.service';

function mockCert() {
  return {
    generateAndPin: async () => ({ cid: 'bafytestCID123', url: 'https://ipfs.io/bafytestCID123', certificateId: 'VC-RET-TEST' }),
    renderPdf: async () => ({}),
    pdfToBuffer: async () => Buffer.from('pdf'),
    buildVerifyUrl: () => 'https://localhost:3000/verify',
  } as any;
}
function mockChain() {
  return {
    retireCredits: async () => ({ txSignature: 'mock_retire_e2e', onChain: false, slot: null, retiredAt: new Date().toISOString() }),
    getExplorerUrl: () => null,
    mockMode: true,
  } as any;
}
function mockAudit() {
  return { recordEvidenceAction: async () => ({}) } as any;
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  // Clean any prior test data.
  const email = `e2e-retire-${Date.now()}@test.com`;
  await prisma.user.deleteMany({ where: { email } });

  const user = await prisma.user.create({ data: { supabaseId: `sb_${Date.now()}`, email, role: 'BUYER' } });
  const project = await prisma.project.create({
    data: {
      ownerId: user.id,
      projectName: 'E2E Reforestation',
      projectType: 'REFORESTATION',
      methodology: 'VM0036',
      expectedAnnualTonnes: 1000,
      geoPolygon: { type: 'Polygon', coordinates: [] },
      status: 'VERIFIED',
    },
  });
  const holding = await prisma.holding.create({
    data: {
      ownerId: user.id,
      walletAddress: 'WalletE2E111111111111111111111111111111111',
      projectId: project.id,
      tokenMint: 'MintE2E1111111111111111111111111111111111111',
      projectName: project.projectName,
      projectType: 'REFORESTATION',
      methodology: 'VM0036',
      vintage: 2026,
      availableBalance: 100,
      totalRetired: 0,
    },
  });
  // A listing that will EXCEED remaining balance (100 - 80 = 20) after retire.
  const listing = await prisma.listing.create({
    data: {
      creditId: holding.tokenMint,
      seller: holding.walletAddress,
      price: 10,
      amount: 50,
      status: 'ACTIVE',
      sellerUserId: user.id,
      projectId: project.id,
      projectName: project.projectName,
    },
  });

  const svc = new RetirementService(prisma as any, mockChain(), mockCert(), new AuditLogService(prisma as any));
  const result = await svc.retire(
    {
      holdingId: holding.id,
      amount: 80,
      reasonCategory: 'NET_ZERO',
      reason: 'E2E net zero retirement',
      walletAddress: holding.walletAddress,
      organization: 'E2E Org',
    },
    { id: user.id, role: 'BUYER', email },
  );

  const reHolding = await prisma.holding.findUnique({ where: { id: holding.id } });
  const reListing = await prisma.listing.findUnique({ where: { id: listing.id } });
  const auditCount = await prisma.auditLog.count({ where: { action: 'CREDIT_RETIRED' } });

  const ok =
    result.certificateCid === 'bafytestCID123' &&
    result.status === 'CERTIFIED' &&
    reHolding!.availableBalance === 20 &&
    reHolding!.totalRetired === 80 &&
    reListing!.status === 'CANCELLED' &&
    auditCount >= 1;

  console.log(JSON.stringify({
    certificateCid: result.certificateCid,
    status: result.status,
    availableBalance: reHolding!.availableBalance,
    totalRetired: reHolding!.totalRetired,
    listingStatus: reListing!.status,
    auditCount,
    PASS: ok,
  }, null, 2));

  // Cleanup.
  await prisma.retirement.deleteMany({ where: { retiredBy: user.id } });
  await prisma.listing.deleteMany({ where: { id: listing.id } });
  await prisma.holding.deleteMany({ where: { id: holding.id } });
  await prisma.project.deleteMany({ where: { id: project.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.$disconnect();

  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
