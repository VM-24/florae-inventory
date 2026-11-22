import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import 'dayjs/locale/ru';
import dayjs from 'dayjs';
import App from './App';
import PwaReloadPrompt from './components/PwaReloadPrompt';
import { disableZoomInStandalone } from './pwaZoom';
import { AuthProvider } from './auth';
import 'antd/dist/reset.css';
import './styles.css';

dayjs.locale('ru');
disableZoomInStandalone();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={ruRU}
      theme={{
        token: {
          colorPrimary: '#7c3aed',
          colorLink: '#7c3aed',
          borderRadius: 8,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
      }}
    >
      <AntApp>
        <BrowserRouter>
          <AuthProvider>
            <App />
            <PwaReloadPrompt />
          </AuthProvider>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
