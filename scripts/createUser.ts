// Usage: npm run user:create -- <login> <password> [OWNER|ADMIN|STAFF] [name]
import 'dotenv/config';
import { createUser } from '../src/auth/users';
import { prisma } from '../src/db';

async function main() {
  const [login, password, roleArg = 'STAFF', ...nameParts] = process.argv.slice(2);
  if (!login || !password) {
    console.error('Usage: npm run user:create -- <login> <password> [OWNER|ADMIN|STAFF] [name]');
    process.exit(1);
  }
  const role = roleArg.toUpperCase();
  if (role !== 'OWNER' && role !== 'ADMIN' && role !== 'STAFF') {
    console.error('Role must be OWNER, ADMIN or STAFF');
    process.exit(1);
  }
  const user = await createUser({ login, password, role, name: nameParts.join(' ') });
  console.log(`Created ${user.role} user "${user.login}"`);
}

main()
  .catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
