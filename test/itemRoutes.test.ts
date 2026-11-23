import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { PRESET_ROLES } from '../src/auth/permissions';

const repo = vi.hoisted(() => ({
  listItems: vi.fn(),
  listMonths: vi.fn(),
  getItem: vi.fn(),
  itemHistory: vi.fn(),
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  addPhotos: vi.fn(),
  deletePhoto: vi.fn(),
  setCoverPhoto: vi.fn(),
  upsertCount: vi.fn(),
  deleteCount: vi.fn(),
}));
const files = vi.hoisted(() => {
  let n = 0;
  return {
    saveImage: vi.fn(async (_buf: Buffer, ext: string) => `/uploads/test-${++n}.${ext}`),
    deleteImage: vi.fn(async () => {}),
  };
});
vi.mock('../src/items/repository', () => repo);
vi.mock('../src/db', () => ({ prisma: {} }));
vi.mock('../src/storage/files', async importOriginal => ({
  ...(await importOriginal<typeof import('../src/storage/files')>()),
  ...files,
}));

import { itemRouter } from '../src/items/routes';
import { errorHandler, conflict } from '../src/http/errors';

const CATEGORY = '0b0f1a52-6a4c-4a7e-9a5e-2d1f2b3c4d5e';
const JAN_2026 = new Date('2026-01-01T00:00:00Z');

let server: Server;
let base: string;
// Permission sets of the preset roles; tests switch between them.
const ADMIN = PRESET_ROLES.find(r => r.name === 'Администратор')!.permissions;
const STAFF = PRESET_ROLES.find(r => r.name === 'Сотрудник')!.permissions;
let permissions: string[];

beforeEach(() => {
  vi.clearAllMocks();
  permissions = ADMIN;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = {
      userId: 'u1', login: 'test', name: 'Test', roleId: 'r1', roleName: 'Test', isOwner: false,
      permissions: new Set(permissions), mustChangePassword: false,
    };
    next();
  });
  app.use('/api', itemRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterEach(() => server.close());

const send = (method: string, path: string, body?: unknown) =>
  fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('items API', () => {
  it('lists active items by default', async () => {
    repo.listItems.mockResolvedValue([]);
    const res = await send('GET', '/items');
    expect(res.status).toBe(200);
    expect(repo.listItems).toHaveBeenCalledWith({ status: 'active' });
  });

  it('lists items for a given month', async () => {
    repo.listItems.mockResolvedValue([]);
    await send('GET', '/items?month=2026-01');
    expect(repo.listItems).toHaveBeenCalledWith({ status: 'active', month: JAN_2026 });
  });

  it('rejects a malformed month', async () => {
    const res = await send('GET', '/items?month=2026-13');
    expect(res.status).toBe(400);
  });

  it('creates an item as admin', async () => {
    repo.createItem.mockResolvedValue({ id: 'i1' });
    const res = await send('POST', '/items', { categoryId: CATEGORY, name: 'Рокс', unitPrice: 25 });
    expect(res.status).toBe(201);
    expect(repo.createItem).toHaveBeenCalledWith(expect.objectContaining({ name: 'Рокс', unitPrice: 25 }), 'u1');
  });

  it('returns 400 with the field name on invalid input', async () => {
    const res = await send('POST', '/items', { categoryId: CATEGORY, name: '' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^name:/);
    expect(repo.createItem).not.toHaveBeenCalled();
  });

  it('forbids staff from creating or editing catalog data', async () => {
    permissions = STAFF;
    expect((await send('POST', '/items', { categoryId: CATEGORY, name: 'Рокс' })).status).toBe(403);
    expect((await send('PATCH', '/items/i1', { unitPrice: 1 })).status).toBe(403);
    expect(repo.updateItem).not.toHaveBeenCalled();
  });

  it('lets staff enter a monthly count', async () => {
    permissions = STAFF;
    repo.upsertCount.mockResolvedValue({ month: '2026-01' });
    const res = await send('PUT', '/items/i1/counts/2026-01', { currentQty: 10, brokenQty: 2 });
    expect(res.status).toBe(200);
    expect(repo.upsertCount).toHaveBeenCalledWith('i1', JAN_2026, { currentQty: 10, brokenQty: 2 }, 'u1');
  });

  it('rejects catalog fields in a count', async () => {
    const res = await send('PUT', '/items/i1/counts/2026-01', { unitPrice: 5 });
    expect(res.status).toBe(400);
  });

  it('only admins delete a monthly count', async () => {
    permissions = STAFF;
    expect((await send('DELETE', '/items/i1/counts/2026-01')).status).toBe(403);
    permissions = ADMIN;
    repo.deleteCount.mockResolvedValue(undefined);
    expect((await send('DELETE', '/items/i1/counts/2026-01')).status).toBe(204);
  });

  const upload = (parts: Array<[string, string]>) => {
    const form = new FormData();
    for (const [name, type] of parts) form.append('photos', new Blob(['x'], { type }), name);
    return fetch(`${base}/api/items/i1/photos`, { method: 'POST', body: form });
  };

  it('uploads several photos in one request', async () => {
    repo.addPhotos.mockResolvedValue([{ id: 'p1', url: '/uploads/a.jpg' }]);
    const res = await upload([['a.jpg', 'image/jpeg'], ['b.png', 'image/png']]);
    expect(res.status).toBe(201);
    const [, urls] = repo.addPhotos.mock.calls[0];
    expect(urls).toHaveLength(2);
    expect(urls[0]).toMatch(/\.jpg$/);
    expect(urls[1]).toMatch(/\.png$/);
  });

  it('rejects the whole upload if any file is not an image, saving nothing', async () => {
    const res = await upload([['a.jpg', 'image/jpeg'], ['doc.pdf', 'application/pdf']]);
    expect(res.status).toBe(415);
    expect(files.saveImage).not.toHaveBeenCalled();
    expect(repo.addPhotos).not.toHaveBeenCalled();
  });

  it('removes saved files when the database step fails', async () => {
    repo.addPhotos.mockRejectedValue(conflict('Не больше 20 фото'));
    const res = await upload([['a.jpg', 'image/jpeg']]);
    expect(res.status).toBe(409);
    expect(files.deleteImage).toHaveBeenCalledTimes(1);
  });

  it('deletes a photo and sets a cover', async () => {
    repo.deletePhoto.mockResolvedValue([]);
    repo.setCoverPhoto.mockResolvedValue([]);
    expect((await send('DELETE', '/items/i1/photos/p1')).status).toBe(200);
    expect((await send('POST', '/items/i1/photos/p2/cover')).status).toBe(200);
    expect(repo.setCoverPhoto).toHaveBeenCalledWith('i1', 'p2', 'u1');
  });

  it('checks permissions field by field on PATCH', async () => {
    repo.updateItem.mockResolvedValue({ id: 'i1' });
    permissions = ['inventory.view', 'items.edit_name', 'items.edit_sku'];
    expect((await send('PATCH', '/items/i1', { name: 'Новое', sku: 'A1' })).status).toBe(200);
    expect((await send('PATCH', '/items/i1', { name: 'Новое', unitPrice: 5 })).status).toBe(403);
    // each card field is its own permission
    expect((await send('PATCH', '/items/i1', { description: 'x' })).status).toBe(403);
    expect((await send('PATCH', '/items/i1', { unit: 'кг' })).status).toBe(403);
    expect((await send('PATCH', '/items/i1', { categoryId: CATEGORY })).status).toBe(403);
    expect((await send('PATCH', '/items/i1', { archived: true })).status).toBe(403);
    permissions = ['items.archive'];
    expect((await send('PATCH', '/items/i1', { archived: true })).status).toBe(200);
  });

  it('needs inventory.view or inventory.count to read the list', async () => {
    permissions = ['inventory.photos'];
    expect((await send('GET', '/items')).status).toBe(403);
  });

  it('a count-only role reads the list and changes quantities — nothing else', async () => {
    permissions = ['inventory.count'];
    repo.listItems.mockResolvedValue([]);
    repo.getItem.mockResolvedValue({ id: 'i1' });
    repo.upsertCount.mockResolvedValue({ month: '2026-01' });
    expect((await send('GET', '/items')).status).toBe(200);
    expect((await send('GET', '/items/i1')).status).toBe(200);
    expect((await send('PUT', '/items/i1/counts/2026-01', { currentQty: 3 })).status).toBe(200);
    // everything else is closed
    expect((await send('GET', '/items/i1/history')).status).toBe(403);
    expect((await send('PATCH', '/items/i1', { name: 'X' })).status).toBe(403);
    expect((await send('PATCH', '/items/i1', { archived: true })).status).toBe(403);
    expect((await send('POST', '/items', { categoryId: CATEGORY, name: 'Y' })).status).toBe(403);
    expect((await send('DELETE', '/items/i1')).status).toBe(403);
    expect((await send('DELETE', '/items/i1/counts/2026-01')).status).toBe(403);
    expect((await send('DELETE', '/items/i1/photos/p1')).status).toBe(403);
  });

  it('needs inventory.photos to manage photos', async () => {
    permissions = ['inventory.view'];
    expect((await send('DELETE', '/items/i1/photos/p1')).status).toBe(403);
  });

  it('maps repository conflicts to 409', async () => {
    repo.deleteItem.mockRejectedValue(conflict('Сначала переместите позицию в архив'));
    const res = await send('DELETE', '/items/i1');
    expect(res.status).toBe(409);
  });
});
