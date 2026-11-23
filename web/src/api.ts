import { compressImage } from './imageCompress';

const TOKEN_KEY = 'florae_inventory_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const isForm = options.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && path !== '/login') {
    clearToken();
    if (location.pathname !== '/login') location.href = '/login';
    throw new Error('Не авторизован');
  }
  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Ошибка ${res.status}`);
  return body as T;
}

const json = (method: string, data?: unknown): RequestInit => ({
  method,
  body: data === undefined ? undefined : JSON.stringify(data),
});

// A role is a named set of permissions; the owner role always has all of them.
export interface RoleRef {
  id: string;
  name: string;
  isOwner: boolean;
}

export interface Me {
  login: string;
  name: string;
  role: RoleRef;
  permissions: string[];
  mustChangePassword: boolean;
  currency: string;
}

export interface PanelUser {
  id: string;
  login: string;
  name: string;
  role: RoleRef;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface PanelRole extends RoleRef {
  userCount: number;
  permissions: string[];
}

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: { key: string; label: string }[];
}

export interface AuditEntry {
  id: string;
  action: string;
  entity: 'item' | 'category' | 'user' | 'role';
  entityId: string | null;
  entityTitle: string | null;
  entityExists: boolean;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string; login: string } | null;
}

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  itemCount: number;
}

// Catalog data — the same for every month.
export interface Item {
  id: string;
  number: number;
  sku: string | null; // Артикул
  name: string;
  description: string | null; // Описание
  unit: string;
  photoUrl: string | null;
  category: { id: string; name: string; sortOrder: number } | null;
  openingQty: number | null;
  unitPrice: number;
  archived: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// One month of the count sheet for one item. Sums are derived on the server (qty × current price).
export interface MonthlyCount {
  month: string; // YYYY-MM
  currentQty: number | null;
  shortageQty: number;
  brokenQty: number;
  endOfMonthQty: number | null;
  note: string | null;
  updatedAt: string;
  brokenSum: number;
  shortageSum: number;
  currentValue: number | null;
}

export interface ListedItem extends Item {
  count: MonthlyCount | null; // count for the selected month; null = not counted yet
  previous: { month: string; currentQty: number | null } | null; // latest earlier count
}

export interface ItemPhoto {
  id: string;
  url: string;
}

export interface ItemDetail extends Item {
  photos: ItemPhoto[]; // first = cover (Item.photoUrl)
  counts: MonthlyCount[]; // newest first
}

export interface ItemInput {
  sku?: string | null;
  categoryId?: string | null;
  name: string;
  description?: string | null;
  unit?: string;
  openingQty?: number | null;
  unitPrice?: number;
}

export interface CountInput {
  currentQty?: number | null;
  shortageQty?: number;
  brokenQty?: number;
  endOfMonthQty?: number | null;
  note?: string | null;
}

export interface MonthSummary {
  month: string; // YYYY-MM
  itemCount: number;
}

export interface HistoryEntry {
  id: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string; login: string } | null;
}

export type ItemStatus = 'active' | 'archived' | 'all';

export const api = {
  login: (login: string, password: string) =>
    request<{ token: string }>('/login', json('POST', { login, password })),
  me: () => request<Me>('/me'),
  changeOwnPassword: (current: string, next: string) =>
    request<{ ok: boolean }>('/me/password', json('POST', { current, next })),

  users: () => request<PanelUser[]>('/users'),
  createUser: (data: { login: string; name: string; roleId: string }) =>
    request<PanelUser & { password: string }>('/users', json('POST', data)),
  updateUser: (id: string, patch: { name?: string; roleId?: string; active?: boolean }) =>
    request<PanelUser>(`/users/${id}`, json('PATCH', patch)),
  resetUserPassword: (id: string) => request<{ password: string }>(`/users/${id}/reset-password`, json('POST')),

  roles: () => request<PanelRole[]>('/roles'),
  permissionGroups: () => request<PermissionGroup[]>('/permissions'),
  createRole: (data: { name: string; permissions: string[] }) => request<PanelRole>('/roles', json('POST', data)),
  updateRole: (id: string, patch: { name?: string; permissions?: string[] }) =>
    request<PanelRole>(`/roles/${id}`, json('PATCH', patch)),
  deleteRole: (id: string) => request<void>(`/roles/${id}`, { method: 'DELETE' }),

  audit: (params: { userId?: string; entity?: string; cursor?: string }) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
    return request<{ items: AuditEntry[]; nextCursor: string | null }>(`/audit${query ? `?${query}` : ''}`);
  },

  categories: () => request<Category[]>('/categories'),
  createCategory: (data: { name: string; sortOrder?: number }) =>
    request<Category>('/categories', json('POST', data)),
  updateCategory: (id: string, data: { name?: string; sortOrder?: number }) =>
    request<Category>(`/categories/${id}`, json('PATCH', data)),
  deleteCategory: (id: string) => request<void>(`/categories/${id}`, { method: 'DELETE' }),

  months: () => request<MonthSummary[]>('/months'),
  items: (params: { month?: string; categoryId?: string; q?: string; status?: ItemStatus } = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v) as [string, string][],
    ).toString();
    return request<ListedItem[]>(`/items${query ? `?${query}` : ''}`);
  },
  item: (id: string) => request<ItemDetail>(`/items/${id}`),
  saveCount: (id: string, month: string, data: CountInput) =>
    request<MonthlyCount>(`/items/${id}/counts/${month}`, json('PUT', data)),
  deleteCount: (id: string, month: string) =>
    request<void>(`/items/${id}/counts/${month}`, { method: 'DELETE' }),
  itemHistory: (id: string) => request<HistoryEntry[]>(`/items/${id}/history`),
  createItem: (data: ItemInput) => request<Item>('/items', json('POST', data)),
  updateItem: (id: string, data: Partial<ItemInput> & { archived?: boolean }) =>
    request<Item>(`/items/${id}`, json('PATCH', data)),
  deleteItem: (id: string) => request<void>(`/items/${id}`, { method: 'DELETE' }),
  // Uploads in batches of 10 (the server's per-request limit). Returns the whole gallery.
  uploadItemPhotos: async (id: string, files: File[]) => {
    let photos: ItemPhoto[] = [];
    for (let i = 0; i < files.length; i += 10) {
      const form = new FormData();
      for (const file of await Promise.all(files.slice(i, i + 10).map(compressImage))) form.append('photos', file);
      photos = await request<ItemPhoto[]>(`/items/${id}/photos`, { method: 'POST', body: form });
    }
    return photos;
  },
  deleteItemPhoto: (id: string, photoId: string) =>
    request<ItemPhoto[]>(`/items/${id}/photos/${photoId}`, { method: 'DELETE' }),
  setCoverPhoto: (id: string, photoId: string) =>
    request<ItemPhoto[]>(`/items/${id}/photos/${photoId}/cover`, { method: 'POST' }),
};
