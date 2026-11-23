import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal in-memory prisma for the user and role rules.
type R = { id: string; name: string; isOwner: boolean; perms: string[] };
type U = { id: string; login: string; name: string; roleId: string; active: boolean; passwordHash: string; mustChangePassword: boolean };
const db = vi.hoisted(() => ({ users: [] as U[], roles: [] as R[] }));

vi.mock('../src/db', () => {
  const withRole = (u: U | undefined) => (u ? { ...u, role: db.roles.find(r => r.id === u.roleId)! } : null);
  const user = {
    findUnique: vi.fn(async ({ where }: { where: { id?: string; login?: string } }) =>
      withRole(db.users.find(u => (where.id ? u.id === where.id : u.login === where.login)))),
    count: vi.fn(async ({ where }: { where: { active: boolean; role: { isOwner: boolean } } }) =>
      db.users.filter(u => u.active === where.active && db.roles.find(r => r.id === u.roleId)!.isOwner === where.role.isOwner).length),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<U> }) => {
      const u = db.users.find(x => x.id === where.id)!;
      Object.assign(u, data);
      return withRole(u);
    }),
  };
  const role = {
    findUnique: vi.fn(async ({ where }: { where: { id?: string; name?: string } }) => {
      const r = db.roles.find(x => (where.id ? x.id === where.id : x.name === where.name));
      if (!r) return null;
      return {
        ...r,
        permissions: r.perms.map(permission => ({ permission })),
        _count: { users: db.users.filter(u => u.roleId === r.id).length },
      };
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => { db.roles = db.roles.filter(r => r.id !== where.id); }),
  };
  const tx = { user, role, auditLog: { create: vi.fn(async () => ({})) } };
  return { prisma: { ...tx, $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)) } };
});

import { updateUser, changeOwnPassword, updateRole, deleteRole } from '../src/auth/users';
import bcrypt from 'bcryptjs';

const mk = (id: string, roleId: string, active = true): U =>
  ({ id, login: id, name: id, roleId, active, passwordHash: '', mustChangePassword: false });

beforeEach(() => {
  db.roles = [
    { id: 'r-owner', name: 'Владелец', isOwner: true, perms: [] },
    { id: 'r-admin', name: 'Администратор', isOwner: false, perms: ['items.edit_name'] },
    { id: 'r-staff', name: 'Сотрудник', isOwner: false, perms: ['inventory.view'] },
    { id: 'r-empty', name: 'Пустая', isOwner: false, perms: [] },
  ];
  db.users = [mk('owner', 'r-owner'), mk('admin', 'r-admin'), mk('staff', 'r-staff')];
});

describe('updateUser protections', () => {
  it('owner cannot block themselves', async () => {
    await expect(updateUser('owner', { active: false }, 'owner')).rejects.toThrow('самого себя');
  });

  it('owner cannot change their own role', async () => {
    await expect(updateUser('owner', { roleId: 'r-admin' }, 'owner')).rejects.toThrow('самому себе');
  });

  it('the last active owner cannot be moved to another role', async () => {
    db.users.push(mk('owner2', 'r-owner', false)); // blocked owner does not count
    await expect(updateUser('owner', { roleId: 'r-staff' }, 'owner2')).rejects.toThrow('хотя бы один активный владелец');
  });

  it('a second active owner can be moved to another role', async () => {
    db.users.push(mk('owner2', 'r-owner'));
    const updated = await updateUser('owner2', { roleId: 'r-admin' }, 'owner');
    expect(updated?.role.name).toBe('Администратор');
  });

  it('rejects an unknown role', async () => {
    await expect(updateUser('staff', { roleId: 'nope' }, 'owner')).rejects.toThrow('Роль не найдена');
  });

  it('blocks and renames other users', async () => {
    const updated = await updateUser('staff', { active: false, name: 'Бармен' }, 'owner');
    expect(updated).toMatchObject({ active: false, name: 'Бармен' });
  });
});

describe('role protections', () => {
  it('the owner role cannot be edited or deleted', async () => {
    await expect(updateRole('r-owner', { permissions: [] }, 'owner')).rejects.toThrow('владельца нельзя изменить');
    await expect(deleteRole('r-owner', 'owner')).rejects.toThrow('владельца нельзя удалить');
  });

  it('a role with users cannot be deleted; an empty one can', async () => {
    await expect(deleteRole('r-staff', 'owner')).rejects.toThrow('назначьте им другую роль');
    await deleteRole('r-empty', 'owner');
    expect(db.roles.find(r => r.id === 'r-empty')).toBeUndefined();
  });

  it('rejects permissions that are not in the catalog', async () => {
    await expect(updateRole('r-staff', { permissions: ['inventory.view', 'root.everything'] }, 'owner'))
      .rejects.toThrow('Неизвестные права');
  });
});

describe('changeOwnPassword', () => {
  it('checks the current password, length, and clears the forced-change flag', async () => {
    db.users[2].passwordHash = await bcrypt.hash('temporary1', 4);
    db.users[2].mustChangePassword = true;
    await expect(changeOwnPassword('staff', 'wrong', 'newpassword')).rejects.toThrow('неверно');
    await expect(changeOwnPassword('staff', 'temporary1', 'short')).rejects.toThrow('не короче');
    await expect(changeOwnPassword('staff', 'temporary1', 'temporary1')).rejects.toThrow('отличаться');
    await changeOwnPassword('staff', 'temporary1', 'newpassword');
    expect(db.users[2].mustChangePassword).toBe(false);
    expect(await bcrypt.compare('newpassword', db.users[2].passwordHash)).toBe(true);
  });
});
