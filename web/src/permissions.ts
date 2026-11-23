// Item card field → permission needed to change it. Mirrors ITEM_FIELD_PERMISSIONS on the server
// (src/auth/permissions.ts) — change both together.
export const ITEM_FIELD_PERMISSIONS = {
  sku: 'items.edit_sku',
  name: 'items.edit_name',
  description: 'items.edit_description',
  categoryId: 'items.edit_category',
  unit: 'items.edit_unit',
  unitPrice: 'items.edit_price',
  openingQty: 'items.edit_opening',
} as const;

export type ItemField = keyof typeof ITEM_FIELD_PERMISSIONS;

// Keeps only the fields the user may change, so a save never trips a 403 on an untouched field.
export function editableFields<T extends Partial<Record<ItemField, unknown>>>(values: T, can: (p: string) => boolean): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([field]) => {
      const permission = ITEM_FIELD_PERMISSIONS[field as ItemField];
      return permission !== undefined && can(permission);
    }),
  ) as Partial<T>;
}
