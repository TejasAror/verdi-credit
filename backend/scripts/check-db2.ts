import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const r = await p.$queryRaw<{ now: string }[]>`select now()`;
  const u = await p.user.count();
  console.log('DB_OK now=%s users=%d', r[0].now, u);
  await p.$disconnect();
})().catch(e => { console.log('DB_ERR', e.message); process.exit(1); });
