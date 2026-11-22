import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal in-memory prisma for the user-management rules.
type U = { id: string; login: string; name: string; role: 'OWNER' | 'ADMIN' | 'STAFF'; active: boolean; passwordHash: string; mustChangePassword: boolean };
const db = vi.hoisted(() => ({ users: [] as U[] }));

vi.mock('../src/db', () => {
  const user = {
    findUnique: vi.fn(async ({ where }: { where: { id?: string; login?: string } }) =>
      db.users.find(u => (where.id ? u.id === where.id : u.login === where.login)) ?? null),
    count: vi.fn(async ({ where }: { where: { role: string; active: boolean } }) =>
      db.users.filter(u => u.role === where.role && u.active === where.active).length),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<U> }) => {
      const u = db.users.find(x => x.id === where.id)!;
      Object.assign(u, data);
      return { ...u };
    }),
  };
  const tx = { user, auditLog: { create: vi.fn(async () => ({})) } };
  return { prisma: { ...tx, $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)) } };
});

import { updateUser, changeOwnPassword } from '../src/auth/users';
import bcrypt from 'bcryptjs';

const mk = (id: string, role: U['role'], active = true): U =>
  ({ id, login: id, name: id, role, active, passwordHash: '', mustChangePassword: false });

beforeEach(() => {
  db.users = [mk('owner', 'OWNER'), mk('admin', 'ADMIN'), mk('staff', 'STAFF')];
});

describe('updateUser protections', () => {
  it('owner cannot block themselves', async () => {
    await expect(updateUser('owner', { active: false }, 'owner')).rejects.toThrow('самого себя');
  });

  it('owner cannot change their own role', async () => {
    await expect(updateUser('owner', { role: 'ADMIN' }, 'owner')).rejects.toThrow('самому себе');
  });

  it('the last active owner cannot be demoted or blocked by another owner', async () => {
    db.users.push(mk('owner2', 'OWNER', false)); // blocked owner does not count
    await expect(updateUser('owner', { role: 'STAFF' }, 'owner2')).rejects.toThrow('хотя бы один активный владелец');
  });

  it('a second active owner can be demoted', async () => {
    db.users.push(mk('owner2', 'OWNER'));
    const updated = await updateUser('owner2', { role: 'ADMIN' }, 'owner');
    expect(updated.role).toBe('ADMIN');
  });

  it('blocks and renames other users', async () => {
    const updated = await updateUser('staff', { active: false, name: 'Бармен' }, 'owner');
    expect(updated).toMatchObject({ active: false, name: 'Бармен' });
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
