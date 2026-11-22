import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { api, setToken } from '../api';
import { useAuth } from '../auth';

export default function Login() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const submit = async ({ login, password }: { login: string; password: string }) => {
    setError('');
    setLoading(true);
    try {
      const { token } = await api.login(login, password);
      setToken(token);
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 32 }}>🌸</div>
          <Typography.Title level={4} style={{ margin: '8px 0 0' }}>Florae — инвентарь</Typography.Title>
        </div>
        <Form layout="vertical" onFinish={submit} requiredMark={false}>
          <Form.Item name="login" rules={[{ required: true, message: 'Введите логин' }]}>
            <Input placeholder="Логин" size="large" autoFocus autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: 'Введите пароль' }]}>
            <Input.Password placeholder="Пароль" size="large" autoComplete="current-password" />
          </Form.Item>
          {error && <Alert type="error" title={error} style={{ marginBottom: 12 }} showIcon />}
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>Войти</Button>
        </Form>
      </Card>
    </div>
  );
}
