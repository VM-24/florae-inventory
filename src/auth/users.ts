import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../db';
import { conflict, HttpError, notFound } from '../http/errors';
import { writeAudit } from '../audit/audit';
import { ALL_PERMISSIONS, isKnownPermission, OWNER_ROLE_NAME, PRESET_ROLES } from './permissions';

const BCRYPT_COST = 10;
export const MIN_PASSWORD_LENGTH = 8;

const publicUser = {
  id: true, login: true, name: true, active: true,
  mustChangePassword: true, lastLoginAt: true, createdAt: true,
  role: { select: { id: true, name: true, isOwner: true } },
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

// ---------------------------------------------------------------- roles

// Idempotent: creates missing preset roles, never touches existing ones (the owner may have edited them).
export async function ensurePresetRoles() {
  for (const preset of PRESET_ROLES) {
    await prisma.role.upsert({
      where: { name: preset.name },
      update: {},
      create: {
        name: preset.name,
        isOwner: preset.isOwner,
        permissions: { create: preset.permissions.map(permission => ({ permission })) },
      },
    });
  }
}

export async function listRoles() {
  const roles = await prisma.role.findMany({
    orderBy: [{ isOwner: 'desc' }, { createdAt: 'asc' }],
    include: { permissions: true, _count: { select: { users: true } } },
  });
  return roles.map(r => ({
    id: r.id,
    name: r.name,
    isOwner: r.isOwner,
    userCount: r._count.users,
    permissions: r.isOwner ? ALL_PERMISSIONS : r.permissions.map(p => p.permission).sort(),
  }));
}

function cleanPermissions(permissions: string[]) {
  const unknown = permissions.filter(p => !isKnownPermission(p));
  if (unknown.length) throw badRequest(`Неизвестные права: ${unknown.join(', ')}`);
  return [...new Set(permissions)];
}

export async function createRole(input: { name: string; permissions: string[] }, actorId: string) {
  const permissions = cleanPermissions(input.permissions);
  if (await prisma.role.findUnique({ where: { name: input.name } })) throw conflict('Роль с таким названием уже есть');
  return prisma.$transaction(async tx => {
    const role = await tx.role.create({
      data: { name: input.name, permissions: { create: permissions.map(permission => ({ permission })) } },
    });
    await writeAudit(tx, {
      userId: actorId, action: 'role.create', entity: 'role', entityId: role.id,
      after: { name: role.name, permissions },
    });
    return role;
  });
}

export async function updateRole(id: string, patch: { name?: string; permissions?: string[] }, actorId: string) {
  const role = await prisma.role.findUnique({ where: { id }, include: { permissions: true } });
  if (!role) throw notFound('Роль не найдена');
  if (role.isOwner) throw conflict('Роль владельца нельзя изменить: у неё всегда все права');
  const permissions = patch.permissions ? cleanPermissions(patch.permissions) : undefined;
  if (patch.name && patch.name !== role.name && (await prisma.role.findUnique({ where: { name: patch.name } }))) {
    throw conflict('Роль с таким названием уже есть');
  }

  return prisma.$transaction(async tx => {
    if (patch.name !== undefined) await tx.role.update({ where: { id }, data: { name: patch.name } });
    if (permissions) {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({ data: permissions.map(permission => ({ roleId: id, permission })) });
    }
    const beforePerms = role.permissions.map(p => p.permission).sort();
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    if (patch.name !== undefined && patch.name !== role.name) { before.name = role.name; after.name = patch.name; }
    if (permissions && JSON.stringify(beforePerms) !== JSON.stringify([...permissions].sort())) {
      before.permissions = beforePerms;
      after.permissions = [...permissions].sort();
    }
    if (Object.keys(after).length) {
      await writeAudit(tx, { userId: actorId, action: 'role.update', entity: 'role', entityId: id, before, after });
    }
    return tx.role.findUniqueOrThrow({ where: { id } });
  });
}

export async function deleteRole(id: string, actorId: string) {
  const role = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!role) throw notFound('Роль не найдена');
  if (role.isOwner) throw conflict('Роль владельца нельзя удалить');
  if (role._count.users > 0) {
    throw conflict(`У роли ${role._count.users} польз. — сначала назначьте им другую роль`);
  }
  await prisma.$transaction(async tx => {
    await tx.role.delete({ where: { id } });
    await writeAudit(tx, { userId: actorId, action: 'role.delete', entity: 'role', entityId: id, before: { name: role.name } });
  });
}

// ---------------------------------------------------------------- users

async function roleById(roleId: string) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw badRequest('Роль не найдена');
  return role;
}

// Used by the CLI script and the startup bootstrap.
export async function createUser(input: {
  login: string; password: string; name?: string; roleId: string; mustChangePassword?: boolean;
}) {
  const login = input.login.trim().toLowerCase();
  if (!login) throw badRequest('Укажите логин');
  assertPasswordLength(input.password);
  await roleById(input.roleId);
  if (await prisma.user.findUnique({ where: { login } })) throw conflict('Такой логин уже занят');
  return prisma.user.create({
    data: {
      login,
      name: input.name?.trim() || login,
      roleId: input.roleId,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_COST),
      mustChangePassword: input.mustChangePassword ?? false,
    },
    select: publicUser,
  });
}

// Idempotent: preset roles always; the owner only on an empty users table.
export async function ensureAdminBootstrap(): Promise<void> {
  await ensurePresetRoles();
  if ((await prisma.user.count()) > 0) return;

  const login = process.env.ADMIN_LOGIN || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.warn('⚠️  ADMIN_PASSWORD is not set — no owner created. Set it and restart.');
    return;
  }
  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { name: OWNER_ROLE_NAME } });
  // The env password is known to whoever deployed the app — ask for a new one on first login.
  await createUser({ login, password, name: 'Владелец', roleId: ownerRole.id, mustChangePassword: true });
  console.log(`✅ Created owner "${login}" (must change password on first login)`);
}

export async function listUsers() {
  return prisma.user.findMany({ orderBy: { createdAt: 'asc' }, select: publicUser });
}

// The start password is generated here and returned once; only its hash is stored.
export async function createUserWithIssuedPassword(
  input: { login: string; name: string; roleId: string },
  actorId: string,
) {
  const password = generatePassword();
  const user = await createUser({ ...input, password, mustChangePassword: true });
  await writeAudit(prisma, {
    userId: actorId, action: 'user.create', entity: 'user', entityId: user.id,
    after: { login: user.login, name: user.name, role: user.role.name },
  });
  return { ...user, password };
}

// actorId guards against locking yourself out: nobody would be left to undo it.
export async function updateUser(
  id: string,
  patch: { name?: string; roleId?: string; active?: boolean },
  actorId: string,
) {
  return prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id }, include: { role: true } });
    if (!user) throw notFound('Пользователь не найден');

    if (id === actorId && patch.active === false) throw conflict('Нельзя заблокировать самого себя');
    if (id === actorId && patch.roleId && patch.roleId !== user.roleId) throw conflict('Нельзя сменить роль самому себе');

    const newRole = patch.roleId && patch.roleId !== user.roleId
      ? await tx.role.findUnique({ where: { id: patch.roleId } })
      : null;
    if (patch.roleId && patch.roleId !== user.roleId && !newRole) throw badRequest('Роль не найдена');

    const losingOwner = user.role.isOwner && user.active &&
      (patch.active === false || (newRole !== null && !newRole.isOwner));
    if (losingOwner) {
      const activeOwners = await tx.user.count({ where: { active: true, role: { isOwner: true } } });
      if (activeOwners <= 1) throw conflict('В системе должен остаться хотя бы один активный владелец');
    }

    const data: { name?: string; roleId?: string; active?: boolean } = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.roleId !== undefined) data.roleId = patch.roleId;
    if (patch.active !== undefined) data.active = patch.active;

    const updated = await tx.user.update({ where: { id }, data, select: publicUser });
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    if (data.name !== undefined && user.name !== updated.name) { before.name = user.name; after.name = updated.name; }
    if (data.active !== undefined && user.active !== updated.active) { before.active = user.active; after.active = updated.active; }
    if (newRole) { before.role = user.role.name; after.role = newRole.name; }
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
