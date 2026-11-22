import { Router } from 'express';
import multer from 'multer';
import { requireAdmin } from '../auth/middleware';
import { asyncHandler, HttpError } from '../http/errors';
import { deleteImage, extFromMime, saveImage } from '../storage/files';
import { countSchema, createItemSchema, listQuerySchema, monthKey, updateItemSchema } from './schemas';
import * as repo from './repository';

const MAX_FILES_PER_UPLOAD = 10;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: MAX_FILES_PER_UPLOAD } });

export const itemRouter = Router();

// Roles: catalog (name, category, unit, opening, price, archive, delete) is ADMIN-only.
// Monthly counts and photos can be entered by STAFF too — that is the counting job.

itemRouter.get('/months', asyncHandler(async (_req, res) => {
  res.json(await repo.listMonths());
}));

itemRouter.get('/items', asyncHandler(async (req, res) => {
  res.json(await repo.listItems(listQuerySchema.parse(req.query)));
}));

itemRouter.get('/items/:id', asyncHandler(async (req, res) => {
  res.json(await repo.getItem(req.params.id));
}));

itemRouter.get('/items/:id/history', asyncHandler(async (req, res) => {
  res.json(await repo.itemHistory(req.params.id));
}));

itemRouter.post('/items', requireAdmin, asyncHandler(async (req, res) => {
  const input = createItemSchema.parse(req.body);
  res.status(201).json(await repo.createItem(input, req.auth!.userId));
}));

itemRouter.patch('/items/:id', requireAdmin, asyncHandler(async (req, res) => {
  const input = updateItemSchema.parse(req.body);
  res.json(await repo.updateItem(req.params.id, input, req.auth!.userId));
}));

itemRouter.delete('/items/:id', requireAdmin, asyncHandler(async (req, res) => {
  await repo.deleteItem(req.params.id, req.auth!.userId);
  res.status(204).end();
}));

itemRouter.put('/items/:id/counts/:month', asyncHandler(async (req, res) => {
  const month = monthKey.parse(req.params.month);
  const input = countSchema.parse(req.body);
  res.json(await repo.upsertCount(req.params.id, month, input, req.auth!.userId));
}));

itemRouter.delete('/items/:id/counts/:month', requireAdmin, asyncHandler(async (req, res) => {
  await repo.deleteCount(req.params.id, monthKey.parse(req.params.month), req.auth!.userId);
  res.status(204).end();
}));

// Several photos at once (multipart field "photos"). All files are checked before any is saved;
// if the database step fails, the saved files are removed again.
itemRouter.post('/items/:id/photos', upload.array('photos', MAX_FILES_PER_UPLOAD), asyncHandler(async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw new HttpError(400, 'Файлы не получены');
  const exts = files.map(f => extFromMime(f.mimetype));
  if (exts.some(e => !e)) throw new HttpError(415, 'Поддерживаются только изображения (jpg, png, webp, gif, heic)');

  const urls = await Promise.all(files.map((f, i) => saveImage(f.buffer, exts[i]!)));
  try {
    res.status(201).json(await repo.addPhotos(req.params.id, urls, req.auth!.userId));
  } catch (err) {
    await Promise.all(urls.map(deleteImage));
    throw err;
  }
}));

itemRouter.delete('/items/:id/photos/:photoId', asyncHandler(async (req, res) => {
  res.json(await repo.deletePhoto(req.params.id, req.params.photoId, req.auth!.userId));
}));

itemRouter.post('/items/:id/photos/:photoId/cover', asyncHandler(async (req, res) => {
  res.json(await repo.setCoverPhoto(req.params.id, req.params.photoId, req.auth!.userId));
}));
