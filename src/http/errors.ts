import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const notFound = (what = 'Запись не найдена') => new HttpError(404, what);
export const conflict = (msg: string) => new HttpError(409, msg);
export const forbidden = () => new HttpError(403, 'Недостаточно прав');

// Express 4 does not forward rejected promises to the error handler — wrap async routes.
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

// Central error → HTTP mapping. 400 validation, 404 missing, 409 state conflict.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });

  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first?.path.join('.');
    return res.status(400).json({
      error: field ? `${field}: ${first.message}` : first?.message ?? 'Некорректные данные',
      issues: err.issues,
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Такая запись уже существует' });
    if (err.code === 'P2003') return res.status(409).json({ error: 'Запись связана с другими данными' });
    if (err.code === 'P2025') return res.status(404).json({ error: 'Запись не найдена' });
  }

  // multer: file too large etc.
  const multerCode = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : null;
  if (multerCode === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Файл слишком большой (до 8 МБ)' });
  if (multerCode === 'LIMIT_FILE_COUNT' || multerCode === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Слишком много файлов за раз (до 10)' });
  }

  console.error('Unhandled error:', err);
  return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
}
