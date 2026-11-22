import type { Category, Item, ItemPhoto, MonthlyCount, Prisma } from '@prisma/client';
import { lineTotal } from './money';
import { toMonthKey } from './schemas';

export type ItemWithCategory = Item & {
  category: Pick<Category, 'id' | 'name' | 'sortOrder'> | null;
  photos: Pick<ItemPhoto, 'id' | 'url'>[]; // ordered; at least the cover
};

export const serializePhoto = (p: Pick<ItemPhoto, 'id' | 'url'>) => ({ id: p.id, url: p.url });

// Catalog part of an item: Decimal → number. photoUrl is the cover (first photo).
export function serializeItem(item: ItemWithCategory) {
  return {
    id: item.id,
    number: item.number,
    sku: item.sku,
    name: item.name,
    description: item.description,
    unit: item.unit,
    photoUrl: item.photos[0]?.url ?? null,
    category: item.category
      ? { id: item.category.id, name: item.category.name, sortOrder: item.category.sortOrder }
      : null,
    openingQty: item.openingQty,
    unitPrice: Number(item.unitPrice.toString()),
    archived: item.archivedAt !== null,
    archivedAt: item.archivedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

// One month of counts with derived sums ("Сумма списания", "Сумма недостачи", value on hand).
// Sums use the item's current price.
export function serializeCount(count: MonthlyCount, unitPrice: Prisma.Decimal | number) {
  return {
    month: toMonthKey(count.month),
    currentQty: count.currentQty,
    shortageQty: count.shortageQty,
    brokenQty: count.brokenQty,
    endOfMonthQty: count.endOfMonthQty,
    note: count.note,
    updatedAt: count.updatedAt,
    brokenSum: lineTotal(unitPrice, count.brokenQty),
    shortageSum: lineTotal(unitPrice, count.shortageQty),
    currentValue: count.currentQty === null ? null : lineTotal(unitPrice, count.currentQty),
  };
}

export type ItemDto = ReturnType<typeof serializeItem>;
export type CountDto = ReturnType<typeof serializeCount>;
