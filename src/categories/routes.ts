import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requirePermission } from '../auth/middleware';
import { asyncHandler, conflict, notFound } from '../http/errors';
import { diff, writeAudit } from '../audit/audit';

const categorySchema = z.object({
  name: z.string().trim().min(1, 'обязательно').max(100),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
}).strict();

const updateCategorySchema = categorySchema.partial().strict();

function duplicateGuard(err: unknown): never {
  if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
    throw conflict('Категория с таким названием уже существует');
  }
  throw err;
}

export const categoryRouter = Router();

// The list's category filter needs it too, hence inventory.count.
categoryRouter.get('/categories', requirePermission('inventory.view', 'inventory.count', 'categories.manage'), asyncHandler(async (_req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { items: { where: { archivedAt: null } } } } },
  });
  res.json(categories.map(({ _count, ...c }) => ({ ...c, itemCount: _count.items })));
}));

categoryRouter.post('/categories', requirePermission('categories.manage'), asyncHandler(async (req, res) => {
  const input = categorySchema.parse(req.body);
  try {
    const category = await prisma.$transaction(async tx => {
      // New categories go to the end of the list unless an order is given.
      const sortOrder = input.sortOrder ??
        ((await tx.category.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 10;
      const created = await tx.category.create({ data: { name: input.name, sortOrder } });
      await writeAudit(tx, {
        userId: req.auth!.userId, action: 'category.create', entity: 'category', entityId: created.id,
        after: { name: created.name, sortOrder: created.sortOrder },
      });
      return created;
    });
    res.status(201).json({ ...category, itemCount: 0 });
  } catch (err) {
    duplicateGuard(err);
  }
}));

categoryRouter.patch('/categories/:id', requirePermission('categories.manage'), asyncHandler(async (req, res) => {
  const input = updateCategorySchema.parse(req.body);
  try {
    const category = await prisma.$transaction(async tx => {
      const before = await tx.category.findUnique({ where: { id: req.params.id } });
      if (!before) throw notFound('Категория не найдена');
      const after = await tx.category.update({ where: { id: before.id }, data: input });
      const changes = diff(before, after);
      if (changes) {
        await writeAudit(tx, {
          userId: req.auth!.userId, action: 'category.update', entity: 'category', entityId: before.id, ...changes,
        });
      }
      return after;
    });
    res.json(category);
  } catch (err) {
    duplicateGuard(err);
  }
}));

// A category that still holds items (archived included) cannot be deleted — move them first.
categoryRouter.delete('/categories/:id', requirePermission('categories.manage'), asyncHandler(async (req, res) => {
  await prisma.$transaction(async tx => {
    const category = await tx.category.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { items: true } } },
    });
    if (!category) throw notFound('Категория не найдена');
    if (category._count.items > 0) {
      throw conflict(`В категории ${category._count.items} поз. — перенесите или удалите их сначала`);
    }
    await tx.category.delete({ where: { id: category.id } });
    await writeAudit(tx, {
      userId: req.auth!.userId, action: 'category.delete', entity: 'category', entityId: category.id,
      before: { name: category.name, sortOrder: category.sortOrder },
    });
  });
  res.status(204).end();
}));
