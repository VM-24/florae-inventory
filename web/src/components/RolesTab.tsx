import { useEffect, useState } from 'react';
import { Alert, App, Button, Card, Checkbox, Col, Empty, Input, Popconfirm, Row, Space, Tag, Typography } from 'antd';
import { CrownOutlined, DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import { api, type PanelRole, type PermissionGroup } from '../api';

// Role editor: pick a role on the left, tick its permissions on the right.
// The permission catalog comes from the server; the owner role always has everything.
export default function RolesTab() {
  const { message } = App.useApp();
  const [roles, setRoles] = useState<PanelRole[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftPerms, setDraftPerms] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');

  const selected = roles.find(r => r.id === selectedId) ?? null;
  const dirty = selected !== null && !selected.isOwner && (
    draftName.trim() !== selected.name
    || draftPerms.size !== selected.permissions.length
    || selected.permissions.some(p => !draftPerms.has(p))
  );

  const select = (role: PanelRole | undefined) => {
    setSelectedId(role?.id ?? null);
    setDraftName(role?.name ?? '');
    setDraftPerms(new Set(role?.permissions ?? []));
  };

  const load = async (keepId?: string) => {
    try {
      const [r, g] = await Promise.all([api.roles(), api.permissionGroups()]);
      setRoles(r);
      setGroups(g);
      select(r.find(x => x.id === (keepId ?? selectedId)) ?? r.find(x => !x.isOwner) ?? r[0]);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Ошибка загрузки');
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  const toggle = (key: string, on: boolean) => setDraftPerms(prev => {
    const next = new Set(prev);
    if (on) next.add(key); else next.delete(key);
    return next;
  });

  const toggleGroup = (group: PermissionGroup, on: boolean) => setDraftPerms(prev => {
    const next = new Set(prev);
    for (const p of group.permissions) if (on) next.add(p.key); else next.delete(p.key);
    return next;
  });

  const save = async () => {
    if (!selected || !draftName.trim()) return;
    setSaving(true);
    try {
      await api.updateRole(selected.id, { name: draftName.trim(), permissions: [...draftPerms] });
      message.success('Роль сохранена — права действуют сразу');
      await load(selected.id);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Не удалось сохранить роль');
    } finally {
      setSaving(false);
    }
  };

  const create = async () => {
    if (!newName.trim()) return;
    try {
      const role = await api.createRole({ name: newName.trim(), permissions: ['inventory.view'] });
      setNewName('');
      message.success('Роль создана — отметьте её права');
      await load(role.id);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Не удалось создать роль');
    }
  };

  const remove = async () => {
    if (!selected) return;
    try {
      await api.deleteRole(selected.id);
      message.success('Роль удалена');
      setSelectedId(null);
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Не удалось удалить роль');
    }
  };

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={8}>
        <Card size="small" title="Роли">
          <Space direction="vertical" style={{ width: '100%' }}>
            {roles.map(r => (
              <Button
                key={r.id}
                block
                type={r.id === selectedId ? 'primary' : 'default'}
                ghost={r.id === selectedId}
                onClick={() => select(r)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>{r.isOwner && <CrownOutlined style={{ marginRight: 6 }} />}{r.name}</span>
                <span className="muted" style={{ fontSize: 12 }}>{r.userCount} польз.</span>
              </Button>
            ))}
            <Space.Compact style={{ width: '100%', marginTop: 8 }}>
              <Input placeholder="Новая роль, напр. Бармен" value={newName} onChange={e => setNewName(e.target.value)} onPressEnter={create} maxLength={60} />
              <Button icon={<PlusOutlined />} onClick={create} disabled={!newName.trim()} aria-label="Добавить роль" />
            </Space.Compact>
          </Space>
        </Card>
      </Col>

      <Col xs={24} md={16}>
        {!selected ? (
          <Card size="small"><Empty description="Выберите роль" /></Card>
        ) : (
          <Card
            size="small"
            title={selected.isOwner
              ? <Space><CrownOutlined />{selected.name}<Tag color="purple">все права</Tag></Space>
              : <Input value={draftName} onChange={e => setDraftName(e.target.value)} maxLength={60} style={{ maxWidth: 320 }} />}
            extra={!selected.isOwner && (
              <Space>
                <Popconfirm
                  title={`Удалить роль «${selected.name}»?`}
                  description={selected.userCount ? 'Сначала назначьте её пользователям другую роль.' : undefined}
                  okText="Удалить" cancelText="Отмена" okButtonProps={{ danger: true, disabled: selected.userCount > 0 }}
                  onConfirm={remove}
                >
                  <Button danger icon={<DeleteOutlined />} aria-label="Удалить роль" />
                </Popconfirm>
                <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!dirty || !draftName.trim()} onClick={save}>
                  Сохранить
                </Button>
              </Space>
            )}
          >
            {selected.isOwner && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                title="У владельца всегда все права, включая те, что появятся в будущих версиях. Эту роль нельзя изменить или удалить."
              />
            )}
            {groups.map(group => {
              const keys = group.permissions.map(p => p.key);
              const on = keys.filter(k => draftPerms.has(k)).length;
              return (
                <div key={group.key} style={{ marginBottom: 14 }}>
                  <Checkbox
                    disabled={selected.isOwner}
                    checked={on === keys.length}
                    indeterminate={on > 0 && on < keys.length}
                    onChange={e => toggleGroup(group, e.target.checked)}
                  >
                    <Typography.Text strong>{group.label}</Typography.Text>
                  </Checkbox>
                  <div style={{ paddingLeft: 24, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {group.permissions.map(p => (
                      <Checkbox
                        key={p.key}
                        disabled={selected.isOwner}
                        checked={draftPerms.has(p.key)}
                        onChange={e => toggle(p.key, e.target.checked)}
                      >
                        {p.label}
                      </Checkbox>
                    ))}
                  </div>
                </div>
              );
            })}
            {!selected.isOwner && !draftPerms.has('inventory.view') && !draftPerms.has('inventory.count') && (
              <Alert type="warning" showIcon title="Без «Смотреть инвентарь» или «Вводить количество» пользователь не увидит список позиций." />
            )}
            {!selected.isOwner && draftPerms.size === 1 && draftPerms.has('inventory.count') && (
              <Alert
                type="info"
                showIcon
                title="Роль только для пересчёта: список и карточки видны для чтения, менять можно только количество. История, фото, архив и прочее недоступны."
              />
            )}
          </Card>
        )}
      </Col>
    </Row>
  );
}
