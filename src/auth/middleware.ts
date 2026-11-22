import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from '../db';
import { jwtSecret } from '../config';

const TOKEN_TTL = '7d';

export interface AuthContext {
  userId: string;
  login: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function issueToken(userId: string): string {
  return jwt.sign({ userId }, jwtSecret(), { expiresIn: TOKEN_TTL });
}

// The JWT carries only userId; role and active flag are re-read on every request,
// so blocking a user or changing their role takes effect immediately.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Не авторизован' });

  let userId: string;
  try {
    userId = (jwt.verify(token, jwtSecret()) as { userId: string }).userId;
  } catch {
    return res.status(401).json({ error: 'Недействительный токен' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) return res.status(401).json({ error: 'Доступ отозван' });
    req.auth = {
      userId: user.id, login: user.login, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword,
    };
    // An issued/reset password is known to someone else: until it is changed, only the
    // profile and the password change itself are reachable — enforced here, not just in the UI.
    if (user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(`${req.method} ${req.path}`)) {
      return res.status(403).json({ error: 'Смените временный пароль', code: 'MUST_CHANGE_PASSWORD' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

const PASSWORD_CHANGE_ALLOWED = new Set(['GET /me', 'POST /me/password']);

export const isAdminRole = (role: Role | undefined) => role === 'ADMIN' || role === 'OWNER';

// Catalog management: admins and the owner.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdminRole(req.auth?.role)) return res.status(403).json({ error: 'Недостаточно прав' });
  next();
}

// User management: the owner only.
export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.role !== 'OWNER') return res.status(403).json({ error: 'Недостаточно прав' });
  next();
}
