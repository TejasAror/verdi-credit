import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Raw query to confirm the tables + enums exist in Supabase.
  const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('User','Project')`,
  );
  console.log('Tables present:', tables.map((t) => t.table_name).join(', ') || '(none)');

  const enums = await prisma.$queryRawUnsafe<{ typname: string }[]>(
    `SELECT typname FROM pg_type WHERE typtype = 'e'
     AND typname IN ('Role','ProjectType','ProjectStatus')`,
  );
  console.log('Enums present:', enums.map((e) => e.typname).join(', ') || '(none)');

  const userCount = await prisma.user.count();
  const projectCount = await prisma.project.count();
  console.log(`Row counts -> users: ${userCount}, projects: ${projectCount}`);
}

main()
  .catch((e) => {
    console.error('DB check failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
