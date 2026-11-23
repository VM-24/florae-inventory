import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

const users = vi.hoisted(() => ({
  listUsers: vi.fn(async () => []),
  listRoles: vi.fn(async () => []),
  createUserWithIssuedPassword: vi.fn(),
  updateUser: vi.fn(),
  resetPassword: vi.fn(),
  changeOwnPassword: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
}));
const dbUser = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));

vi.mock('../src/auth/users', () => users);
vi.mock('../src/db', () => ({
  prisma: { user: { findUnique: vi.fn(async () => dbUser.current), update: vi.fn() } },
}));

import { requireAuth } from '../src/auth/middleware';
import { meRouter, userRouter } from '../src/auth/routes';
import { errorHandler } from '../src/http/errors';
import { jwtSecret } from '../src/config';
import { ALL_PERMISSIONS } from '../src/auth/permissions';

let server: Server;
let base: string;
const token = jwt.sign({ userId: 'u1' }, jwtSecret());
const ROLE_ID = '00000000-0000-4000-a000-000000000003';

// The signed-in user as requireAuth loads it: role with its permission rows.
const as = (role: { isOwner?: boolean; permissions?: string[] }, mustChangePassword = false) => {
  dbUser.current = {
    id: 'u1', login: 'me', name: 'Me', active: true, mustChangePassword,
    role: {
      id: 'r1', name: role.isOwner ? 'Владелец' : 'Тест', isOwner: Boolean(role.isOwner),
      permissions: (role.permissions ?? []).map(permission => ({ permission })),
    },
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  as({ isOwner: true });
  const app = express();
  app.use(express.json());
  app.use('/api', requireAuth, meRouter, userRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterEach(() => server.close());

const send = (method: string, path: string, body?: unknown) =>
  fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('permissions', () => {
  it('the owner role has the whole catalog', async () => {
    const me = await (await send('GET', '/me')).json();
    expect(me.permissions).toEqual([...ALL_PERMISSIONS].sort());
    expect(me.role).toMatchObject({ isOwner: true });
  });

  it('users.manage is needed for users, roles.manage for editing roles', async () => {
    as({ permissions: ['inventory.view'] });
    expect((await send('GET', '/users')).status).toBe(403);
    expect((await send('GET', '/roles')).status).toBe(403);

    as({ permissions: ['users.manage'] });
    expect((await send('GET', '/users')).status).toBe(200);
    expect((await send('GET', '/roles')).status).toBe(200); // to pick a role for a user
    expect((await send('POST', '/roles', { name: 'X', permissions: [] })).status).toBe(403);

    as({ permissions: ['roles.manage'] });
    users.createRole.mockResolvedValue({ id: 'r9' });
    expect((await send('POST', '/roles', { name: 'Кассир', permissions: ['inventory.view'] })).status).toBe(201);
    expect((await send('GET', '/users')).status).toBe(403);
  });
});

describe('user management API', () => {
  it('creates a user and returns the issued password once', async () => {
    users.createUserWithIssuedPassword.mockResolvedValue({ id: 'n1', login: 'barista', password: 'p4ss-word-12' });
    const res = await send('POST', '/users', { login: ' Barista ', name: 'Бариста', roleId: ROLE_ID });
    expect(res.status).toBe(201);
    expect((await res.json()).password).toBe('p4ss-word-12');
    expect(users.createUserWithIssuedPassword).toHaveBeenCalledWith({ login: 'barista', name: 'Бариста', roleId: ROLE_ID }, 'u1');
  });

  it('validates login and role id', async () => {
    expect((await send('POST', '/users', { login: 'с кириллицей', name: 'X', roleId: ROLE_ID })).status).toBe(400);
    expect((await send('POST', '/users', { login: 'x', name: 'X', roleId: 'STAFF' })).status).toBe(400);
  });

  it('resets a password', async () => {
    users.resetPassword.mockResolvedValue('n3w-p4ssword');
    const res = await send('POST', '/users/u2/reset-password');
    expect(await res.json()).toEqual({ password: 'n3w-p4ssword' });
  });
});

describe('forced password change', () => {
  it('locks the API except /me and /me/password', async () => {
    as({ isOwner: true }, true);
    const blocked = await send('GET', '/users');
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).code).toBe('MUST_CHANGE_PASSWORD');
    expect((await send('GET', '/me')).status).toBe(200);
    expect((await send('POST', '/me/password', { current: 'a', next: 'bbbbbbbb' })).status).toBe(200);
    expect(users.changeOwnPassword).toHaveBeenCalledWith('u1', 'a', 'bbbbbbbb');
  });

  it('reports the flag and permissions in /me', async () => {
    as({ permissions: ['inventory.view', 'inventory.count'] }, true);
    expect(await (await send('GET', '/me')).json()).toMatchObject({
      mustChangePassword: true, permissions: ['inventory.count', 'inventory.view'],
    });
  });
});
