import path from 'path';

const DEV_SECRET = 'dev-insecure-secret-change-me';

export const CURRENCY = 'PLN';

export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  return DEV_SECRET;
}

export function uploadsDir(): string {
  return process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'uploads');
}
