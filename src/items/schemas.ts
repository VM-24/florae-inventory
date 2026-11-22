import { z } from 'zod';

const MAX_QTY = 1_000_000;

const qty = z.number({ invalid_type_error: 'должно быть числом' })
  .int('должно быть целым')
  .min(0, 'не может быть отрицательным')
  .max(MAX_QTY);

// Money in PLN: non-negative, at most 2 decimal places. Accepts "12.50" or 12.5.
export const money = z.coerce.number({ invalid_type_error: 'должно быть числом' })
  .finite()
  .min(0, 'не может быть отрицательной')
  .max(10_000_000)
  .refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'не больше 2 знаков после запятой');

// Month key "YYYY-MM" → Date of the first day (UTC), as stored in monthly_counts.month.
export const monthKey = z.string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'месяц в формате YYYY-MM')
  .transform(s => new Date(`${s}-01T00:00:00Z`));

export const toMonthKey = (d: Date) => d.toISOString().slice(0, 7);

// Empty string → null, so clearing a text field in the form clears it in the DB.
const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional()
    .transform(v => (v === undefined ? undefined : v ? v : null));

export const createItemSchema = z.object({
  sku: optionalText(50),
  categoryId: z.string().uuid('некорректная категория').nullable().optional(),
  name: z.string().trim().min(1, 'обязательно').max(200),
  description: optionalText(1000),
  unit: z.string().trim().min(1).max(20).optional(),
  openingQty: qty.nullable().optional(),
  unitPrice: money.optional(),
}).strict();

export const updateItemSchema = createItemSchema.partial().extend({
  archived: z.boolean().optional(),
}).strict();

export const countSchema = z.object({
  currentQty: qty.nullable().optional(),
  shortageQty: qty.optional(),
  brokenQty: qty.optional(),
  endOfMonthQty: qty.nullable().optional(),
  note: optionalText(1000),
}).strict();

export const listQuerySchema = z.object({
  month: monthKey.optional(),
  categoryId: z.string().uuid().optional(),
  q: z.string().trim().max(200).optional(),
  status: z.enum(['active', 'archived', 'all']).default('active'),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type CountInput = z.infer<typeof countSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
