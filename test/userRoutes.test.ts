import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

const users = vi.hoisted(() => ({
  listUsers: vi.fn(async () => []),
  createUserWithIssuedPassword: vi.fn(),
  updateUser: vi.fn(),
  resetPassword: vi.fn(),
  changeOwnPassword: vi.fn(),
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

let server: Server;
let base: string;
const token = jwt.sign({ userId: 'u1' }, jwtSecret());

const as = (role: string, mustChangePassword = false) => {
  dbUser.current = { id: 'u1', login: 'me', name: 'Me', role, active: true, mustChangePassword };
};

beforeEach(() => {
  vi.clearAllMocks();
  as('OWNER');
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

describe('user management API', () => {
  it('is available to the owner only', async () => {
    expect((await send('GET', '/users')).status).toBe(200);
    as('ADMIN');
    expect((await send('GET', '/users')).status).toBe(403);
    as('STAFF');
    expect((await send('POST', '/users', { login: 'x', name: 'X', role: 'STAFF' })).status).toBe(403);
  });

  it('creates a user and returns the issued password once', async () => {
    users.createUserWithIssuedPassword.mockResolvedValue({ id: 'n1', login: 'barista', password: 'p4ss-word-12' });
    const res = await send('POST', '/users', { login: ' Barista ', name: 'Бариста', role: 'STAFF' });
    expect(res.status).toBe(201);
    expect((await res.json()).password).toBe('p4ss-word-12');
    expect(users.createUserWithIssuedPassword).toHaveBeenCalledWith({ login: 'barista', name: 'Бариста', role: 'STAFF' }, 'u1');
  });

  it('validates login and role', async () => {
    expect((await send('POST', '/users', { login: 'с кириллицей', name: 'X', role: 'STAFF' })).status).toBe(400);
    expect((await send('POST', '/users', { login: 'x', name: 'X', role: 'ROOT' })).status).toBe(400);
  });

  it('resets a password', async () => {
    users.resetPassword.mockResolvedValue('n3w-p4ssword');
    const res = await send('POST', '/users/u2/reset-password');
    expect(await res.json()).toEqual({ password: 'n3w-p4ssword' });
  });
});

describe('forced password change', () => {
  it('locks the API except /me and /me/password', async () => {
    as('OWNER', true);
    const blocked = await send('GET', '/users');
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).code).toBe('MUST_CHANGE_PASSWORD');
    expect((await send('GET', '/me')).status).toBe(200);
    expect((await send('POST', '/me/password', { current: 'a', next: 'bbbbbbbb' })).status).toBe(200);
    expect(users.changeOwnPassword).toHaveBeenCalledWith('u1', 'a', 'bbbbbbbb');
  });

  it('reports the flag in /me', async () => {
    as('STAFF', true);
    expect(await (await send('GET', '/me')).json()).toMatchObject({ role: 'STAFF', mustChangePassword: true });
  });
});
