import 'dotenv/config';
import { createApp } from './app';
import { prisma } from './db';
import { jwtSecret } from './config';
import { ensureAdminBootstrap } from './auth/users';

async function main() {
  jwtSecret(); // fail fast in production without a secret
  await prisma.$connect();
  await ensureAdminBootstrap();

  const port = Number(process.env.PORT) || 3000;
  const server = createApp().listen(port, () => {
    console.log(`✅ Inventory running on http://localhost:${port}`);
  });

  const shutdown = () => {
    server.close(() => void prisma.$disconnect().then(() => process.exit(0)));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
