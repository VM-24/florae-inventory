import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: Vite on :5173 proxies API and photos to the backend (PORT from .env, default 3000).
const backend = `http://localhost:${process.env.BACKEND_PORT ?? 3000}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': backend, '/uploads': backend },
  },
  build: { outDir: 'dist' },
});
