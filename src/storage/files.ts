import { randomUUID } from 'crypto';
import { mkdir, writeFile, unlink } from 'fs/promises';
import path from 'path';
import { uploadsDir } from '../config';

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic']);

export function extFromMime(mime: string): string | null {
  const ext = mime.split('/')[1]?.toLowerCase().replace('jpeg', 'jpg') ?? '';
  return ALLOWED_EXT.has(ext) ? ext : null;
}

export async function saveImage(buffer: Buffer, ext: string): Promise<string> {
  const dir = uploadsDir();
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, filename), buffer);
  return `/uploads/${filename}`;
}

// Best-effort: a missing file must not fail the request.
export async function deleteImage(publicPath: string | null | undefined): Promise<void> {
  if (!publicPath) return;
  try {
    await unlink(path.join(uploadsDir(), path.basename(publicPath)));
  } catch {
    // already gone
  }
}
