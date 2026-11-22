import { Prisma, type Item, type MonthlyCount } from '@prisma/client';
import { prisma } from '../db';
import { conflict, notFound } from '../http/errors';
import { diff, writeAudit } from '../audit/audit';
import { deleteImage } from '../storage/files';
import { toMonthKey, type CountInput, type CreateItemInput, type ListQuery, type UpdateItemInput } from './schemas';
import { serializeCount, serializeItem, serializePhoto } from './serialize';

export const MAX_PHOTOS = 20;

const photoOrder: Prisma.ItemPhotoOrderByWithRelationInput[] = [{ sortOrder: 'asc' }, { createdAt: 'asc' }];

// Lists need only the cover; the detail page loads all photos.
const include = Prisma.validator<Prisma.ItemInclude>()({
  category: { select: { id: true, name: true, sortOrder: true } },
  photos: { orderBy: photoOrder, take: 1, select: { id: true, url: true } },
});
const allPhotos = Prisma.validator<Prisma.ItemPhotoFindManyArgs>()({ orderBy: photoOrder, select: { id: true, url: true } });

export function currentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// Plain snapshot of the stored catalog columns, used for audit diffs. Joined relations are dropped,
// otherwise every diff would report `category` as changed.
function snapshot(item: Item & { category?: unknown; photos?: unknown }): Record<string, unknown> {
  const { createdAt: _c, updatedAt: _u, id: _i, number: _n, category: _cat, photos: _p, ...rest } = item;
  return { ...rest, unitPrice: Number(item.unitPrice.toString()) };
}

function countSnapshot(count: MonthlyCount | null): Record<string, unknown> {
  if (!count) return { currentQty: null, shortageQty: 0, brokenQty: 0, endOfMonthQty: null, note: null };
  const { currentQty, shortageQty, brokenQty, endOfMonthQty, note } = count;
  return { currentQty, shortageQty, brokenQty, endOfMonthQty, note };
}

function duplicateNameGuard(err: unknown): never {
  if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
    const target = (err as { meta?: { target?: string[] | string } }).meta?.target;
    if (String(target).includes('sku')) throw conflict('Позиция с таким артикулом уже есть');
    throw conflict('Позиция с таким названием уже есть в этой категории');
  }
  throw err;
}

// Items with their count for `month` and the latest earlier count (to compare with).
export async function listItems(query: ListQuery) {
  const month = query.month ?? currentMonth();
  const where: Prisma.ItemWhereInput = {};
  if (query.status === 'active') where.archivedAt = null;
  if (query.status === 'archived') where.archivedAt = { not: null };
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { sku: { contains: query.q, mode: 'insensitive' } },
      { description: { contains: query.q, mode: 'insensitive' } },
    ];
  }

  const items = await prisma.item.findMany({
    where,
    include: {
      ...include,
      // At most this month + the previous counted one.
      counts: { where: { month: { lte: month } }, orderBy: { month: 'desc' }, take: 2 },
    },
    orderBy: [{ category: { sortOrder: 'asc' } }, { category: { name: 'asc' } }, { number: 'asc' }],
  });

  return items.map(({ counts, ...item }) => {
    const current = counts.find(c => c.month.getTime() === month.getTime()) ?? null;
    const previous = counts.find(c => c.month.getTime() < month.getTime()) ?? null;
    return {
      ...serializeItem(item),
      count: current ? serializeCount(current, item.unitPrice) : null,
      previous: previous ? { month: toMonthKey(previous.month), currentQty: previous.currentQty } : null,
    };
  });
}

// Months that have at least one count, newest first — for the month picker.
export async function listMonths() {
  const rows = await prisma.monthlyCount.groupBy({
    by: ['month'],
    _count: { _all: true },
    orderBy: { month: 'desc' },
  });
  return rows.map(r => ({ month: toMonthKey(r.month), itemCount: r._count._all }));
}

export async function getItem(id: string) {
  const item = await prisma.item.findUnique({
    where: { id },
    include: { ...include, photos: allPhotos, counts: { orderBy: { month: 'desc' } } },
  });
  if (!item) throw notFound('Позиция не найдена');
  const { counts, ...rest } = item;
  return {
    ...serializeItem(rest),
    photos: rest.photos.map(serializePhoto),
    counts: counts.map(c => serializeCount(c, item.unitPrice)),
  };
}

async function assertCategoryExists(tx: Prisma.TransactionClient, categoryId: string) {
  const category = await tx.category.findUnique({ where: { id: categoryId } });
  if (!category) throw notFound('Категория не найдена');
}

export async function createItem(input: CreateItemInput, userId: string) {
  try {
    const item = await prisma.$transaction(async tx => {
      if (input.categoryId) await assertCategoryExists(tx, input.categoryId);
      const created = await tx.item.create({ data: input, include });
      await writeAudit(tx, {
        userId, action: 'item.create', entity: 'item', entityId: created.id, after: snapshot(created),
      });
      return created;
    });
    return serializeItem(item);
  } catch (err) {
    duplicateNameGuard(err);
  }
}

export async function updateItem(id: string, input: UpdateItemInput, userId: string) {
  try {
    const item = await prisma.$transaction(async tx => {
      const before = await tx.item.findUnique({ where: { id } });
      if (!before) throw notFound('Позиция не найдена');
      if (input.categoryId) await assertCategoryExists(tx, input.categoryId);

      const { archived, ...rest } = input;
      const data: Prisma.ItemUncheckedUpdateInput = { ...rest };
      if (archived !== undefined) data.archivedAt = archived ? (before.archivedAt ?? new Date()) : null;

      const after = await tx.item.update({ where: { id }, data, include });

      const changes = diff(snapshot(before), snapshot(after));
      if (changes) {
        let action = 'item.update';
        if (archived === true && !before.archivedAt) action = 'item.archive';
        if (archived === false && before.archivedAt) action = 'item.restore';
        await writeAudit(tx, { userId, action, entity: 'item', entityId: id, ...changes });
      }
      return after;
    });
    return serializeItem(item);
  } catch (err) {
    duplicateNameGuard(err);
  }
}

// Hard delete is allowed only for archived items: archive first, delete deliberately.
// Monthly counts go with the item (ON DELETE CASCADE).
export async function deleteItem(id: string, userId: string) {
  const photoUrls = await prisma.$transaction(async tx => {
    const item = await tx.item.findUnique({ where: { id }, include: { photos: { select: { url: true } } } });
    if (!item) throw notFound('Позиция не найдена');
    if (!item.archivedAt) throw conflict('Сначала переместите позицию в архив');
    await tx.item.delete({ where: { id } }); // photo rows go with it (ON DELETE CASCADE)
    await writeAudit(tx, { userId, action: 'item.delete', entity: 'item', entityId: id, before: snapshot(item) });
    return item.photos.map(p => p.url);
  });
  await Promise.all(photoUrls.map(deleteImage));
}

async function photosOf(tx: Prisma.TransactionClient, itemId: string) {
  return (await tx.itemPhoto.findMany({ where: { itemId }, ...allPhotos })).map(serializePhoto);
}

// Appends already-saved files to the item's gallery. Returns the whole gallery.
export async function addPhotos(itemId: string, urls: string[], userId: string) {
  return prisma.$transaction(async tx => {
    const item = await tx.item.findUnique({ where: { id: itemId } });
    if (!item) throw notFound('Позиция не найдена');
    const stats = await tx.itemPhoto.aggregate({ where: { itemId }, _count: { _all: true }, _max: { sortOrder: true } });
    if (stats._count._all + urls.length > MAX_PHOTOS) {
      throw conflict(`Не больше ${MAX_PHOTOS} фото на позицию (сейчас ${stats._count._all})`);
    }
    const start = (stats._max.sortOrder ?? -1) + 1;
    await tx.itemPhoto.createMany({ data: urls.map((url, i) => ({ itemId, url, sortOrder: start + i })) });
    await writeAudit(tx, { userId, action: 'item.photo.add', entity: 'item', entityId: itemId, after: { photos: urls } });
    return photosOf(tx, itemId);
  });
}

export async function deletePhoto(itemId: string, photoId: string, userId: string) {
  const { url, photos } = await prisma.$transaction(async tx => {
    const photo = await tx.itemPhoto.findFirst({ where: { id: photoId, itemId } });
    if (!photo) throw notFound('Фото не найдено');
    await tx.itemPhoto.delete({ where: { id: photo.id } });
    await writeAudit(tx, { userId, action: 'item.photo.delete', entity: 'item', entityId: itemId, before: { photos: [photo.url] } });
    return { url: photo.url, photos: await photosOf(tx, itemId) };
  });
  await deleteImage(url);
  return photos;
}

// Moves a photo to the front: it becomes the cover shown in lists.
export async function setCoverPhoto(itemId: string, photoId: string, userId: string) {
  return prisma.$transaction(async tx => {
    const photo = await tx.itemPhoto.findFirst({ where: { id: photoId, itemId } });
    if (!photo) throw notFound('Фото не найдено');
    const min = await tx.itemPhoto.aggregate({ where: { itemId }, _min: { sortOrder: true } });
    await tx.itemPhoto.update({ where: { id: photo.id }, data: { sortOrder: (min._min.sortOrder ?? 0) - 1 } });
    await writeAudit(tx, { userId, action: 'item.photo.cover', entity: 'item', entityId: itemId, after: { photos: [photo.url] } });
    return photosOf(tx, itemId);
  });
}

// Create or update the count of one item for one month. Only sent fields change.
export async function upsertCount(itemId: string, month: Date, input: CountInput, userId: string) {
  return prisma.$transaction(async tx => {
    const item = await tx.item.findUnique({ where: { id: itemId } });
    if (!item) throw notFound('Позиция не найдена');
    if (item.archivedAt) throw conflict('Позиция в архиве — восстановите её, чтобы вносить пересчёт');

    const before = await tx.monthlyCount.findUnique({ where: { itemId_month: { itemId, month } } });
    const after = await tx.monthlyCount.upsert({
      where: { itemId_month: { itemId, month } },
      create: { itemId, month, ...input },
      update: input,
    });

    const changes = diff(countSnapshot(before), countSnapshot(after));
    if (changes) {
      await writeAudit(tx, {
        userId, action: before ? 'count.update' : 'count.create', entity: 'item', entityId: itemId,
        before: changes.before, after: { ...changes.after, month: toMonthKey(month) },
      });
    }
    return serializeCount(after, item.unitPrice);
  });
}

export async function deleteCount(itemId: string, month: Date, userId: string) {
  await prisma.$transaction(async tx => {
    const count = await tx.monthlyCount.findUnique({ where: { itemId_month: { itemId, month } } });
    if (!count) throw notFound('Пересчёта за этот месяц нет');
    await tx.monthlyCount.delete({ where: { id: count.id } });
    await writeAudit(tx, {
      userId, action: 'count.delete', entity: 'item', entityId: itemId,
      before: { ...countSnapshot(count), month: toMonthKey(month) },
    });
  });
}

export async function itemHistory(id: string) {
  return prisma.auditLog.findMany({
    where: { entity: 'item', entityId: id },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true, action: true, before: true, after: true, createdAt: true,
      user: { select: { id: true, name: true, login: true } },
    },
  });
}
