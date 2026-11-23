import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db';
import { jwtSecret } from '../config';
import { ALL_PERMISSIONS } from './permissions';

const TOKEN_TTL = '7d';

export interface AuthContext {
  userId: string;
  login: string;
  name: string;
  roleId: string;
  roleName: string;
  isOwner: boolean;
  permissions: Set<string>;
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

const PASSWORD_CHANGE_ALLOWED = new Set(['GET /me', 'POST /me/password']);

// The JWT carries only userId; role, permissions and the active flag are re-read on every
// request, so blocking a user or editing a role takes effect immediately.
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
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: { include: { permissions: true } } },
    });
    if (!user || !user.active) return res.status(401).json({ error: 'Доступ отозван' });

    req.auth = {
      userId: user.id,
      login: user.login,
      name: user.name,
      roleId: user.role.id,
      roleName: user.role.name,
      isOwner: user.role.isOwner,
      // The owner has the whole catalog, including permissions added in later versions.
      permissions: new Set(user.role.isOwner ? ALL_PERMISSIONS : user.role.permissions.map(p => p.permission)),
      mustChangePassword: user.mustChangePassword,
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

export function can(req: Request, permission: string): boolean {
  return Boolean(req.auth && (req.auth.isOwner || req.auth.permissions.has(permission)));
}

// Passes when the user has at least one of the given permissions.
export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!permissions.some(p => can(req, p))) return res.status(403).json({ error: 'Недостаточно прав' });
    next();
  };
}

// For PATCH routes where the needed permission depends on the fields in the body.
export function requireFieldPermissions(map: Record<string, string>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    for (const [field, permission] of Object.entries(map)) {
      if (body[field] !== undefined && !can(req, permission)) {
        return res.status(403).json({ error: 'Недостаточно прав' });
      }
    }
    next();
  };
}
