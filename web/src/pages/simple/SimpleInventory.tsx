import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Grid, Input, InputNumber, Segmented, Select, Space, Spin, Switch, Tooltip, Typography } from 'antd';
import { DownloadOutlined, PictureOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import ResponsiveTable, { type RColumn } from '../../components/ResponsiveTable';
import MonthPicker from '../../components/MonthPicker';
import { api, type Category, type ItemStatus, type ListedItem, type MonthSummary } from '../../api';
import { useAuth } from '../../auth';
import { buildSheet, downloadCsv, singleCategory, type SheetColumn } from '../../csv';
import { currentMonthKey, formatMonth } from '../../month';
import { cachedRows, cacheRows, FROM_LIST, useScrollRestore } from '../../listRestore';

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
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  // Rows for one list URL; on "back" the cached rows render at once so the scroll can be restored.
  const [data, setData] = useState<{ key: string; rows: ListedItem[] } | null>(null);
  const [categories, setCategories] = useState<Category[]>(() => cachedRows<Category[]>('categories') ?? []);
  const [months, setMonths] = useState<MonthSummary[] | null>(() => cachedRows<MonthSummary[]>('months') ?? null);
  const [editMode, setEditMode] = useState(false);
  const [search, setSearch] = useState(params.get('q') ?? '');
  // Same breakpoint as ResponsiveTable: cards below md (768px).
  const isMobile = Grid.useBreakpoint().md === false;

  const categoryId = params.get('category') ?? undefined;
  const status = (params.get('status') as ItemStatus) || 'active';
  const q = params.get('q') ?? '';
  // Without ?month= open the latest month that has counts, otherwise the current one.
  const month = params.get('month') ?? months?.[0]?.month ?? (months ? currentMonthKey() : null);
  const monthsWithData = useMemo(() => new Set(months?.map(m => m.month)), [months]);
  // Table page lives in the URL, so "back" from an item returns to the same page.
  const page = Number(params.get('page')) || 1;
  const pageSize = Number(params.get('size')) || 50;

  const listKey = month ? [month, categoryId ?? '', q, status].join('|') : null;
  const fresh = listKey && data?.key === listKey ? data.rows : null;
  const cached = listKey ? cachedRows<ListedItem[]>(listKey) : undefined;
  const items: ListedItem[] = fresh ?? cached ?? [];
  const loading = !fresh && !cached;
  useScrollRestore(`${listKey}|${page}|${pageSize}`, !loading);

  // Functional update: quick successive inline saves must not overwrite each other with stale rows.
  const setItems = (update: (rows: ListedItem[]) => ListedItem[]) => {
    if (!listKey) return;
    setData(d => {
      const base = (d?.key === listKey ? d.rows : cachedRows<ListedItem[]>(listKey)) ?? [];
      const rows = update(base);
      cacheRows(listKey, rows);
      return { key: listKey, rows };
    });
  };

  // Any filter change starts the table from page 1.
  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.delete('page');
    setParams(next, { replace: true });
  };

  const setPage = (nextPage: number, nextSize: number) => {
    const next = new URLSearchParams(params);
    if (nextPage > 1) next.set('page', String(nextPage)); else next.delete('page');
    if (nextSize !== 50) next.set('size', String(nextSize)); else next.delete('size');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => { if (search !== q) setParam('q', search.trim() || undefined); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    api.categories().then(c => { cacheRows('categories', c); setCategories(c); }).catch(e => message.error(e.message));
    api.months().then(m => { cacheRows('months', m); setMonths(m); }).catch(e => { setMonths([]); message.error(e.message); });
  }, [message]);

  // Always refetch; cached rows (if any) stay on screen meanwhile — no spinner, no jump.
  useEffect(() => {
    if (!month || !listKey) return;
    let cancelled = false;
    api.items({ month, categoryId, q: q || undefined, status })
      .then(rows => {
        cacheRows(listKey, rows);
        if (!cancelled) setData({ key: listKey, rows });
      })
      .catch(e => message.error(e.message));
    return () => { cancelled = true; };
  }, [listKey, month, categoryId, q, status, message]);

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
      title: 'Фото', key: 'photo', width: 64, card: 'media',
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

  const editSwitch = can('inventory.count') && (
    <Space>
      <Switch checked={editMode} onChange={setEditMode} />
      <span>Редактировать количество</span>
    </Space>
  );
  const csvButton = <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={!items.length}>CSV</Button>;
  const addButton = can('items.create') && (
    <Button
      type="primary"
      icon={<PlusOutlined />}
      onClick={() => navigate(`/items/new?month=${month}${categoryId ? `&category=${categoryId}` : ''}`)}
    >
      Позиция
    </Button>
  );


  return (
    <div>
      {isMobile ? (
        // Phone: title and "+ Позиция" share the first row; the month and tools go below.
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <Typography.Title level={3} style={{ margin: 0 }}>Инвентарь</Typography.Title>
            {addButton}
          </div>
          <Space wrap align="center" size="middle">
            <MonthPicker value={month} onChange={m => setParam('month', m)} monthsWithData={monthsWithData} />
            {!loading && <span className="muted">пересчитано {counted} из {items.length}</span>}
            {editSwitch}
            {csvButton}
          </Space>
        </div>
      ) : (
        <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
          <Space wrap align="center" size="middle">
            <Typography.Title level={3} style={{ margin: 0 }}>Инвентарь</Typography.Title>
            <MonthPicker value={month} onChange={m => setParam('month', m)} monthsWithData={monthsWithData} />
            {!loading && <span className="muted">пересчитано {counted} из {items.length}</span>}
          </Space>
          <Space wrap>
            {editSwitch}
            {csvButton}
            {addButton}
          </Space>
        </Space>
      )}

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
        pagination={{ current: page, pageSize, onChange: setPage, showSizeChanger: true, pageSizeOptions: [25, 50, 100, 200], hideOnSinglePage: true }}
        rowClassName={(i: ListedItem) => (i.archived ? 'row-archived' : '')}
        onRow={(i: ListedItem) => ({ onClick: () => navigate(`/items/${i.id}?month=${month}`, { state: FROM_LIST }), style: { cursor: 'pointer' } })}
      />
    </div>
  );
}
