import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { api, clearToken } from '../api';
import { useAuth } from '../auth';

// Shown instead of the panel until a temporary password is replaced: an issued or reset
// password has passed through a chat or a conversation, so someone else knows it.
// The server enforces the same rule (403 MUST_CHANGE_PASSWORD).
export default function ForcePasswordChange() {
  const { me, refresh } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async ({ current, next }: { current: string; next: string }) => {
    setError('');
    setLoading(true);
    try {
      await api.changeOwnPassword(current, next);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сменить пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 400 }}>
        <Typography.Title level={4}>Смените пароль</Typography.Title>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title={`${me?.name ?? ''}, вы вошли с временным паролем. Задайте свой, чтобы продолжить.`}
        />
        <PasswordFields onSubmit={submit} loading={loading} error={error} submitText="Сохранить и войти" />
        <Button type="link" block style={{ marginTop: 8 }} onClick={() => { clearToken(); window.location.href = '/login'; }}>
          Выйти
        </Button>
      </Card>
    </div>
  );
}

// Shared by the forced change and the "Сменить пароль" dialog.
export function PasswordFields({ onSubmit, loading, error, submitText }: {
  onSubmit: (v: { current: string; next: string }) => void;
  loading: boolean;
  error?: string;
  submitText: string;
}) {
  return (
    <Form layout="vertical" onFinish={onSubmit} requiredMark={false}>
      <Form.Item name="current" label="Текущий пароль" rules={[{ required: true, message: 'Введите текущий пароль' }]}>
        <Input.Password autoFocus autoComplete="current-password" />
      </Form.Item>
      <Form.Item name="next" label="Новый пароль" rules={[{ required: true, min: 8, message: 'Не короче 8 символов' }]}>
        <Input.Password autoComplete="new-password" />
      </Form.Item>
      <Form.Item
        name="repeat"
        label="Повторите новый пароль"
        dependencies={['next']}
        rules={[
          { required: true, message: 'Повторите пароль' },
          ({ getFieldValue }) => ({
            validator: (_, value) => (!value || value === getFieldValue('next')
              ? Promise.resolve()
              : Promise.reject(new Error('Пароли не совпадают'))),
          }),
        ]}
      >
        <Input.Password autoComplete="new-password" />
      </Form.Item>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 12 }} />}
      <Button type="primary" htmlType="submit" block loading={loading}>{submitText}</Button>
    </Form>
  );
}
