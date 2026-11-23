// Permission catalog. It lives in code, not in the DB: a permission without code that checks it
// would be a fake checkbox. The owner picks permissions for roles from here but cannot invent new ones.

export interface PermissionDef {
  key: string;
  label: string;
}

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: PermissionDef[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'inventory',
    label: 'Инвентарь',
    permissions: [
      { key: 'inventory.view', label: 'Смотреть инвентарь и историю изменений позиций' },
      // Self-sufficient: alone it gives a read-only list plus editing quantities, nothing else.
      { key: 'inventory.count', label: 'Вводить количество. Одного этого права достаточно: список виден только для чтения, менять можно лишь количество' },
      { key: 'inventory.photos', label: 'Добавлять и удалять фото' },
    ],
  },
  {
    key: 'items',
    label: 'Позиции',
    permissions: [
      { key: 'items.create', label: 'Создавать позиции' },
      { key: 'items.edit_sku', label: 'Менять артикул' },
      { key: 'items.edit_name', label: 'Менять название' },
      { key: 'items.edit_description', label: 'Менять описание' },
      { key: 'items.edit_category', label: 'Менять категорию' },
      { key: 'items.edit_unit', label: 'Менять единицу измерения' },
      { key: 'items.edit_price', label: 'Менять цену (полный режим)' },
      { key: 'items.edit_opening', label: 'Менять «Открытие» (полный режим)' },
      { key: 'items.archive', label: 'Перемещать в архив и восстанавливать' },
      { key: 'items.delete', label: 'Удалять позиции навсегда' },
      { key: 'counts.delete', label: 'Удалять пересчёт за месяц (полный режим)' },
    ],
  },
  {
    key: 'categories',
    label: 'Категории',
    permissions: [{ key: 'categories.manage', label: 'Создавать, переименовывать и удалять категории' }],
  },
  {
    key: 'users',
    label: 'Пользователи и роли',
    permissions: [
      { key: 'users.manage', label: 'Создавать и блокировать пользователей, менять им роль, сбрасывать пароли' },
      { key: 'roles.manage', label: 'Создавать роли и настраивать их права' },
    ],
  },
  {
    key: 'audit',
    label: 'Журнал',
    permissions: [{ key: 'audit.view', label: 'Смотреть журнал всех изменений' }],
  },
];

export const ALL_PERMISSIONS: string[] = PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.key));

const KNOWN = new Set(ALL_PERMISSIONS);
export const isKnownPermission = (p: string) => KNOWN.has(p);

// Preset roles, created idempotently on startup (and by the migration that introduced roles).
// They match the earlier fixed roles OWNER / ADMIN / STAFF.
export const OWNER_ROLE_NAME = 'Владелец';
export const PRESET_ROLES: Array<{ name: string; isOwner: boolean; permissions: string[] }> = [
  { name: OWNER_ROLE_NAME, isOwner: true, permissions: [] }, // implicit: everything
  {
    name: 'Администратор',
    isOwner: false,
    permissions: ALL_PERMISSIONS.filter(p => p !== 'users.manage' && p !== 'roles.manage'),
  },
  { name: 'Сотрудник', isOwner: false, permissions: ['inventory.view', 'inventory.count', 'inventory.photos'] },
];

// PATCH /items/:id — the permission depends on which fields are sent.
export const ITEM_FIELD_PERMISSIONS: Record<string, string> = {
  sku: 'items.edit_sku',
  name: 'items.edit_name',
  description: 'items.edit_description',
  categoryId: 'items.edit_category',
  unit: 'items.edit_unit',
  unitPrice: 'items.edit_price',
  openingQty: 'items.edit_opening',
  archived: 'items.archive',
};
