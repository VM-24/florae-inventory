// Deletes all inventory data: monthly counts, items, categories and the change log.
// Users are kept so you can still log in. Uploaded photo files are left on disk.
// Usage: npm run db:clear -- --yes
import 'dotenv/config';
import { prisma } from '../src/db';

async function main() {
  if (!process.argv.includes('--yes')) {
    console.error('This deletes all items, counts, categories and the change log. Re-run with --yes to confirm.');
    process.exit(1);
  }
  const [counts, items, categories, logs] = await prisma.$transaction([
    prisma.monthlyCount.deleteMany(),
    prisma.item.deleteMany(),
    prisma.category.deleteMany(),
    prisma.auditLog.deleteMany(),
  ]);
  console.log(
    `🧹 Deleted ${items.count} items, ${counts.count} monthly counts, ` +
    `${categories.count} categories, ${logs.count} log entries. Users kept.`,
  );
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
