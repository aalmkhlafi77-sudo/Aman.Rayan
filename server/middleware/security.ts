import type { NextFunction, Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { serverEnv } from '../config/env';
import { pool } from '../db/pool';
import { safeTimingCompare } from '../security/crypto';

export const SESSION_COOKIE_NAME = 'aman_session';

export interface AuthenticatedRequest extends Request {
  sessionId?: string;
  csrfToken?: string;
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none';"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
}

export function restrictiveCors(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  const allowed = serverEnv.publicOrigin;

  if (origin && allowed && origin === allowed) {
    res.setHeader('Access-Control-Allow-Origin', allowed);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

export function createRateLimiter(maxAttempts: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip || 'local'}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (bucket.count >= maxAttempts) {
      res.status(429).json({
        error: 'تم تجاوز الحد المسموح من المحاولات، يرجى الانتظار قليلاً',
      });
      return;
    }

    bucket.count += 1;
    next();
  };
}

interface SessionRow extends RowDataPacket {
  id: string;
  csrf_token: string;
  expires_at: Date;
}

export async function requireSession(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const sessionId = req.cookies?.[SESSION_COOKIE_NAME];
  if (!sessionId || typeof sessionId !== 'string') {
    res.status(401).json({ error: 'الجلسة غير مصرح بها' });
    return;
  }

  try {
    const [rows] = await pool.execute<SessionRow[]>(
      'SELECT id, csrf_token, expires_at FROM sessions WHERE id = ? AND expires_at > NOW() LIMIT 1',
      [sessionId]
    );
    const session = rows[0];
    if (!session) {
      res.status(401).json({ error: 'انتهت صلاحية الجلسة، يرجى إعادة فتح الخزنة' });
      return;
    }
    req.sessionId = session.id;
    req.csrfToken = session.csrf_token;
    next();
  } catch {
    res.status(503).json({ error: 'تعذر التحقق من الجلسة على الخادم' });
  }
}

export function requireCsrf(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  const headerToken = req.headers['x-csrf-token'];
  if (
    typeof headerToken !== 'string' ||
    !req.csrfToken ||
    !safeTimingCompare(headerToken, req.csrfToken)
  ) {
    res.status(403).json({ error: 'فشل التحقق الأمني للطلب (CSRF)' });
    return;
  }
  next();
}
