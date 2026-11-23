// Usage: npm run user:create -- <login> <password> [role] [name]
// role: a role name ("Владелец", "Администратор", "Сотрудник" or a custom one),
//       or the short aliases OWNER / ADMIN / STAFF. Default: Сотрудник.
import 'dotenv/config';
import { createUser, ensurePresetRoles } from '../src/auth/users';
import { prisma } from '../src/db';

const ALIASES: Record<string, string> = { OWNER: 'Владелец', ADMIN: 'Администратор', STAFF: 'Сотрудник' };

async function main() {
  const [login, password, roleArg = 'STAFF', ...nameParts] = process.argv.slice(2);
  if (!login || !password) {
    console.error('Usage: npm run user:create -- <login> <password> [role name | OWNER|ADMIN|STAFF] [name]');
    process.exit(1);
  }
  await ensurePresetRoles();
  const roleName = ALIASES[roleArg.toUpperCase()] ?? roleArg;
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) {
    const names = (await prisma.role.findMany({ select: { name: true } })).map(r => r.name);
    console.error(`Role "${roleName}" not found. Available: ${names.join(', ')}`);
    process.exit(1);
  }
  const user = await createUser({ login, password, roleId: role.id, name: nameParts.join(' ') });
  console.log(`Created user "${user.login}" with role "${user.role.name}"`);
}

main()
  .catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
