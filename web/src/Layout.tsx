import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { App, Button, Drawer, Grid, Layout as AntLayout, Menu, Modal } from 'antd';
import {
  AppstoreOutlined, FileTextOutlined, KeyOutlined, LogoutOutlined, MenuOutlined, TagsOutlined, TeamOutlined,
} from '@ant-design/icons';
import { api, clearToken } from './api';
import { useAuth } from './auth';
import { PasswordFields } from './components/ForcePasswordChange';

const { Sider, Content } = AntLayout;

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { me, can } = useAuth();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const isMobile = screens.lg === false;

  // Menu shows only what the role may open (the server checks the same permissions).
  const items = [
    { key: '/', icon: <AppstoreOutlined />, label: 'Инвентарь', perms: ['inventory.view', 'inventory.count'] },
    { key: '/categories', icon: <TagsOutlined />, label: 'Категории', perms: ['inventory.view', 'categories.manage'] },
    { key: '/users', icon: <TeamOutlined />, label: 'Пользователи и роли', perms: ['users.manage', 'roles.manage'] },
    { key: '/audit', icon: <FileTextOutlined />, label: 'Журнал', perms: ['audit.view'] },
  ]
    .filter(i => i.perms.some(can))
    .map(({ perms: _perms, ...item }) => item);
  const selected = items.find(i => i.key !== '/' && location.pathname.startsWith(i.key))?.key ?? '/';

  const changePassword = async ({ current, next }: { current: string; next: string }) => {
    setPasswordError('');
    setPasswordSaving(true);
    try {
      await api.changeOwnPassword(current, next);
      setPasswordOpen(false);
      message.success('Пароль изменён');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Не удалось сменить пароль');
    } finally {
      setPasswordSaving(false);
    }
  };

  const logout = () => {
    clearToken();
    // Full reload so the auth context starts clean.
    window.location.href = '/login';
  };

  const menu = (
    <Menu
      mode="inline"
      selectedKeys={[selected]}
      items={items}
      onClick={({ key }) => { navigate(key); setDrawerOpen(false); }}
      style={{ borderInlineEnd: 'none', flex: 1 }}
    />
  );
  const userBlock = (
    <div style={{ padding: 16 }}>
      <div style={{ fontWeight: 600 }}>{me?.name}</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
        {me?.role.name} · {me?.login}
      </div>
      <Button icon={<KeyOutlined />} block style={{ marginBottom: 8 }} onClick={() => { setPasswordError(''); setPasswordOpen(true); setDrawerOpen(false); }}>
        Сменить пароль
      </Button>
      <Button icon={<LogoutOutlined />} block onClick={logout}>Выйти</Button>
    </div>
  );
  const brand = '🌸 Florae · Инвентарь';

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider theme="light" width={230} style={{ borderRight: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', position: 'sticky', top: 0 }}>
            <div style={{ padding: '20px 24px', fontSize: 17, fontWeight: 700 }}>{brand}</div>
            {menu}
            {userBlock}
          </div>
        </Sider>
      )}
      {isMobile && (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={260}
          title={brand}
          styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
        >
          {menu}
          {userBlock}
        </Drawer>
      )}
      <AntLayout>
        {isMobile && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
            paddingTop: 'max(10px, env(safe-area-inset-top))',
            background: '#fff', borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, zIndex: 10,
          }}>
            <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} aria-label="Меню" />
            <div style={{ fontSize: 16, fontWeight: 700 }}>{brand}</div>
          </div>
        )}
        <Content style={{ padding: isMobile ? 12 : 24 }}>
          <Outlet />
        </Content>
      </AntLayout>
      <Modal open={passwordOpen} title="Сменить пароль" footer={null} onCancel={() => setPasswordOpen(false)} destroyOnHidden>
        <PasswordFields onSubmit={changePassword} loading={passwordSaving} error={passwordError} submitText="Сменить пароль" />
      </Modal>
    </AntLayout>
  );
}
