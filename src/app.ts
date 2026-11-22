import express from 'express';
import path from 'path';
import { prisma } from './db';
import { uploadsDir } from './config';
import { requireAuth } from './auth/middleware';
import { loginRouter, meRouter, userRouter } from './auth/routes';
import { itemRouter } from './items/routes';
import { categoryRouter } from './categories/routes';
import { errorHandler } from './http/errors';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'error', message: 'Database unavailable' });
    }
  });

  // Item photos. Public paths with random UUID names.
  app.use('/uploads', express.static(uploadsDir(), { maxAge: '7d', immutable: true }));

  app.use('/api', loginRouter);
  app.use('/api', requireAuth);
  app.use('/api', meRouter);
  app.use('/api', userRouter);
  app.use('/api', categoryRouter);
  app.use('/api', itemRouter);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Не найдено' }));
  app.use(errorHandler);

  // SPA (web/dist) served from the root; client-side routes fall back to index.html.
  const webDist = path.resolve(process.cwd(), 'web/dist');
  // Hashed build assets never change under the same name — cache for a year.
  // Everything else (index.html, sw.js, manifest) stays max-age=0 so PWA updates arrive at once.
  app.use('/assets', express.static(path.join(webDist, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(webDist));
  app.get(/^(?!\/api|\/uploads|\/health).*/, (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'), err => {
      if (err) res.status(404).send('Панель не собрана. Выполните: npm run web:build');
    });
  });

  return app;
}
