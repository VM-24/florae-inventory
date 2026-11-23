import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, App, AutoComplete, Breadcrumb, Button, Card, Col, Empty, Form, Input, InputNumber, Popconfirm, Row, Select, Space, Spin, Table,
  Tag, Typography,
} from 'antd';
import { DeleteOutlined, InboxOutlined, RollbackOutlined, SaveOutlined } from '@ant-design/icons';
import { api, type Category, type HistoryEntry, type ItemDetail, type MonthlyCount } from '../../api';
import { HistoryHint, HistoryList } from '../../history';
import { editableFields, ITEM_FIELD_PERMISSIONS, type ItemField } from '../../permissions';
import { useAuth } from '../../auth';
import { currentMonthKey, formatMonth } from '../../month';
import { cameFromList, useScrollTopOnEnter } from '../../listRestore';
import { UNIT_OPTIONS } from '../../units';
import PhotoGallery from '../../components/PhotoGallery';
import MonthPicker from '../../components/MonthPicker';

// Simple mode card: Артикул, Фото (several), Наименование, Описание, Категория, Ед. изм., Количество.
// Quantity belongs to the selected inventory month (?month=YYYY-MM, default: current month).

type Values = {
  sku: string; name: string; description: string; categoryId: string | undefined; unit: string; quantity: number | null;
};

const quantityIn = (item: ItemDetail, month: string) => item.counts.find(c => c.month === month)?.currentQty ?? null;

export default function SimpleItemPage() {
  const { id } = useParams();
  const isNew = !id;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  useScrollTopOnEnter();
  // Back to the list: real "back" when we came from it (restores its page and scroll), else open it.
  const backToList = () => (cameFromList(location.state) ? navigate(-1) : navigate(`/?month=${searchParams.get('month') ?? ''}`));
  const { message } = App.useApp();
  const { can } = useAuth();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [form] = Form.useForm<Values>();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]); // picked before the item exists

  const readOnly = item?.archived ?? false;
  const month = searchParams.get('month') ?? currentMonthKey();
  const setMonth = (m: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('month', m);
    setSearchParams(next, { replace: true, state: location.state });
  };

  const fill = (i: ItemDetail) => form.setFieldsValue({
    sku: i.sku ?? '', name: i.name, description: i.description ?? '', categoryId: i.category?.id, unit: i.unit,
    quantity: quantityIn(i, month),
  });

  // Switching the month shows that month's quantity; other (unsaved) fields stay as typed.
  useEffect(() => {
    if (item) form.setFieldValue('quantity', quantityIn(item, month));
  }, [month, item, form]);

  useEffect(() => {
    api.categories().then(setCategories).catch(e => message.error(e.message));
  }, [message]);

  useEffect(() => {
    if (isNew) {
      form.setFieldsValue({
        sku: '', name: '', description: '', categoryId: searchParams.get('category') ?? undefined, unit: 'шт', quantity: null,
      });
      return;
    }
    setLoading(true);
    api.item(id)
      .then(i => { setItem(i); fill(i); void loadHistory(i.id); })
      .catch(e => message.error(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadHistory = (itemId: string) =>
    (can('inventory.view') ? api.itemHistory(itemId).then(setHistory).catch(() => {}) : Promise.resolve());

  const save = async (v: Values) => {
    setSaving(true);
    try {
      const catalog = {
        sku: v.sku.trim() || null,
        name: v.name.trim(),
        description: v.description?.trim() || null,
        categoryId: v.categoryId ?? null,
        unit: v.unit.trim(),
      };
      if (isNew) {
        const created = await api.createItem(catalog);
        if (v.quantity !== null && v.quantity !== undefined) await api.saveCount(created.id, month, { currentQty: v.quantity });
        if (pendingPhotos.length) {
          try {
            await api.uploadItemPhotos(created.id, pendingPhotos);
          } catch (e) {
            // The item exists already — open it, the photos can be re-added there.
            message.warning(`Позиция создана, но фото не загрузились: ${e instanceof Error ? e.message : 'ошибка'}`);
          }
        }
        message.success('Позиция добавлена');
        navigate(`/items/${created.id}?month=${month}`, { replace: true });
        return;
      }
      // Only fields this user may change; the server enforces the same rule.
      const patch = editableFields(catalog, can);
      if (Object.keys(patch).length) await api.updateItem(id, patch);
      const quantity = v.quantity ?? null;
      if (quantity !== quantityIn(item!, month)) await api.saveCount(id, month, { currentQty: quantity });
      const fresh = await api.item(id);
      void loadHistory(id);
      setItem(fresh);
      fill(fresh);
      message.success('Сохранено');
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const refresh = async () => {
    const fresh = await api.item(id!);
    setItem(fresh);
    void loadHistory(fresh.id);
  };

  const setArchived = async (archived: boolean) => {
    try {
      await api.updateItem(id!, { archived });
      await refresh();
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

  const monthsWithData = new Set(item?.counts.map(c => c.month));
  // Each card field has its own permission; a new item needs only items.create.
  const fieldDisabled = (field: ItemField) => readOnly || !can(isNew ? 'items.create' : ITEM_FIELD_PERMISSIONS[field]);
  const anyFieldEditable = (['sku', 'name', 'description', 'categoryId', 'unit'] as ItemField[]).some(f => !fieldDisabled(f));
  const quantityDisabled = readOnly || !can('inventory.count');
  const canSave = isNew ? can('items.create') : anyFieldEditable || !quantityDisabled;

  return (
    <div style={{ maxWidth: 900 }}>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <a onClick={backToList}>Инвентарь</a> },
          { title: isNew ? 'Новая позиция' : item!.sku ?? item!.name },
        ]}
      />
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {isNew ? 'Новая позиция' : item!.name}
          {item?.archived && <Tag style={{ marginLeft: 8 }}>Архив</Tag>}
        </Typography.Title>
        {!isNew && (can('items.archive') || can('items.delete')) && (
          <Space wrap>
            {item!.archived ? (
              <>
                {can('items.archive') && <Button icon={<RollbackOutlined />} onClick={() => setArchived(false)}>Восстановить</Button>}
                {can('items.delete') && <Popconfirm
                  title="Удалить навсегда?"
                  description="Позиция и её фото будут удалены."
                  okText="Удалить" cancelText="Отмена" okButtonProps={{ danger: true }}
                  onConfirm={remove}
                >
                  <Button danger icon={<DeleteOutlined />}>Удалить</Button>
                </Popconfirm>}
              </>
            ) : can('items.archive') && (
              <Popconfirm title="Переместить в архив?" description="Позиция скроется из списка, её можно будет восстановить." okText="В архив" cancelText="Отмена" onConfirm={() => setArchived(true)}>
                <Button icon={<InboxOutlined />}>В архив</Button>
              </Popconfirm>
            )}
          </Space>
        )}
      </Space>

      {readOnly && <Alert type="info" showIcon style={{ marginBottom: 16 }} title="Позиция в архиве — восстановите её, чтобы редактировать." />}

      <Row gutter={16}>
        <Col xs={24} md={9}>
          {isNew ? (
            <PhotoGallery pending={pendingPhotos} onPendingChange={setPendingPhotos} />
          ) : (
            <PhotoGallery
              itemId={item!.id}
              photos={item!.photos}
              onChange={photos => {
                setItem(prev => (prev ? { ...prev, photos, photoUrl: photos[0]?.url ?? null } : prev));
                void loadHistory(item!.id);
              }}
              readOnly={readOnly || !can('inventory.photos')}
            />
          )}
        </Col>

        <Col xs={24} md={15}>
          <Card size="small" style={{ marginBottom: 16 }}>
            <Form<Values> form={form} layout="vertical" onFinish={save} requiredMark="optional">
              <Form.Item name="sku" label="Артикул" rules={[{ max: 50 }]}>
                <Input disabled={fieldDisabled('sku')} placeholder="Необязательно" style={{ maxWidth: 260 }} />
              </Form.Item>
              <Form.Item name="name" label="Наименование" rules={[{ required: true, whitespace: true, message: 'Укажите название' }, { max: 200 }]}>
                <Input disabled={fieldDisabled('name')} />
              </Form.Item>
              <Form.Item name="description" label="Описание" rules={[{ max: 1000 }]}>
                <Input.TextArea disabled={fieldDisabled('description')} rows={2} placeholder="Необязательно" />
              </Form.Item>
              <Form.Item name="categoryId" label="Категория" rules={[{ required: true, message: 'Выберите категорию' }]}>
                <Select
                  disabled={fieldDisabled('categoryId')}
                  options={categories.map(c => ({ value: c.id, label: c.name }))}
                  showSearch={{ optionFilterProp: 'label' }}
                  style={{ maxWidth: 360 }}
                />
              </Form.Item>
              <Space size="middle" align="start" wrap style={{ display: "flex" }}>
                <Form.Item
                  name="unit"
                  label="Ед. изм."
                  rules={[{ required: true, whitespace: true, message: 'Укажите единицу' }, { max: 20 }]}
                >
                  <AutoComplete
                    disabled={fieldDisabled('unit')}
                    options={UNIT_OPTIONS}
                    filterOption={(input, option) => String(option?.value ?? '').toLowerCase().startsWith(input.toLowerCase())}
                    style={{ width: 140 }}
                  />
                </Form.Item>
                <Form.Item label="Месяц инвентаризации">
                  <MonthPicker value={month} onChange={setMonth} monthsWithData={monthsWithData} width={150} />
                </Form.Item>
                <Form.Item name="quantity" label={`Количество за ${formatMonth(month)}`}>
                  <InputNumber disabled={quantityDisabled} min={0} precision={0} placeholder="—" style={{ width: 160 }} />
                </Form.Item>
              </Space>
              {!readOnly && canSave && (
                // Own block: the unit/quantity row above is inline-flex, so an inline button would join that row.
                <div style={{ paddingTop: 8, borderTop: '1px solid #f0f0f0' }}>
                  <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving} size="large">
                    {isNew ? 'Создать' : 'Сохранить'}
                  </Button>
                </div>
              )}
            </Form>
          </Card>

          {!isNew && (
            <Card size="small" title="Инвентаризация по месяцам" style={{ marginBottom: 16 }}>
              <Table<MonthlyCount>
                rowKey="month"
                size="small"
                pagination={false}
                dataSource={item!.counts}
                locale={{ emptyText: 'Пока не пересчитывали' }}
                onRow={c => ({ onClick: () => setMonth(c.month), style: { cursor: 'pointer' } })}
                rowClassName={c => (c.month === month ? 'row-selected' : '')}
                columns={[
                  { title: 'Месяц', key: 'month', render: (_, c) => formatMonth(c.month) },
                  {
                    title: 'Количество', key: 'qty', align: 'right',
                    render: (_, c) => <span className="num">{c.currentQty ?? '—'} {c.currentQty !== null ? item!.unit : ''}</span>,
                  },
                ]}
              />
            </Card>
          )}
        </Col>
      </Row>

      {!isNew && can('inventory.view') && (
        <Card size="small" title="История изменений" extra={<HistoryHint />} style={{ marginTop: 8 }}>
          <HistoryList entries={history} categories={categories} />
        </Card>
      )}
    </div>
  );
}
