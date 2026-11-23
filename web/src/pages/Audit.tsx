import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Segmented, Select, Space, Tag, Typography } from 'antd';
import ResponsiveTable, { type RColumn } from '../components/ResponsiveTable';
import { api, type AuditEntry, type Category } from '../api';
import { actionMeta, ChangeDetails, formatDateTime, HistoryHint } from '../history';
import { formatMonth } from '../month';

const ENTITY_OPTIONS = [
  { label: 'Все', value: '' },
  { label: 'Позиции', value: 'item' },
  { label: 'Категории', value: 'category' },
  { label: 'Пользователи', value: 'user' },
  { label: 'Роли', value: 'role' },
];

// Journal of all changes (audit.view): who, date and time, what was changed.
export default function Audit() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [entity, setEntity] = useState('');
  const [userId, setUserId] = useState<string | undefined>();
  // Authors seen so far — the filter does not need the users.manage permission.
  const [authors, setAuthors] = useState<Map<string, string>>(new Map());

  const remember = (rows: AuditEntry[]) => setAuthors(prev => {
    const next = new Map(prev);
    for (const r of rows) if (r.user) next.set(r.user.id, `${r.user.name} (${r.user.login})`);
    return next;
  });

  useEffect(() => { api.categories().then(setCategories).catch(() => {}); }, []);

  useEffect(() => {
    setLoading(true);
    api.audit({ entity: entity || undefined, userId })
      .then(page => { setEntries(page.items); setCursor(page.nextCursor); remember(page.items); })
      .catch(e => message.error(e.message))
      .finally(() => setLoading(false));
  }, [entity, userId, message]);

  const more = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.audit({ entity: entity || undefined, userId, cursor });
      setEntries(prev => [...prev, ...page.items]);
      setCursor(page.nextCursor);
      remember(page.items);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoadingMore(false);
    }
  };

  const authorOptions = useMemo(
    () => [...authors].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'ru')),
    [authors],
  );

  const columns: RColumn<AuditEntry>[] = [
    {
      title: 'Дата и время', key: 'createdAt', width: 150, card: 'header',
      render: (_, e) => <span className="num">{formatDateTime(e.createdAt)}</span>,
    },
    {
      title: 'Кто', key: 'user',
      render: (_, e) => (e.user ? <span>{e.user.name} <span className="muted">({e.user.login})</span></span> : <span className="muted">удалённый пользователь</span>),
    },
    {
      title: 'Действие', key: 'action',
      render: (_, e) => {
        const meta = actionMeta(e.action);
        const month = (e.after?.month ?? e.before?.month) as string | undefined;
        return <Tag color={meta.color}>{meta.label}{month ? ` · ${formatMonth(month)}` : ''}</Tag>;
      },
    },
    {
      title: 'Объект', key: 'entity', card: 'block',
      render: (_, e) => {
        const title = e.entityTitle ?? '—';
        if (e.entity === 'item' && e.entityExists && e.entityId) {
          return <a onClick={() => navigate(`/items/${e.entityId}`)}>{title}</a>;
        }
        return <span className={e.entityExists ? undefined : 'muted'}>{title}{!e.entityExists && e.entityTitle ? ' (удалено)' : ''}</span>;
      },
    },
    {
      title: 'Изменения', key: 'changes', card: 'block',
      render: (_, e) => <ChangeDetails entry={e} categories={categories} />,
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>Журнал изменений</Typography.Title>
        <HistoryHint />
      </Space>

      <Space style={{ marginBottom: 16 }} wrap>
        <Segmented options={ENTITY_OPTIONS} value={entity} onChange={v => setEntity(String(v))} />
        <Select
          allowClear
          placeholder="Все пользователи"
          value={userId}
          onChange={setUserId}
          options={authorOptions}
          style={{ minWidth: 240 }}
          showSearch={{ optionFilterProp: 'label' }}
        />
      </Space>

      <ResponsiveTable<AuditEntry>
        rowKey="id"
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={entries}
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: 'Записей нет' }}
      />

      {cursor && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button onClick={more} loading={loadingMore}>Показать ещё</Button>
        </div>
      )}
    </div>
  );
}
