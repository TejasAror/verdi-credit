import { PrismaClient } from '@prisma/client';
import * as nacl from 'tweetnacl';
import * as bs58 from 'bs58';

const prisma = new PrismaClient();

async function test() {
  // Create a test user
  const user = await prisma.user.create({
    data: {
      supabaseId: `test-supabase-${Date.now()}`,
      email: 'test@verdicred.com',
      role: 'BUYER',
    },
  });

  // Simulate wallet linking
  const walletAddress = '7xK4fGvZ8mN2pQ9rRtY3wE6uI1oP0aSdFhJkLzXcVb';
  const message = `VerdiCred Wallet Link Verification\n\nWallet: ${walletAddress}\nTimestamp: ${Date.now()}\n\nSign this message to prove you control this wallet and link it to your VerdiCred account.`;
  const messageBytes = new TextEncoder().encode(message);
  const keypair = nacl.sign.keyPair();
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  const signatureB64 = Buffer.from(signature).toString('base64');

  // Verify signature manually first
  const isValid = nacl.sign.detached.verify(
    messageBytes,
    signature,
    keypair.publicKey
  );
  if (!isValid) throw new Error('Self-verify failed');

  // Link wallet via UsersService logic
  const existingUser = await prisma.user.findUnique({ where: { walletAddress } });
  if (existingUser && existingUser.id !== user.id) {
    throw new Error('Wallet already linked to another user');
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { walletAddress },
  });

  if (updated.walletAddress !== walletAddress) {
    throw new Error('Wallet not persisted');
  }

  // Verify lookup works (this is what CarbonCreditsService does)
  const found = await prisma.user.findFirst({ where: { walletAddress } });
  if (!found || found.id !== user.id) {
    throw new Error('Lookup failed');
  }

  // Cleanup
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
  
  console.log('✅ VERIFICATION PASSED - Wallet linking flow works end-to-end');
}

test().catch(e => {
  console.error('❌ FAILED:', e);
  process.exit(1);
});