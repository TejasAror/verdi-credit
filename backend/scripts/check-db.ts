import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.$queryRaw`select 1`.then(async () => {
  const u = await p.user.count();
  const h = await p.holding.count();
  const l = await p.listing.count();
  const r = await p.retirement.count();
  const pr = await p.project.count();
  console.log('DB_OK users=%d holdings=%d listings=%d retirements=%d projects=%d', u, h, l, r, pr);
  await p.$disconnect();
}).catch(e => { console.log('DB_ERR', e.message); process.exit(0); });
