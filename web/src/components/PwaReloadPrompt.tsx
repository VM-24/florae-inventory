import { useEffect } from 'react';
import { App, Button } from 'antd';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Registers the service worker and shows a notification when a new version is deployed.
// "Обновить" activates it and reloads; until then the open page keeps working undisturbed
// (registerType: 'prompt' — no reload in the middle of entering counts). Renders nothing itself.
export default function PwaReloadPrompt() {
  const { notification } = App.useApp();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // Installed apps stay open for days: check for a new version every hour.
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => { void registration.update(); }, 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    const key = 'pwa-update';
    notification.open({
      key,
      title: 'Доступна новая версия',
      description: 'Обновите, чтобы загрузить последние изменения.',
      duration: 0,
      actions: (
        <Button
          type="primary"
          size="small"
          onClick={() => {
            notification.destroy(key);
            void updateServiceWorker(true);
          }}
        >
          Обновить
        </Button>
      ),
      onClose: () => setNeedRefresh(false),
    });
  }, [needRefresh, notification, setNeedRefresh, updateServiceWorker]);

  return null;
}
