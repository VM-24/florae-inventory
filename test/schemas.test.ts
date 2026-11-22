import { describe, it, expect } from 'vitest';
import {
  countSchema, createItemSchema, listQuerySchema, monthKey, toMonthKey, updateItemSchema,
} from '../src/items/schemas';

const CATEGORY = '0b0f1a52-6a4c-4a7e-9a5e-2d1f2b3c4d5e';

describe('createItemSchema', () => {
  it('accepts a minimal item and trims the name', () => {
    expect(createItemSchema.parse({ categoryId: CATEGORY, name: '  Рокс ' }).name).toBe('Рокс');
  });

  it('accepts price as string with 2 decimals, rejects 3 decimals', () => {
    expect(createItemSchema.parse({ categoryId: CATEGORY, name: 'x', unitPrice: '12.50' }).unitPrice).toBe(12.5);
    expect(() => createItemSchema.parse({ categoryId: CATEGORY, name: 'x', unitPrice: 1.005 })).toThrow();
  });

  it('allows an item without a category (simple mode)', () => {
    expect(createItemSchema.parse({ name: 'Рокс' })).toEqual({ name: 'Рокс' });
    expect(createItemSchema.parse({ name: 'Рокс', categoryId: null }).categoryId).toBeNull();
  });

  it('trims the sku and turns an empty one into null', () => {
    expect(createItemSchema.parse({ name: 'x', sku: ' A-101 ' }).sku).toBe('A-101');
    expect(createItemSchema.parse({ name: 'x', sku: '' }).sku).toBeNull();
    expect(() => createItemSchema.parse({ name: 'x', sku: 'x'.repeat(51) })).toThrow();
  });

  it('rejects count fields — they belong to a month', () => {
    expect(() => createItemSchema.parse({ categoryId: CATEGORY, name: 'x', currentQty: 5 })).toThrow();
  });

  it('rejects unknown fields', () => {
    expect(() => createItemSchema.parse({ categoryId: CATEGORY, name: 'x', brokenSum: 5 })).toThrow();
  });
});

describe('updateItemSchema', () => {
  it('allows partial updates and archived flag', () => {
    expect(updateItemSchema.parse({ archived: true })).toEqual({ archived: true });
  });
});

describe('countSchema', () => {
  it('rejects negative and fractional quantities', () => {
    expect(() => countSchema.parse({ currentQty: -1 })).toThrow();
    expect(() => countSchema.parse({ brokenQty: 1.5 })).toThrow();
  });

  it('allows clearing the current count and turns an empty note into null', () => {
    expect(countSchema.parse({ currentQty: null, note: '  ' })).toEqual({ currentQty: null, note: null });
  });
});

describe('monthKey', () => {
  it('parses YYYY-MM to the first day of the month (UTC)', () => {
    expect(monthKey.parse('2026-01').toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(toMonthKey(monthKey.parse('2026-11'))).toBe('2026-11');
  });

  it('rejects invalid months', () => {
    expect(() => monthKey.parse('2026-13')).toThrow();
    expect(() => monthKey.parse('2026-1')).toThrow();
    expect(() => monthKey.parse('11.2026')).toThrow();
  });
});

describe('listQuerySchema', () => {
  it('defaults to active items, month optional', () => {
    expect(listQuerySchema.parse({})).toEqual({ status: 'active' });
  });
});
