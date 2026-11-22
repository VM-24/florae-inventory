import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Dev: Vite on :5173 proxies API and photos to the backend (PORT from .env, default 3000).
const backend = `http://localhost:${process.env.BACKEND_PORT ?? 3000}`;

export default defineConfig({
  plugins: [
    react(),
    // Installable app (home screen / desktop). Only the app shell is precached;
    // data always comes from the network, so an installed app never shows stale stock.
    VitePWA({
      // The service worker is registered by PwaReloadPrompt (useRegisterSW) — no auto-injected script.
      injectRegister: false,
      registerType: 'prompt', // new version → "Обновить" notification instead of a silent reload mid-count
      includeAssets: ['apple-touch-icon.png', 'favicon-32x32.png'],
      manifest: {
        id: '/',
        name: 'Florae — инвентарь',
        short_name: 'Инвентарь',
        description: 'Инвентаризация складов: артикулы, фото, количество по месяцам',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#7c3aed',
        background_color: '#f7f8fa',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // the antd bundle is ~1.3 MB
        navigateFallback: '/index.html',
        // API, photos and health are never answered with the app shell.
        navigateFallbackDenylist: [/^\/api/, /^\/uploads/, /^\/health/],
        runtimeCaching: [
          { urlPattern: /\/api\//, handler: 'NetworkOnly' },
          // Photo files have random UUID names and never change, so they can be cached for good.
          {
            urlPattern: /\/uploads\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'item-photos',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': backend, '/uploads': backend },
  },
  build: { outDir: 'dist' },
});
