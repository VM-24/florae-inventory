import { useEffect, useState } from 'react';
import { Alert, App, Button, Form, Input, Modal, Popconfirm, Select, Space, Tag, Tooltip, Typography } from 'antd';
import { EditOutlined, KeyOutlined, LockOutlined, PlusOutlined, UnlockOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import ResponsiveTable, { type RColumn } from '../components/ResponsiveTable';
import { api, type PanelUser, type Role } from '../api';
import { useAuth } from '../auth';
import { ROLE_COLORS, ROLE_LABELS, ROLE_OPTIONS } from '../roles';

// User management — owner only (as in florae): create with an issued password, change role,
// block/unblock, reset password. The server guards against self-lockout and losing the last owner.
export default function Users() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const [users, setUsers] = useState<PanelUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<PanelUser | null>(null);
  const [issued, setIssued] = useState<{ login: string; password: string; isNew: boolean } | null>(null);
  const [createForm] = Form.useForm<{ login: string; name: string; role: Role }>();
  const [renameForm] = Form.useForm<{ name: string }>();

  const load = () => {
    setLoading(true);
    return api.users()
      .then(setUsers)
      .catch(e => message.error(e.message))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  const fail = (fallback: string) => (err: unknown) => message.error(err instanceof Error ? err.message : fallback);

  const create = async (values: { login: string; name: string; role: Role }) => {
    try {
      const user = await api.createUser(values);
      setCreating(false);
      createForm.resetFields();
      setIssued({ login: user.login, password: user.password, isNew: true });
      void load();
    } catch (err) {
      fail('Не удалось создать пользователя')(err);
    }
  };

  const patch = async (id: string, changes: { name?: string; role?: Role; active?: boolean }, ok?: string) => {
    try {
      await api.updateUser(id, changes);
      if (ok) message.success(ok);
      await load();
      return true;
    } catch (err) {
      fail('Не удалось изменить пользователя')(err);
      return false;
    }
  };

  const resetPassword = async (user: PanelUser) => {
    try {
      const { password } = await api.resetUserPassword(user.id);
      setIssued({ login: user.login, password, isNew: false });
      void load();
    } catch (err) {
      fail('Не удалось сбросить пароль')(err);
    }
  };

  const columns: RColumn<PanelUser>[] = [
    {
      title: 'Имя', key: 'name', card: 'header',
      render: (_, u) => (
        <Space size={6} wrap>
          <span>{u.name}</span>
          {u.login === me?.login && <Tag>это вы</Tag>}
        </Space>
      ),
    },
    { title: 'Логин', key: 'login', render: (_, u) => <Typography.Text code>{u.login}</Typography.Text> },
    {
      title: 'Роль', key: 'role',
      render: (_, u) => (u.login === me?.login
        // Own role can't be changed — the server refuses too.
        ? <Tag color={ROLE_COLORS[u.role]}>{ROLE_LABELS[u.role]}</Tag>
        : (
          <Select
            size="small"
            value={u.role}
            onChange={role => patch(u.id, { role }, 'Роль изменена')}
            options={ROLE_OPTIONS.map(o => ({ value: o.value, label: ROLE_LABELS[o.value] }))}
            style={{ minWidth: 150 }}
          />
        )),
    },
    {
      title: 'Статус', key: 'status',
      render: (_, u) => (
        <Space size={4} wrap>
          {u.active ? <Tag color="green">Активен</Tag> : <Tag color="red">Заблокирован</Tag>}
          {u.mustChangePassword && (
            <Tooltip title="Ещё не сменил выданный пароль">
              <Tag color="orange">временный пароль</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: 'Последний вход', key: 'lastLoginAt',
      render: (_, u) => (u.lastLoginAt ? dayjs(u.lastLoginAt).format('DD.MM.YYYY HH:mm') : <span className="muted">не входил</span>),
    },
    {
      title: '', key: 'actions', card: 'block',
      render: (_, u) => {
        const isSelf = u.login === me?.login;
        return (
          <Space wrap>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => { setRenaming(u); renameForm.setFieldsValue({ name: u.name }); }}
            >
              Имя
            </Button>
            <Popconfirm
              title="Сбросить пароль?"
              description="Будет выдан новый временный пароль, старый перестанет работать."
              okText="Сбросить" cancelText="Отмена"
              onConfirm={() => resetPassword(u)}
            >
              <Button size="small" icon={<KeyOutlined />}>Сбросить пароль</Button>
            </Popconfirm>
            {!isSelf && (u.active ? (
              <Popconfirm
                title={`Заблокировать ${u.name}?`}
                description="Пользователь сразу потеряет доступ."
                okText="Заблокировать" cancelText="Отмена" okButtonProps={{ danger: true }}
                onConfirm={() => patch(u.id, { active: false }, 'Пользователь заблокирован')}
              >
                <Button size="small" danger icon={<LockOutlined />}>Заблокировать</Button>
              </Popconfirm>
            ) : (
              <Button size="small" icon={<UnlockOutlined />} onClick={() => patch(u.id, { active: true }, 'Пользователь разблокирован')}>
                Разблокировать
              </Button>
            ))}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>Пользователи</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>Пользователь</Button>
      </Space>

      <ResponsiveTable<PanelUser>
        rowKey="id"
        loading={loading}
        dataSource={users}
        columns={columns}
        pagination={false}
        scroll={{ x: 'max-content' }}
        rowClassName={(u: PanelUser) => (u.active ? '' : 'row-archived')}
      />

      <Modal
        open={creating}
        title="Новый пользователь"
        onCancel={() => setCreating(false)}
        onOk={() => createForm.submit()}
        okText="Создать"
        cancelText="Отмена"
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" onFinish={create} initialValues={{ role: 'STAFF' }}>
          <Form.Item
            name="login"
            label="Логин"
            rules={[
              { required: true, message: 'Укажите логин' },
              { pattern: /^[a-zA-Z0-9._-]+$/, message: 'Латиница, цифры, точка, дефис, подчёркивание' },
            ]}
          >
            <Input placeholder="barista" autoComplete="off" />
          </Form.Item>
          <Form.Item name="name" label="Имя" rules={[{ required: true, whitespace: true, message: 'Укажите имя' }]}>
            <Input placeholder="Анна Ковальская" />
          </Form.Item>
          <Form.Item name="role" label="Роль" rules={[{ required: true }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Пароль сгенерируется автоматически и будет показан один раз.
          </Typography.Text>
        </Form>
      </Modal>

      <Modal
        open={renaming !== null}
        title="Изменить имя"
        onCancel={() => setRenaming(null)}
        onOk={() => renameForm.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        destroyOnHidden
      >
        <Form
          form={renameForm}
          layout="vertical"
          onFinish={async ({ name }) => { if (await patch(renaming!.id, { name: name.trim() }, 'Имя изменено')) setRenaming(null); }}
        >
          <Form.Item name="name" label="Имя" rules={[{ required: true, whitespace: true, message: 'Укажите имя' }]}>
            <Input autoFocus />
          </Form.Item>
        </Form>
      </Modal>

      {/* The password exists in clear text only here — the database stores just the hash. */}
      <Modal
        open={issued !== null}
        title={issued?.isNew ? 'Пользователь создан' : 'Пароль сброшен'}
        onCancel={() => setIssued(null)}
        onOk={() => setIssued(null)}
        okText="Записал"
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        <Alert
          type="warning"
          showIcon
          title="Этот пароль больше не будет показан"
          description="Передайте его сотруднику. При первом входе панель попросит сменить пароль."
          style={{ marginBottom: 16 }}
        />
        <Typography.Paragraph>
          Логин: <Typography.Text code copyable>{issued?.login}</Typography.Text>
        </Typography.Paragraph>
        <Typography.Paragraph>
          Пароль: <Typography.Text code copyable>{issued?.password}</Typography.Text>
        </Typography.Paragraph>
      </Modal>
    </div>
  );
}
