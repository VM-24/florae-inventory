import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requirePermission } from '../auth/middleware';
import { asyncHandler } from '../http/errors';

const PAGE = 50;

const querySchema = z.object({
  userId: z.string().uuid().optional(),
  entity: z.enum(['item', 'category', 'user', 'role']).optional(),
  // Cursor = createdAt of the last row of the previous page (ISO) + its id, joined by "_".
  cursor: z.string().regex(/^[^_]+_[0-9a-f-]{36}$/).optional(),
});

export const auditRouter = Router();

// Journal of all changes: who, when, what — newest first, paged by cursor.
auditRouter.get('/audit', requirePermission('audit.view'), asyncHandler(async (req, res) => {
  const q = querySchema.parse(req.query);
  const where: Record<string, unknown> = {};
  if (q.userId) where.userId = q.userId;
  if (q.entity) where.entity = q.entity;
  if (q.cursor) {
    const [iso, id] = q.cursor.split('_');
    const at = new Date(iso);
    where.OR = [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: id } }];
  }

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE + 1,
    select: {
      id: true, action: true, entity: true, entityId: true, before: true, after: true, createdAt: true,
      user: { select: { id: true, name: true, login: true } },
    },
  });
  const page = rows.slice(0, PAGE);
  const last = page[page.length - 1];
  const nextCursor = rows.length > PAGE && last ? `${last.createdAt.toISOString()}_${last.id}` : null;

  res.json({ items: await withTitles(page), nextCursor });
}));

type Row = { entity: string; entityId: string | null; before: unknown; after: unknown };

// Human title of the changed object. Deleted objects fall back to the name stored in the entry.
async function withTitles<T extends Row>(rows: T[]) {
  const ids = (entity: string) => [...new Set(rows.filter(r => r.entity === entity && r.entityId).map(r => r.entityId!))];
  const [items, categories, users, roles] = await Promise.all([
    prisma.item.findMany({ where: { id: { in: ids('item') } }, select: { id: true, name: true, sku: true } }),
    prisma.category.findMany({ where: { id: { in: ids('category') } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: ids('user') } }, select: { id: true, name: true, login: true } }),
    prisma.role.findMany({ where: { id: { in: ids('role') } }, select: { id: true, name: true } }),
  ]);
  const titles = new Map<string, string>([
    ...items.map(i => [i.id, i.sku ? `${i.sku} · ${i.name}` : i.name] as [string, string]),
    ...categories.map(c => [c.id, c.name] as [string, string]),
    ...users.map(u => [u.id, `${u.name} (${u.login})`] as [string, string]),
    ...roles.map(r => [r.id, r.name] as [string, string]),
  ]);
  const stored = (r: Row) => {
    for (const side of [r.after, r.before]) {
      const name = side && typeof side === 'object' ? (side as { name?: unknown }).name : undefined;
      if (typeof name === 'string') return name;
    }
    return null;
  };
  return rows.map(r => ({
    ...r,
    entityTitle: (r.entityId && titles.get(r.entityId)) ?? stored(r),
    entityExists: Boolean(r.entityId && titles.has(r.entityId)),
  }));
}
