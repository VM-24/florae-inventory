import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Input, InputNumber, Segmented, Select, Space, Spin, Switch, Tooltip, Typography } from 'antd';
import { DownloadOutlined, PictureOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import ResponsiveTable, { type RColumn } from '../../components/ResponsiveTable';
import MonthPicker from '../../components/MonthPicker';
import { api, type Category, type ItemStatus, type ListedItem, type MonthSummary } from '../../api';
import { useAuth } from '../../auth';
import { buildSheet, downloadCsv, singleCategory, type SheetColumn } from '../../csv';
import { currentMonthKey, formatMonth } from '../../month';

// Simple mode: Артикул, Фото, Наименование, Категория, Ед. изм., Количество — for the selected inventory month.
// Counts are stored per month (MonthlyCount), so past months can be reopened and the full mode
// has the same history.

const STATUS_OPTIONS: { label: string; value: ItemStatus }[] = [
  { label: 'Активные', value: 'active' },
  { label: 'Архив', value: 'archived' },
  { label: 'Все', value: 'all' },
];

// Quantity counted in the selected month (null = not counted that month).
export const quantityOf = (i: ListedItem): number | null => i.count?.currentQty ?? null;

export default function SimpleInventory() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<ListedItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [months, setMonths] = useState<MonthSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [search, setSearch] = useState(params.get('q') ?? '');

  const categoryId = params.get('category') ?? undefined;
  const status = (params.get('status') as ItemStatus) || 'active';
  const q = params.get('q') ?? '';
  // Without ?month= open the latest month that has counts, otherwise the current one.
  const month = params.get('month') ?? months?.[0]?.month ?? (months ? currentMonthKey() : null);
  const monthsWithData = useMemo(() => new Set(months?.map(m => m.month)), [months]);

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => { if (search !== q) setParam('q', search.trim() || undefined); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    api.categories().then(setCategories).catch(e => message.error(e.message));
    api.months().then(setMonths).catch(e => { setMonths([]); message.error(e.message); });
  }, [message]);

  useEffect(() => {
    if (!month) return;
    setLoading(true);
    api.items({ month, categoryId, q: q || undefined, status })
      .then(setItems)
      .catch(e => message.error(e.message))
      .finally(() => setLoading(false));
  }, [month, categoryId, q, status, message]);

  const saveQuantity = async (item: ListedItem, raw: string) => {
    if (!month) return;
    const value = raw.trim() === '' ? null : Number(raw);
    if (value === quantityOf(item) || (value !== null && !Number.isInteger(value))) return;
    try {
      const count = await api.saveCount(item.id, month, { currentQty: value });
      setItems(prev => prev.map(i => (i.id === item.id ? { ...i, count } : i)));
      // One notification slot (key): quick edits down the column replace each other instead of stacking.
      message.success({
        key: 'quantity-saved',
        content: value === null
          ? `${item.name}: количество очищено`
          : `${item.name}: ${value} ${item.unit} — сохранено`,
        duration: 2,
      });
      if (!monthsWithData.has(month)) {
        setMonths(m => [{ month, itemCount: 1 }, ...(m ?? [])].sort((a, b) => b.month.localeCompare(a.month)));
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Ошибка сохранения');
    }
  };

  const counted = items.filter(i => quantityOf(i) !== null).length;

  const columns: RColumn<ListedItem>[] = [
    {
      title: 'Артикул', key: 'sku', width: 120,
      sorter: (a: ListedItem, b: ListedItem) => (a.sku ?? '').localeCompare(b.sku ?? '', 'ru', { numeric: true }),
      render: (_, i) => <span className="num">{i.sku ?? '—'}</span>,
    },
    {
      title: 'Фото', key: 'photo', width: 64, card: 'hidden',
      render: (_, i) => (i.photoUrl
        ? <img className="thumb" src={i.photoUrl} alt="" loading="lazy" />
        : <div className="thumb-empty"><PictureOutlined /></div>),
    },
    {
      title: 'Наименование', key: 'name', card: 'header',
      sorter: (a: ListedItem, b: ListedItem) => a.name.localeCompare(b.name, 'ru'),
      render: (_, i) => (
        <div style={{ minWidth: 180 }}>
          <div>{i.name}</div>
          {i.description && <div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{i.description}</div>}
        </div>
      ),
    },
    { title: 'Категория', key: 'category', render: (_, i) => i.category?.name ?? '—' },
    { title: 'Ед. изм.', key: 'unit', align: 'center', width: 90, render: (_, i) => i.unit },
    {
      title: 'Количество', key: 'quantity', align: 'right', width: 130,
      sorter: (a: ListedItem, b: ListedItem) => (quantityOf(a) ?? -1) - (quantityOf(b) ?? -1),
      render: (_, i) => {
        const value = quantityOf(i);
        if (editMode && !i.archived) {
          return (
            <InputNumber
              key={`${i.id}-${month}-${value}`}
              min={0}
              precision={0}
              defaultValue={value ?? undefined}
              placeholder="—"
              style={{ width: 96 }}
              onClick={e => e.stopPropagation()}
              onBlur={e => saveQuantity(i, e.target.value)}
              onPressEnter={e => (e.target as HTMLInputElement).blur()}
            />
          );
        }
        if (value !== null) return <span className="num">{value}</span>;
        // Not counted this month: show the last known quantity, greyed, with its month.
        if (i.previous?.currentQty != null) {
          return (
            <Tooltip title={`Не пересчитано. Последнее: ${formatMonth(i.previous.month)}`}>
              <span className="num muted">{i.previous.currentQty}*</span>
            </Tooltip>
          );
        }
        return <span className="muted">—</span>;
      },
    },
  ];

  const exportCsv = () => {
    if (!month) return;
    const category = singleCategory(items, i => i.category?.name);
    const columns: SheetColumn<ListedItem>[] = [
      { title: 'Артикул', value: i => i.sku },
      { title: 'Наименование', value: i => i.name },
      { title: 'Описание', value: i => i.description },
      ...(category ? [] : [{ title: 'Категория', value: (i: ListedItem) => i.category?.name }]),
      { title: 'Ед. изм.', value: i => i.unit },
      { title: 'Количество', value: i => quantityOf(i) },
    ];
    const meta: Array<[string, string]> = [['Месяц', formatMonth(month)]];
    if (category) meta.push(['Категория', category]);
    if (q) meta.push(['Поиск', q]);
    downloadCsv(
      `inventory-${month}${category ? `-${category.replace(/[^\p{L}\p{N}]+/gu, '_')}` : ''}.csv`,
      buildSheet({ title: 'Инвентаризация', meta, columns, rows: items }),
    );
  };

  if (!month) return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
        <Space wrap align="center" size="middle">
          <Typography.Title level={3} style={{ margin: 0 }}>Инвентарь</Typography.Title>
          <MonthPicker value={month} onChange={m => setParam('month', m)} monthsWithData={monthsWithData} />
          {!loading && <span className="muted">пересчитано {counted} из {items.length}</span>}
        </Space>
        <Space wrap>
          <Space>
            <Switch checked={editMode} onChange={setEditMode} />
            <span>Редактировать количество</span>
          </Space>
          <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={!items.length}>CSV</Button>
          {isAdmin && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate(`/items/new?month=${month}${categoryId ? `&category=${categoryId}` : ''}`)}
            >
              Позиция
            </Button>
          )}
        </Space>
      </Space>

      {!loading && !monthsWithData.has(month) && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title={`За ${formatMonth(month)} инвентаризации ещё нет`}
          description={
            <>
              Включите «Редактировать количество», чтобы внести данные за этот месяц. Серым со звёздочкой — последнее известное количество.
              {months?.[0] && <>{' '}<a onClick={() => setParam('month', months[0].month)}>Открыть {formatMonth(months[0].month)}</a></>}
            </>
          }
        />
      )}

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Поиск: название, артикул, описание"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 280 }}
        />
        <Select
          allowClear
          placeholder="Все категории"
          value={categoryId}
          onChange={v => setParam('category', v)}
          options={categories.map(c => ({ value: c.id, label: `${c.name} (${c.itemCount})` }))}
          style={{ minWidth: 240 }}
        />
        <Segmented options={STATUS_OPTIONS} value={status} onChange={v => setParam('status', v === 'active' ? undefined : v)} />
      </Space>

      <ResponsiveTable<ListedItem>
        rowKey="id"
        size="middle"
        loading={loading}
        // A category picked in the filter is the same on every row — no need for the column.
        columns={categoryId ? columns.filter(c => c.key !== 'category') : columns}
        dataSource={items}
        scroll={{ x: 'max-content' }}
        pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [25, 50, 100, 200], hideOnSinglePage: true }}
        rowClassName={(i: ListedItem) => (i.archived ? 'row-archived' : '')}
        onRow={(i: ListedItem) => ({ onClick: () => navigate(`/items/${i.id}?month=${month}`), style: { cursor: 'pointer' } })}
      />
    </div>
  );
}
