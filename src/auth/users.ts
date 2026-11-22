import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { Role } from '@prisma/client';
import { prisma } from '../db';
import { conflict, HttpError, notFound } from '../http/errors';
import { writeAudit } from '../audit/audit';

const BCRYPT_COST = 10;
export const MIN_PASSWORD_LENGTH = 8;

const publicUser = {
  id: true, login: true, name: true, role: true, active: true,
  mustChangePassword: true, lastLoginAt: true, createdAt: true,
} as const;

const badRequest = (msg: string) => new HttpError(400, msg);

// 9 random bytes → 12 base64url chars, no ambiguous separators.
export function generatePassword(): string {
  return crypto.randomBytes(9).toString('base64url');
}

function assertPasswordLength(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw badRequest(`Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`);
  }
}

// Used by the CLI script and the startup bootstrap.
export async function createUser(input: {
  login: string; password: string; name?: string; role: Role; mustChangePassword?: boolean;
}) {
  const login = input.login.trim().toLowerCase();
  if (!login) throw badRequest('Укажите логин');
  assertPasswordLength(input.password);
  if (await prisma.user.findUnique({ where: { login } })) throw conflict('Такой логин уже занят');
  return prisma.user.create({
    data: {
      login,
      name: input.name?.trim() || login,
      role: input.role,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_COST),
      mustChangePassword: input.mustChangePassword ?? false,
    },
    select: publicUser,
  });
}

// Idempotent: creates the owner only on an empty users table.
export async function ensureAdminBootstrap(): Promise<void> {
  if ((await prisma.user.count()) > 0) return;

  const login = process.env.ADMIN_LOGIN || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.warn('⚠️  ADMIN_PASSWORD is not set — no owner created. Set it and restart.');
    return;
  }
  // The env password is known to whoever deployed the app — ask for a new one on first login.
  await createUser({ login, password, name: 'Владелец', role: 'OWNER', mustChangePassword: true });
  console.log(`✅ Created owner "${login}" (must change password on first login)`);
}

export async function listUsers() {
  return prisma.user.findMany({ orderBy: { createdAt: 'asc' }, select: publicUser });
}

// Owner issues the start password; it is returned once and only its hash is stored.
export async function createUserWithIssuedPassword(
  input: { login: string; name: string; role: Role },
  actorId: string,
) {
  const password = generatePassword();
  const user = await createUser({ ...input, password, mustChangePassword: true });
  await writeAudit(prisma, {
    userId: actorId, action: 'user.create', entity: 'user', entityId: user.id,
    after: { login: user.login, name: user.name, role: user.role },
  });
  return { ...user, password };
}

// actorId guards against locking yourself out: nobody would be left to undo it.
export async function updateUser(
  id: string,
  patch: { name?: string; role?: Role; active?: boolean },
  actorId: string,
) {
  return prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id } });
    if (!user) throw notFound('Пользователь не найден');

    if (id === actorId && patch.active === false) throw conflict('Нельзя заблокировать самого себя');
    if (id === actorId && patch.role && patch.role !== user.role) throw conflict('Нельзя сменить роль самому себе');

    const losingOwner = user.role === 'OWNER' && user.active &&
      (patch.active === false || (patch.role !== undefined && patch.role !== 'OWNER'));
    if (losingOwner) {
      const activeOwners = await tx.user.count({ where: { role: 'OWNER', active: true } });
      if (activeOwners <= 1) throw conflict('В системе должен остаться хотя бы один активный владелец');
    }

    const data: { name?: string; role?: Role; active?: boolean } = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.role !== undefined) data.role = patch.role;
    if (patch.active !== undefined) data.active = patch.active;

    const updated = await tx.user.update({ where: { id }, data, select: publicUser });
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const key of Object.keys(data) as Array<keyof typeof data>) {
      if (user[key] !== updated[key]) { before[key] = user[key]; after[key] = updated[key]; }
    }
    if (Object.keys(after).length) {
      await writeAudit(tx, { userId: actorId, action: 'user.update', entity: 'user', entityId: id, before, after });
    }
    return updated;
  });
}

// Returns the new password once; the user must change it on next login.
export async function resetPassword(id: string, actorId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound('Пользователь не найден');
  const password = generatePassword();
  await prisma.$transaction(async tx => {
    await tx.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, BCRYPT_COST), mustChangePassword: true },
    });
    await writeAudit(tx, { userId: actorId, action: 'user.reset_password', entity: 'user', entityId: id });
  });
  return password;
}

export async function changeOwnPassword(id: string, current: string, next: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound('Пользователь не найден');
  assertPasswordLength(next);
  if (!(await bcrypt.compare(current, user.passwordHash))) throw badRequest('Текущий пароль указан неверно');
  if (current === next) throw badRequest('Новый пароль должен отличаться от текущего');
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(next, BCRYPT_COST), mustChangePassword: false },
  });
}
