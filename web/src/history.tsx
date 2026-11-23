import { Empty, Space, Tag, Timeline, Tooltip, Typography } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Category, HistoryEntry } from './api';
import { formatMoney } from './money';
import { formatMonth } from './month';

// Shared by the item history (both modes) and the global journal.

export const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  'item.create': { label: 'Позиция создана', color: 'green' },
  'item.update': { label: 'Карточка изменена', color: 'blue' },
  'item.archive': { label: 'В архив', color: 'default' },
  'item.restore': { label: 'Восстановлена', color: 'green' },
  'item.delete': { label: 'Позиция удалена', color: 'red' },
  'item.photo.add': { label: 'Фото добавлены', color: 'purple' },
  'item.photo.delete': { label: 'Фото удалено', color: 'purple' },
  'item.photo.cover': { label: 'Главное фото', color: 'purple' },
  'count.create': { label: 'Количество внесено', color: 'cyan' },
  'count.update': { label: 'Количество изменено', color: 'cyan' },
  'count.delete': { label: 'Пересчёт удалён', color: 'red' },
  'category.create': { label: 'Категория создана', color: 'green' },
  'category.update': { label: 'Категория изменена', color: 'blue' },
  'category.delete': { label: 'Категория удалена', color: 'red' },
  'user.create': { label: 'Пользователь создан', color: 'green' },
  'user.update': { label: 'Пользователь изменён', color: 'blue' },
  'user.reset_password': { label: 'Пароль сброшен', color: 'orange' },
  'role.create': { label: 'Роль создана', color: 'green' },
  'role.update': { label: 'Роль изменена', color: 'blue' },
  'role.delete': { label: 'Роль удалена', color: 'red' },
};

export const actionMeta = (action: string) => ACTION_LABELS[action] ?? { label: action, color: 'default' };

const FIELD_LABELS: Record<string, string> = {
  sku: 'Артикул', name: 'Название', description: 'Описание', categoryId: 'Категория', unit: 'Ед. изм.',
  photos: 'Фото', openingQty: 'Открытие', unitPrice: 'Цена/ед', archivedAt: 'Архив',
  currentQty: 'Количество', shortageQty: 'Недостача', brokenQty: 'Списание', endOfMonthQty: 'На конец месяца',
  note: 'Примечание', sortOrder: 'Порядок', login: 'Логин', role: 'Роль', active: 'Активен',
  permissions: 'Права',
};

// Technical columns that are not interesting to a reader.
const HIDDEN_FIELDS = new Set(['month', 'number']);

export function formatValue(key: string, value: unknown, categories: Category[] = []): string {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'unitPrice') return formatMoney(Number(value));
  if (key === 'archivedAt') return dayjs(String(value)).format('DD.MM.YYYY');
  if (key === 'photos') return `${(value as unknown[]).length} шт.`;
  if (key === 'categoryId') return categories.find(c => c.id === value)?.name ?? '—';
  if (key === 'active') return value ? 'да' : 'нет (заблокирован)';
  if (key === 'permissions') return `${(value as unknown[]).length} прав`;
  return String(value);
}

export const formatDateTime = (iso: string) => dayjs(iso).format('DD.MM.YYYY HH:mm');

export function WhoWhen({ user, createdAt }: { user: HistoryEntry['user']; createdAt: string }) {
  return (
    <Space size={6} wrap>
      <Tooltip title={dayjs(createdAt).format('DD.MM.YYYY HH:mm:ss')}>
        <span className="muted num">{formatDateTime(createdAt)}</span>
      </Tooltip>
      <span>
        <UserOutlined className="muted" /> {user ? <>{user.name} <span className="muted">({user.login})</span></> : 'удалённый пользователь'}
      </span>
    </Space>
  );
}

// "Field: was → became" lines. Creation and deletion show only the remaining side's values.
export function ChangeDetails({ entry, categories }: {
  entry: Pick<HistoryEntry, 'action' | 'before' | 'after'>;
  categories?: Category[];
}) {
  const keys = [...new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})])]
    .filter(k => !HIDDEN_FIELDS.has(k) && FIELD_LABELS[k] !== undefined);
  // Whole-object snapshots on create/delete are long; show only the meaningful fields.
  const snapshot = entry.action.endsWith('.create') || entry.action.endsWith('.delete');
  const shown = snapshot ? keys.filter(k => ['sku', 'name', 'login', 'role', 'currentQty'].includes(k)) : keys;
  if (!shown.length) return null;
  return (
    <div style={{ marginTop: 2 }}>
      {shown.map(k => {
        const before = entry.before?.[k];
        const after = entry.after?.[k];
        return (
          <div key={k} style={{ fontSize: 13 }}>
            <span className="muted">{FIELD_LABELS[k]}:</span>{' '}
            {snapshot
              ? <strong>{formatValue(k, after ?? before, categories)}</strong>
              : <>{formatValue(k, before, categories)} → <strong>{formatValue(k, after, categories)}</strong></>}
          </div>
        );
      })}
    </div>
  );
}

// Timeline on the item page: who, date and time, what changed.
export function HistoryList({ entries, categories }: { entries: HistoryEntry[]; categories: Category[] }) {
  if (!entries.length) return <Empty description="Изменений пока нет" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  return (
    <Timeline
      items={entries.map(e => {
        const meta = actionMeta(e.action);
        const month = (e.after?.month ?? e.before?.month) as string | undefined;
        return {
          color: meta.color === 'default' ? 'gray' : meta.color,
          content: (
            <div>
              <Space size={6} wrap>
                <Tag color={meta.color}>{meta.label}{month ? ` · ${formatMonth(month)}` : ''}</Tag>
                <WhoWhen user={e.user} createdAt={e.createdAt} />
              </Space>
              <ChangeDetails entry={e} categories={categories} />
            </div>
          ),
        };
      })}
    />
  );
}

export const HistoryHint = () => (
  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
    Время показано по часам вашего устройства.
  </Typography.Text>
);
