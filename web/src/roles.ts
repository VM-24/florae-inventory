import type { Role } from './api';

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Владелец',
  ADMIN: 'Администратор',
  STAFF: 'Сотрудник',
};

export const ROLE_HINTS: Record<Role, string> = {
  OWNER: 'Всё, включая пользователей',
  ADMIN: 'Каталог, цены, категории, архив',
  STAFF: 'Пересчёт количества и фото',
};

export const ROLE_COLORS: Record<Role, string> = { OWNER: 'purple', ADMIN: 'blue', STAFF: 'default' };

export const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as Role[]).map(value => ({
  value,
  label: `${ROLE_LABELS[value]} — ${ROLE_HINTS[value]}`,
}));
