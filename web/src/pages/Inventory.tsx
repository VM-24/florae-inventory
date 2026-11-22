import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, App, Button, Card, Col, Input, InputNumber, Row, Segmented, Select, Space, Spin, Statistic,
  Switch, Table, Tooltip, Typography,
} from 'antd';
import { DownloadOutlined, PictureOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import ResponsiveTable, { type RColumn } from '../components/ResponsiveTable';
import MonthPicker from '../components/MonthPicker';
import { api, type Category, type CountInput, type ListedItem, type ItemStatus, type MonthSummary } from '../api';
import { useAuth } from '../auth';
import { formatMoney, sumMoney } from '../money';
import { buildSheet, downloadCsv, singleCategory, type SheetColumn } from '../csv';
import { currentMonthKey, formatMonth } from '../month';

const STATUS_OPTIONS: { label: string; value: ItemStatus }[] = [
  { label: 'Активные', value: 'active' },
  { label: 'Архив', value: 'archived' },
  { label: 'Все', value: 'all' },
];

type CountField = 'currentQty' | 'shortageQty' | 'brokenQty' | 'endOfMonthQty';
const NULLABLE: CountField[] = ['currentQty', 'endOfMonthQty'];

export const readableId = (n: number) => `INV-${String(n).padStart(4, '0')}`;
const qty = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v);

export default function Inventory() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<ListedItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [months, setMonths] = useState<MonthSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [countMode, setCountMode] = useState(false);
  const [search, setSearch] = useState(params.get('q') ?? '');

  const categoryId = params.get('category') ?? undefined;
  const status = (params.get('status') as ItemStatus) || 'active';
  const q = params.get('q') ?? '';
  // Without ?month= open the latest counted month, so the page never starts empty.
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

  const totals = useMemo(() => {
    const counts = items.flatMap(i => (i.count ? [i.count] : []));
    return {
      counted: counts.filter(c => c.currentQty !== null).length,
      value: sumMoney(counts.map(c => c.currentValue ?? 0)),
      broken: sumMoney(counts.map(c => c.brokenSum)),
      shortage: sumMoney(counts.map(c => c.shortageSum)),
      brokenQty: counts.reduce((s, c) => s + c.brokenQty, 0),
      shortageQty: counts.reduce((s, c) => s + c.shortageQty, 0),
    };
  }, [items]);

  // Count mode: inline entry for the selected month, saved on blur.
  const saveCount = async (item: ListedItem, field: CountField, raw: string) => {
    if (!month) return;
    const value = raw.trim() === '' ? (NULLABLE.includes(field) ? null : 0) : Number(raw);
    const old = item.count?.[field] ?? (NULLABLE.includes(field) ? null : 0);
    if (value === old || (value !== null && !Number.isInteger(value))) return;
    try {
      const count = await api.saveCount(item.id, month, { [field]: value } as CountInput);
      setItems(prev => prev.map(i => (i.id === item.id ? { ...i, count } : i)));
      if (!monthsWithData.has(month)) {
        setMonths(m => [{ month, itemCount: 1 }, ...(m ?? [])].sort((a, b) => b.month.localeCompare(a.month)));
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Ошибка сохранения');
    }
  };

  const countCell = (field: CountField) => (_: unknown, item: ListedItem) => {
    const value = item.count?.[field] ?? null;
    if (countMode && !item.archived) {
      return (
        <InputNumber
          key={`${item.id}-${month}-${value}`}
          min={0}
          precision={0}
          defaultValue={value ?? undefined}
          placeholder="—"
          style={{ width: 84 }}
          onClick={e => e.stopPropagation()}
          onBlur={e => saveCount(item, field, e.target.value)}
          onPressEnter={e => (e.target as HTMLInputElement).blur()}
        />
      );
    }
    const isLoss = (field === 'shortageQty' || field === 'brokenQty') && (value ?? 0) > 0;
    return <span className={`num ${isLoss ? 'loss' : ''}`}>{qty(value)}</span>;
  };

  const columns: RColumn<ListedItem>[] = [
    {
      title: '', key: 'photo', width: 56, card: 'hidden',
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
          <div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>
            {i.sku ? `арт. ${i.sku}` : readableId(i.number)} · {i.unit}{i.count?.note ? ` · ${i.count.note}` : ''}
          </div>
        </div>
      ),
    },
    { title: 'Категория', key: 'category', render: (_, i) => i.category?.name ?? '—' },
    { title: 'Открытие', key: 'openingQty', align: 'right', render: (_, i) => <span className="num">{qty(i.openingQty)}</span> },
    {
      title: 'Прошлый', key: 'previous', align: 'right', cardLabel: 'Прошлый пересчёт',
      render: (_, i) => (i.previous
        ? <Tooltip title={formatMonth(i.previous.month)}><span className="num muted">{qty(i.previous.currentQty)}</span></Tooltip>
        : <span className="muted">—</span>),
    },
    {
      title: 'Текущий', key: 'currentQty', align: 'right', render: countCell('currentQty'),
      sorter: (a: ListedItem, b: ListedItem) => (a.count?.currentQty ?? -1) - (b.count?.currentQty ?? -1),
    },
    { title: 'Недостача', key: 'shortageQty', align: 'right', render: countCell('shortageQty') },
    { title: 'Списание', key: 'brokenQty', align: 'right', render: countCell('brokenQty') },
    { title: 'Конец месяца', key: 'endOfMonthQty', align: 'right', render: countCell('endOfMonthQty') },
    { title: 'Цена/ед', key: 'unitPrice', align: 'right', render: (_, i) => <span className="num">{formatMoney(i.unitPrice)}</span> },
    {
      title: 'Сумма списания', key: 'brokenSum', align: 'right',
      sorter: (a: ListedItem, b: ListedItem) => (a.count?.brokenSum ?? 0) - (b.count?.brokenSum ?? 0),
      render: (_, i) => {
        const v = i.count?.brokenSum ?? 0;
        return <span className={`num ${v > 0 ? 'loss' : ''}`}>{formatMoney(v)}</span>;
      },
    },
    {
      title: 'Сумма недостачи', key: 'shortageSum', align: 'right',
      sorter: (a: ListedItem, b: ListedItem) => (a.count?.shortageSum ?? 0) - (b.count?.shortageSum ?? 0),
      render: (_, i) => {
        const v = i.count?.shortageSum ?? 0;
        return <span className={`num ${v > 0 ? 'loss' : ''}`}>{formatMoney(v)}</span>;
      },
    },
  ];

  const exportCsv = () => {
    if (!month) return;
    const money = (n: number) => n.toFixed(2).replace('.', ',');
    const category = singleCategory(items, i => i.category?.name);
    const columns: SheetColumn<ListedItem>[] = [
      { title: 'Артикул', value: i => i.sku },
      ...(category ? [] : [{ title: 'Категория', value: (i: ListedItem) => i.category?.name }]),
      { title: 'Наименование', value: i => i.name },
      { title: 'Ед.', value: i => i.unit },
      { title: 'Открытие', value: i => i.openingQty },
      { title: 'Прошлый пересчёт', value: i => i.previous?.currentQty },
      { title: 'Текущий', value: i => i.count?.currentQty },
      { title: 'Недостача', value: i => i.count?.shortageQty },
      { title: 'Списание', value: i => i.count?.brokenQty },
      { title: 'На конец месяца', value: i => i.count?.endOfMonthQty },
      { title: 'Цена/ед, PLN', value: i => money(i.unitPrice) },
      { title: 'Сумма списания, PLN', value: i => money(i.count?.brokenSum ?? 0) },
      { title: 'Сумма недостачи, PLN', value: i => money(i.count?.shortageSum ?? 0) },
      { title: 'Примечание', value: i => i.count?.note },
    ];
    const meta: Array<[string, string]> = [['Месяц', formatMonth(month)]];
    if (category) meta.push(['Категория', category]);
    meta.push(['Сумма списания, PLN', money(totals.broken)], ['Сумма недостачи, PLN', money(totals.shortage)]);
    downloadCsv(
      `inventory-${month}${category ? `-${category.replace(/[^\p{L}\p{N}]+/gu, '_')}` : ''}.csv`,
      buildSheet({ title: 'Инвентаризация', meta, columns, rows: items }),
    );
  };

  if (!month) return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;

  const monthHasData = monthsWithData.has(month);

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
        <Space wrap align="center" size="middle">
          <Typography.Title level={3} style={{ margin: 0 }}>Инвентарь</Typography.Title>
          <MonthPicker value={month} onChange={m => setParam('month', m)} monthsWithData={monthsWithData} />
        </Space>
        <Space wrap>
          <Tooltip title="Вводить текущее количество, недостачу, списание и остаток на конец месяца прямо в таблице — за выбранный месяц.">
            <Space>
              <Switch checked={countMode} onChange={setCountMode} />
              <span>Режим пересчёта</span>
            </Space>
          </Tooltip>
          <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={!items.length}>CSV</Button>
          {isAdmin && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/items/new?month=${month}${categoryId ? `&category=${categoryId}` : ''}`)}>
              Позиция
            </Button>
          )}
        </Space>
      </Space>

      {!loading && !monthHasData && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title={`За ${formatMonth(month)} пересчёта ещё нет`}
          description={
            <>
              Включите «Режим пересчёта», чтобы внести данные за этот месяц. В колонке «Прошлый» — количество из последнего пересчёта.
              {months?.[0] && (
                <>{' '}<a onClick={() => setParam('month', months[0].month)}>Открыть {formatMonth(months[0].month)}</a></>
              )}
            </>
          }
        />
      )}

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="Пересчитано" value={totals.counted} suffix={`из ${items.length}`} /></Card>
        </Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Стоимость в наличии" value={formatMoney(totals.value)} /></Card></Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title={`Списание (${totals.brokenQty} шт.)`} value={formatMoney(totals.broken)} styles={{ content: { color: totals.broken ? '#cf1322' : undefined } }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title={`Недостача (${totals.shortageQty} шт.)`} value={formatMoney(totals.shortage)} styles={{ content: { color: totals.shortage ? '#cf1322' : undefined } }} />
          </Card>
        </Col>
      </Row>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Поиск по названию"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 240 }}
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
        columns={columns}
        dataSource={items}
        scroll={{ x: 'max-content' }}
        pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [25, 50, 100, 200], hideOnSinglePage: true }}
        rowClassName={(i: ListedItem) => (i.archived ? 'row-archived' : '')}
        onRow={(i: ListedItem) => ({ onClick: () => navigate(`/items/${i.id}?month=${month}`), style: { cursor: 'pointer' } })}
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={6}><strong>Итого за {formatMonth(month)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={6} align="right"><strong className="num">{totals.shortageQty}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={7} align="right"><strong className="num">{totals.brokenQty}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={8} colSpan={2} />
              <Table.Summary.Cell index={10} align="right"><strong className="num loss">{formatMoney(totals.broken)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={11} align="right"><strong className="num loss">{formatMoney(totals.shortage)}</strong></Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </div>
  );
}
