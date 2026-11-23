import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Input, InputNumber, Modal, Popconfirm, Space, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import ResponsiveTable, { type RColumn } from '../components/ResponsiveTable';
import { api, type Category } from '../api';
import { useAuth } from '../auth';

type Draft = { id: string | null; name: string; sortOrder: number | null };

export default function Categories() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const canManage = can('categories.manage');
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    return api.categories()
      .then(setCategories)
      .catch(e => message.error(e.message))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  const submit = async () => {
    if (!editing) return;
    if (!editing.name.trim()) return message.error('Укажите название');
    setSaving(true);
    try {
      const data = { name: editing.name.trim(), sortOrder: editing.sortOrder ?? undefined };
      if (editing.id) await api.updateCategory(editing.id, data);
      else await api.createCategory(data);
      message.success(editing.id ? 'Категория изменена' : 'Категория добавлена');
      setEditing(null);
      void load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteCategory(id);
      message.success('Категория удалена');
      void load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const columns: RColumn<Category>[] = [
    { title: 'Порядок', key: 'sortOrder', width: 100, render: (_, c) => <span className="num">{c.sortOrder}</span> },
    { title: 'Название', key: 'name', card: 'header', render: (_, c) => c.name },
    {
      title: 'Позиций', key: 'itemCount', align: 'right',
      render: (_, c) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/?category=${c.id}`)}>{c.itemCount}</Button>
      ),
    },
  ];
  if (canManage) {
    columns.push({
      title: '', key: 'actions', width: 120,
      render: (_, c) => (
        <Space>
          <Button icon={<EditOutlined />} aria-label="Изменить" onClick={() => setEditing({ id: c.id, name: c.name, sortOrder: c.sortOrder })} />
          <Popconfirm title="Удалить категорию?" okText="Удалить" cancelText="Отмена" onConfirm={() => remove(c.id)}>
            <Button danger icon={<DeleteOutlined />} aria-label="Удалить" />
          </Popconfirm>
        </Space>
      ),
    });
  }

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>Категории</Typography.Title>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ id: null, name: '', sortOrder: null })}>
            Категория
          </Button>
        )}
      </Space>
      <Typography.Paragraph type="secondary">
        Порядок задаёт последовательность разделов в списке — выставьте его так, как обходите склад и бар при пересчёте.
      </Typography.Paragraph>

      <ResponsiveTable<Category> rowKey="id" loading={loading} columns={columns} dataSource={categories} pagination={false} />

      <Modal
        title={editing?.id ? 'Изменить категорию' : 'Новая категория'}
        open={editing !== null}
        onCancel={() => setEditing(null)}
        onOk={submit}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={saving}
        destroyOnHidden
      >
        {editing && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Typography.Text type="secondary">Название</Typography.Text>
              <Input value={editing.name} autoFocus maxLength={100} onChange={e => setEditing({ ...editing, name: e.target.value })} onPressEnter={submit} />
            </div>
            <div>
              <Typography.Text type="secondary">Порядок (меньше — выше)</Typography.Text>
              <InputNumber
                min={0}
                precision={0}
                value={editing.sortOrder}
                placeholder="В конец списка"
                style={{ width: '100%' }}
                onChange={v => setEditing({ ...editing, sortOrder: v })}
              />
            </div>
          </Space>
        )}
      </Modal>
    </div>
  );
}
