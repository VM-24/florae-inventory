import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, App, Breadcrumb, Button, Card, Col, Descriptions, Empty, Form, Input, InputNumber,
  Popconfirm, Row, Select, Space, Spin, Table, Tag, Timeline, Typography,
} from 'antd';
import { DeleteOutlined, InboxOutlined, RollbackOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  api, type Category, type CountInput, type HistoryEntry, type ItemDetail, type ItemInput, type MonthlyCount,
} from '../api';
import { useAuth } from '../auth';
import { CURRENCY, formatMoney } from '../money';
import { currentMonthKey, formatMonth } from '../month';
import { cameFromList, useScrollTopOnEnter } from '../listRestore';
import { readableId } from './Inventory';
import { UNIT_OPTIONS } from '../units';
import PhotoGallery from '../components/PhotoGallery';
import MonthPicker from '../components/MonthPicker';

const FIELD_LABELS: Record<string, string> = {
  name: 'Наименование', categoryId: 'Категория', unit: 'Ед.', photos: 'Фото',
  openingQty: 'Открытие', currentQty: 'Текущий', shortageQty: 'Недостача',
  brokenQty: 'Списание', endOfMonthQty: 'На конец месяца', unitPrice: 'Цена/ед', note: 'Примечание', archivedAt: 'Архив',
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  'item.create': { label: 'Создана', color: 'green' },
  'item.update': { label: 'Карточка', color: 'blue' },
  'item.archive': { label: 'В архив', color: 'gray' },
  'item.restore': { label: 'Восстановлена', color: 'green' },
  'item.photo.add': { label: 'Фото добавлены', color: 'purple' },
  'item.photo.delete': { label: 'Фото удалено', color: 'purple' },
  'item.photo.cover': { label: 'Главное фото', color: 'purple' },
  'count.create': { label: 'Пересчёт', color: 'cyan' },
  'count.update': { label: 'Пересчёт', color: 'cyan' },
  'count.delete': { label: 'Пересчёт удалён', color: 'red' },
};


type CatalogValues = ItemInput;
type CountValues = { currentQty: number | null; shortageQty: number | null; brokenQty: number | null; endOfMonthQty: number | null; note: string };

const emptyCount: CountValues = { currentQty: null, shortageQty: 0, brokenQty: 0, endOfMonthQty: null, note: '' };

const toCountValues = (c: MonthlyCount | undefined): CountValues => (c
  ? { currentQty: c.currentQty, shortageQty: c.shortageQty, brokenQty: c.brokenQty, endOfMonthQty: c.endOfMonthQty, note: c.note ?? '' }
  : emptyCount);

const fromCountValues = (v: CountValues): CountInput => ({
  currentQty: v.currentQty ?? null,
  shortageQty: v.shortageQty ?? 0,
  brokenQty: v.brokenQty ?? 0,
  endOfMonthQty: v.endOfMonthQty ?? null,
  note: v.note?.trim() || null,
});

const isEmptyCount = (v: CountValues) =>
  v.currentQty == null && !v.shortageQty && !v.brokenQty && v.endOfMonthQty == null && !v.note?.trim();

const qty = (v: number | null) => (v === null ? '—' : v);

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'unitPrice') return formatMoney(Number(value));
  if (key === 'archivedAt') return dayjs(String(value)).format('DD.MM.YYYY');
  if (key === 'photos') return `${(value as unknown[]).length} шт.`;
  return String(value);
}

function HistoryList({ entries, categories }: { entries: HistoryEntry[]; categories: Category[] }) {
  if (!entries.length) return <Empty description="Изменений пока нет" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  const catName = (id: unknown) => categories.find(c => c.id === id)?.name ?? String(id);
  return (
    <Timeline
      items={entries.map(e => {
        const meta = ACTION_LABELS[e.action] ?? { label: e.action, color: 'gray' };
        const month = (e.after?.month ?? e.before?.month) as string | undefined;
        const keys = e.action === 'item.create' || e.action === 'count.delete'
          ? []
          : Object.keys(e.after ?? e.before ?? {}).filter(k => k !== 'month');
        return {
          color: meta.color,
          content: (
            <div>
              <Space size={6} wrap>
                <Tag color={meta.color}>{meta.label}{month ? ` · ${formatMonth(month)}` : ''}</Tag>
                <span className="muted">{dayjs(e.createdAt).format('DD.MM.YYYY HH:mm')}</span>
                <span>{e.user?.name ?? 'система'}</span>
              </Space>
              {keys.map(k => {
                const show = (v: unknown) => (k === 'categoryId' ? catName(v) : formatValue(k, v));
                return (
                  <div key={k} style={{ fontSize: 13, marginTop: 2 }}>
                    <span className="muted">{FIELD_LABELS[k] ?? k}:</span>{' '}
                    {show(e.before?.[k])} → <strong>{show(e.after?.[k])}</strong>
                  </div>
                );
              })}
            </div>
          ),
        };
      })}
    />
  );
}

export default function ItemPage() {
  const { id } = useParams();
  const isNew = !id;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  useScrollTopOnEnter();
  // Back to the list: real "back" when we came from it (restores its page and scroll), else open it.
  const backToList = () => (cameFromList(location.state) ? navigate(-1) : navigate(`/?month=${searchParams.get('month') ?? ''}`));
  const { message } = App.useApp();
  const { isAdmin } = useAuth();
  const [catalogForm] = Form.useForm<CatalogValues>();
  const [countForm] = Form.useForm<CountValues>();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [savingCatalog, setSavingCatalog] = useState(false);
  const [savingCount, setSavingCount] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]); // picked before the item exists

  const month = searchParams.get('month') ?? currentMonthKey();
  const setMonth = (key: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('month', key);
    setSearchParams(next, { replace: true, state: location.state });
  };


  const unitPrice = Form.useWatch('unitPrice', catalogForm) ?? 0;
  const brokenQty = Form.useWatch('brokenQty', countForm) ?? 0;
  const shortageQty = Form.useWatch('shortageQty', countForm) ?? 0;
  const currentQty = Form.useWatch('currentQty', countForm);
  const line = (q: number) => Math.round(Number(unitPrice) * 100) * q / 100;

  const readOnly = item?.archived ?? false;
  const monthCount = item?.counts.find(c => c.month === month);

  const loadHistory = (itemId: string) => api.itemHistory(itemId).then(setHistory).catch(() => {});
  const reload = async (itemId: string) => {
    const fresh = await api.item(itemId);
    setItem(fresh);
    void loadHistory(itemId);
    return fresh;
  };

  useEffect(() => {
    api.categories().then(setCategories).catch(e => message.error(e.message));
  }, [message]);

  useEffect(() => {
    if (isNew) {
      catalogForm.setFieldsValue({
        categoryId: searchParams.get('category') ?? undefined, unit: 'шт', unitPrice: 0, openingQty: null,
      } as Partial<CatalogValues>);
      countForm.setFieldsValue(emptyCount);
      return;
    }
    setLoading(true);
    reload(id)
      .then(i => catalogForm.setFieldsValue({
        sku: i.sku, categoryId: i.category?.id, name: i.name, unit: i.unit, openingQty: i.openingQty, unitPrice: i.unitPrice,
      }))
      .catch(e => message.error(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Switching month (or reloading) shows that month's count in the form.
  useEffect(() => {
    if (!isNew) countForm.setFieldsValue(toCountValues(monthCount));
  }, [isNew, month, monthCount, countForm]);

  const createAll = async () => {
    const [catalog, count] = await Promise.all([catalogForm.validateFields(), countForm.validateFields()]);
    setSavingCatalog(true);
    try {
      const created = await api.createItem({ ...catalog, name: catalog.name.trim(), openingQty: catalog.openingQty ?? null, unitPrice: catalog.unitPrice ?? 0 });
      if (!isEmptyCount(count)) await api.saveCount(created.id, month, fromCountValues(count));
      if (pendingPhotos.length) await api.uploadItemPhotos(created.id, pendingPhotos);
      message.success('Позиция добавлена');
      navigate(`/items/${created.id}?month=${month}`, { replace: true });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSavingCatalog(false);
    }
  };

  const saveCatalog = async (values: CatalogValues) => {
    setSavingCatalog(true);
    try {
      await api.updateItem(id!, { ...values, name: values.name.trim(), openingQty: values.openingQty ?? null, unitPrice: values.unitPrice ?? 0 });
      await reload(id!);
      message.success('Карточка сохранена');
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSavingCatalog(false);
    }
  };

  const saveCount = async (values: CountValues) => {
    setSavingCount(true);
    try {
      await api.saveCount(id!, month, fromCountValues(values));
      await reload(id!);
      message.success(`Пересчёт за ${formatMonth(month)} сохранён`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSavingCount(false);
    }
  };

  const removeCount = async (key: string) => {
    try {
      await api.deleteCount(id!, key);
      await reload(id!);
      message.success(`Пересчёт за ${formatMonth(key)} удалён`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const setArchived = async (archived: boolean) => {
    try {
      await api.updateItem(id!, { archived });
      await reload(id!);
      message.success(archived ? 'Перемещено в архив' : 'Восстановлено');
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const remove = async () => {
    try {
      await api.deleteItem(id!);
      message.success('Позиция удалена');
      navigate('/', { replace: true });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;
  if (!isNew && !item) return <Empty description="Позиция не найдена" />;

  const catalogDisabled = readOnly || !isAdmin;
  const monthsWithData = new Set(item?.counts.map(c => c.month));

  const monthPicker = <MonthPicker size="small" width={150} value={month} onChange={setMonth} monthsWithData={monthsWithData} />;

  const monthColumns = [
    { title: 'Месяц', key: 'month', render: (_: unknown, c: MonthlyCount) => <span style={{ whiteSpace: 'nowrap', fontWeight: c.month === month ? 600 : undefined }}>{formatMonth(c.month)}</span> },
    { title: 'Текущий', key: 'currentQty', align: 'right' as const, render: (_: unknown, c: MonthlyCount) => <span className="num">{qty(c.currentQty)}</span> },
    { title: 'Недостача', key: 'shortageQty', align: 'right' as const, render: (_: unknown, c: MonthlyCount) => <span className={`num ${c.shortageQty ? 'loss' : ''}`}>{c.shortageQty}</span> },
    { title: 'Списание', key: 'brokenQty', align: 'right' as const, render: (_: unknown, c: MonthlyCount) => <span className={`num ${c.brokenQty ? 'loss' : ''}`}>{c.brokenQty}</span> },
    { title: 'Конец месяца', key: 'endOfMonthQty', align: 'right' as const, render: (_: unknown, c: MonthlyCount) => <span className="num">{qty(c.endOfMonthQty)}</span> },
    { title: 'Сумма списания', key: 'brokenSum', align: 'right' as const, render: (_: unknown, c: MonthlyCount) => <span className="num">{formatMoney(c.brokenSum)}</span> },
    { title: 'Сумма недостачи', key: 'shortageSum', align: 'right' as const, render: (_: unknown, c: MonthlyCount) => <span className="num">{formatMoney(c.shortageSum)}</span> },
    { title: 'Примечание', key: 'note', render: (_: unknown, c: MonthlyCount) => c.note ?? '' },
    ...(isAdmin ? [{
      title: '', key: 'actions', width: 56,
      render: (_: unknown, c: MonthlyCount) => (
        <span onClick={e => e.stopPropagation()}>
          <Popconfirm title={`Удалить пересчёт за ${formatMonth(c.month)}?`} okText="Удалить" cancelText="Отмена" okButtonProps={{ danger: true }} onConfirm={() => removeCount(c.month)}>
            <Button size="small" danger icon={<DeleteOutlined />} aria-label="Удалить пересчёт" />
          </Popconfirm>
        </span>
      ),
    }] : []),
  ];

  return (
    <div style={{ maxWidth: 1100 }}>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <a onClick={backToList}>Инвентарь</a> },
          { title: isNew ? 'Новая позиция' : readableId(item!.number) },
        ]}
      />
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {isNew ? 'Новая позиция' : item!.name}
          {item?.archived && <Tag style={{ marginLeft: 8 }}>Архив</Tag>}
        </Typography.Title>
        {!isNew && isAdmin && (
          <Space wrap>
            {item!.archived ? (
              <>
                <Button icon={<RollbackOutlined />} onClick={() => setArchived(false)}>Восстановить</Button>
                <Popconfirm
                  title="Удалить навсегда?"
                  description="Позиция, её пересчёты и фото будут удалены. Записи журнала сохранятся."
                  okText="Удалить" cancelText="Отмена" okButtonProps={{ danger: true }}
                  onConfirm={remove}
                >
                  <Button danger icon={<DeleteOutlined />}>Удалить</Button>
                </Popconfirm>
              </>
            ) : (
              <Popconfirm title="Переместить в архив?" description="Позиция скроется из списка, история сохранится." okText="В архив" cancelText="Отмена" onConfirm={() => setArchived(true)}>
                <Button icon={<InboxOutlined />}>В архив</Button>
              </Popconfirm>
            )}
          </Space>
        )}
      </Space>

      {readOnly && <Alert type="info" showIcon style={{ marginBottom: 16 }} title="Позиция в архиве — восстановите её, чтобы редактировать." />}

      <Row gutter={16}>
        <Col xs={24} md={8}>
          {isNew ? (
            <PhotoGallery pending={pendingPhotos} onPendingChange={setPendingPhotos} />
          ) : (
            <PhotoGallery
              itemId={item!.id}
              photos={item!.photos}
              onChange={() => void reload(item!.id)}
              readOnly={readOnly}
            />
          )}
        </Col>

        <Col xs={24} md={16}>
          <Card size="small" title="Карточка" style={{ marginBottom: 16 }}>
            <Form<CatalogValues> form={catalogForm} layout="vertical" onFinish={saveCatalog} requiredMark="optional">
              <Form.Item name="sku" label="Артикул" rules={[{ max: 50 }]}>
                <Input disabled={catalogDisabled} placeholder="Необязательно" style={{ maxWidth: 240 }} />
              </Form.Item>
              <Form.Item name="name" label="Наименование" rules={[{ required: true, whitespace: true, message: 'Укажите название' }, { max: 200 }]}>
                <Input disabled={catalogDisabled} />
              </Form.Item>
              <Row gutter={12}>
                <Col xs={24} sm={14}>
                  <Form.Item name="categoryId" label="Категория" rules={[{ required: true, message: 'Выберите категорию' }]}>
                    <Select disabled={catalogDisabled} options={categories.map(c => ({ value: c.id, label: c.name }))} showSearch={{ optionFilterProp: 'label' }} />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={5}>
                  <Form.Item name="unit" label="Ед." rules={[{ required: true }]}>
                    <Select disabled={catalogDisabled} options={UNIT_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={5}>
                  <Form.Item name="openingQty" label="Открытие" tooltip="Количество на момент открытия заведения">
                    <InputNumber disabled={catalogDisabled} min={0} precision={0} style={{ width: '100%' }} placeholder="—" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="unitPrice" label={`Цена за единицу, ${CURRENCY}`} style={{ marginBottom: isNew || catalogDisabled ? 0 : undefined }}>
                <InputNumber disabled={catalogDisabled} min={0} precision={2} step={1} decimalSeparator="," style={{ width: '100%', maxWidth: 240 }} suffix="zł" />
              </Form.Item>
              {!isNew && !catalogDisabled && (
                <Button htmlType="submit" icon={<SaveOutlined />} loading={savingCatalog}>Сохранить карточку</Button>
              )}
            </Form>
          </Card>

          <Card size="small" title={<Space wrap><span>Пересчёт за</span>{monthPicker}</Space>} style={{ marginBottom: 16 }}>
            <Form<CountValues> form={countForm} layout="vertical" onFinish={saveCount}>
              {!isNew && !monthCount && (
                <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                  За {formatMonth(month)} пересчёта ещё нет — заполните и сохраните.
                </Typography.Paragraph>
              )}
              <Row gutter={12}>
                <Col xs={12} sm={6}>
                  <Form.Item name="currentQty" label="Текущее кол-во">
                    <InputNumber disabled={readOnly} min={0} precision={0} style={{ width: '100%' }} placeholder="—" />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={6}>
                  <Form.Item name="shortageQty" label="Недостача">
                    <InputNumber disabled={readOnly} min={0} precision={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={6}>
                  <Form.Item name="brokenQty" label="Списание">
                    <InputNumber disabled={readOnly} min={0} precision={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={6}>
                  <Form.Item name="endOfMonthQty" label="На конец месяца">
                    <InputNumber disabled={readOnly} min={0} precision={0} style={{ width: '100%' }} placeholder="—" />
                  </Form.Item>
                </Col>
              </Row>
              <Descriptions size="small" column={{ xs: 1, sm: 3 }} bordered>
                <Descriptions.Item label="Сумма списания"><span className="num loss">{formatMoney(line(brokenQty))}</span></Descriptions.Item>
                <Descriptions.Item label="Сумма недостачи"><span className="num loss">{formatMoney(line(shortageQty))}</span></Descriptions.Item>
                <Descriptions.Item label="Стоимость в наличии"><span className="num">{currentQty == null ? '—' : formatMoney(line(currentQty))}</span></Descriptions.Item>
              </Descriptions>
              <Form.Item name="note" label="Примечание" style={{ marginTop: 16 }} rules={[{ max: 1000 }]}>
                <Input.TextArea disabled={readOnly} rows={2} placeholder="Напр.: 20 шт. дозаказ в пути; 2 без ручки" />
              </Form.Item>
              {!isNew && !readOnly && (
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={savingCount}>
                  Сохранить пересчёт
                </Button>
              )}
            </Form>
          </Card>

          {isNew && (
            <Button type="primary" icon={<SaveOutlined />} loading={savingCatalog} size="large" onClick={() => createAll().catch(() => {})}>
              Создать
            </Button>
          )}
        </Col>
      </Row>

      {!isNew && (
        <>
          <Card size="small" title="По месяцам" style={{ marginTop: 8 }}>
            <Table<MonthlyCount>
              rowKey="month"
              size="small"
              columns={monthColumns}
              dataSource={item!.counts}
              pagination={false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: 'Пересчётов пока нет' }}
              onRow={c => ({ onClick: () => setMonth(c.month), style: { cursor: 'pointer' } })}
            />
          </Card>
          <Card size="small" title="История изменений" style={{ marginTop: 24 }}>
            <HistoryList entries={history} categories={categories} />
          </Card>
        </>
      )}
    </div>
  );
}
