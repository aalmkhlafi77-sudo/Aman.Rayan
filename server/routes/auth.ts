import crypto from 'node:crypto';
import { Router, type Response } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { serverEnv } from '../config/env';
import { pool, toSqlDateTime, withTransaction } from '../db/pool';
import {
  createRateLimiter,
  requireCsrf,
  requireSession,
  SESSION_COOKIE_NAME,
  type AuthenticatedRequest,
} from '../middleware/security';
import {
  generateRandomToken,
  hashPinVerifier,
  isValidEncryptedField,
  validateBootstrapToken,
  verifyPinConstantTime,
} from '../security/crypto';

interface OwnerRow extends RowDataPacket {
  id: number;
  pin_salt: string;
  pin_verifier: string;
  wrapped_master_key: string;
}

interface SessionRow extends RowDataPacket {
  id: string;
  csrf_token: string;
}

export const authRouter = Router();

const unlockRateLimiter = createRateLimiter(12, 5 * 60 * 1000);
const setupRateLimiter = createRateLimiter(5, 15 * 60 * 1000);

function setSessionCookie(res: Response, sessionId: string): void {
  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: serverEnv.isProduction,
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });
}

authRouter.get('/status', async (req, res) => {
  try {
    const [owners] = await pool.execute<OwnerRow[]>(
      'SELECT id FROM owner_security WHERE id = 1 LIMIT 1'
    );
    const initialized = owners.length > 0;
    let unlocked = false;
    let csrfToken: string | undefined;

    const sessionId = req.cookies?.[SESSION_COOKIE_NAME];
    if (initialized && typeof sessionId === 'string' && sessionId) {
      const [sessions] = await pool.execute<SessionRow[]>(
        'SELECT id, csrf_token FROM sessions WHERE id = ? AND expires_at > NOW() LIMIT 1',
        [sessionId]
      );
      if (sessions[0]) {
        unlocked = true;
        csrfToken = sessions[0].csrf_token;
      }
    }

    res.json({ initialized, unlocked, csrfToken });
  } catch {
    res.status(503).json({ error: 'تعذر الاتصال بقاعدة البيانات' });
  }
});

async function handleOwnerBootstrapSetup(
  req: import('express').Request,
  res: Response
): Promise<void> {
  try {
    const [existingBefore] = await pool.execute<OwnerRow[]>(
      'SELECT id FROM owner_security WHERE id = 1 LIMIT 1'
    );
    if (existingBefore.length > 0) {
      res.status(409).json({ error: 'تم تهيئة الخزنة مسبقاً' });
      return;
    }

    const tokenCheck = validateBootstrapToken(
      req.headers['x-aman-bootstrap-token'],
      serverEnv.amanBootstrapToken
    );
    if (!tokenCheck.valid) {
      res.status(403).json({ error: tokenCheck.error });
      return;
    }

    const { pin, pinSalt, wrappedMasterKey } = req.body as Record<string, unknown>;

    if (
      typeof pin !== 'string' ||
      !/^\d{6}$/.test(pin) ||
      typeof pinSalt !== 'string' ||
      !pinSalt.trim() ||
      pinSalt.length > 255 ||
      typeof wrappedMasterKey !== 'string' ||
      !wrappedMasterKey ||
      wrappedMasterKey.length > 4096 ||
      !isValidEncryptedField(wrappedMasterKey)
    ) {
      res.status(400).json({ error: 'بيانات تهيئة رمز الأمان غير صالحة' });
      return;
    }

    await withTransaction(async (conn) => {
      const [existing] = await conn.execute<OwnerRow[]>(
        'SELECT id FROM owner_security WHERE id = 1 LIMIT 1 FOR UPDATE'
      );
      if (existing.length > 0) {
        const err = new Error('تم تهيئة الخزنة مسبقاً');
        (err as Error & { statusCode?: number }).statusCode = 409;
        throw err;
      }

      const pinVerifier = hashPinVerifier(pin, pinSalt);
      const now = toSqlDateTime();

      await conn.execute(
        `INSERT INTO owner_security (id, pin_salt, pin_verifier, wrapped_master_key, created_at, updated_at)
         VALUES (1, ?, ?, ?, ?, ?)`,
        [pinSalt, pinVerifier, wrappedMasterKey, now, now]
      );

      await conn.execute(
        `INSERT INTO app_settings (id, auto_lock_minutes, clipboard_clear_seconds, updated_at)
         VALUES (1, 5, 20, ?)
         ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)`,
        [now]
      );

      await conn.execute(
        `INSERT INTO audit_events (id, action, summary, created_at)
         VALUES (?, 'pin_changed', 'تهيئة رمز أمان الخاص بالمالك', ?)`,
        [crypto.randomUUID(), now]
      );
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    const status = (err as Error & { statusCode?: number }).statusCode || 503;
    res.status(status).json({
      error: status === 409 ? 'تم تهيئة الخزنة مسبقاً' : 'تعذر الحفظ على الخادم',
    });
  }
}

authRouter.post('/setup', setupRateLimiter, handleOwnerBootstrapSetup);
authRouter.post('/bootstrap', setupRateLimiter, handleOwnerBootstrapSetup);

authRouter.post('/unlock', unlockRateLimiter, async (req, res) => {
  const { pin } = req.body as Record<string, unknown>;
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
    res.status(400).json({ error: 'رمز أمان غير صحيح' });
    return;
  }

  try {
    const [owners] = await pool.execute<OwnerRow[]>(
      'SELECT id, pin_salt, pin_verifier, wrapped_master_key FROM owner_security WHERE id = 1 LIMIT 1'
    );
    const owner = owners[0];
    if (!owner) {
      res.status(404).json({ error: 'لم يتم تهيئة الخزنة بعد' });
      return;
    }

    const valid = verifyPinConstantTime(pin, owner.pin_salt, owner.pin_verifier);
    const now = toSqlDateTime();

    if (!valid) {
      await pool.execute(
        `INSERT INTO audit_events (id, action, summary, created_at)
         VALUES (?, 'login_failed', 'محاولة إدخال رمز أمان غير صحيح', ?)`,
        [crypto.randomUUID(), now]
      );
      res.status(401).json({ error: 'رمز أمان غير صحيح' });
      return;
    }

    const priorSessionId = req.cookies?.[SESSION_COOKIE_NAME];
    const sessionId = generateRandomToken(32);
    const csrfToken = generateRandomToken(24);
    const expiresAt = toSqlDateTime(new Date(Date.now() + 12 * 60 * 60 * 1000));

    await withTransaction(async (conn) => {
      await conn.execute('DELETE FROM sessions WHERE expires_at <= NOW()');
      if (typeof priorSessionId === 'string' && priorSessionId) {
        await conn.execute('DELETE FROM sessions WHERE id = ?', [priorSessionId]);
      }
      await conn.execute(
        `INSERT INTO sessions (id, csrf_token, expires_at, created_at)
         VALUES (?, ?, ?, ?)`,
        [sessionId, csrfToken, expiresAt, now]
      );
      await conn.execute(
        `INSERT INTO audit_events (id, action, summary, created_at)
         VALUES (?, 'login_success', 'تم فتح الخزنة بنجاح', ?)`,
        [crypto.randomUUID(), now]
      );
    });

    setSessionCookie(res, sessionId);
    res.json({
      ok: true,
      pinSalt: owner.pin_salt,
      wrappedMasterKey: owner.wrapped_master_key,
      csrfToken,
    });
  } catch {
    res.status(503).json({ error: 'تعذر التحقق على الخادم' });
  }
});

authRouter.post('/lock', requireSession, requireCsrf, async (req: AuthenticatedRequest, res) => {
  try {
    if (req.sessionId) {
      await pool.execute('DELETE FROM sessions WHERE id = ?', [req.sessionId]);
    }
    await pool.execute(
      `INSERT INTO audit_events (id, action, summary, created_at)
       VALUES (?, 'lock', 'تم قفل الخزنة', ?)`,
      [crypto.randomUUID(), toSqlDateTime()]
    );
  } catch {
    // Still clear cookie
  }
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

authRouter.post('/logout', requireSession, requireCsrf, async (req: AuthenticatedRequest, res) => {
  try {
    if (req.sessionId) {
      await pool.execute('DELETE FROM sessions WHERE id = ?', [req.sessionId]);
    }
    await pool.execute(
      `INSERT INTO audit_events (id, action, summary, created_at)
       VALUES (?, 'logout', 'تم تسجيل الخروج من الجلسة', ?)`,
      [crypto.randomUUID(), toSqlDateTime()]
    );
  } catch {
    // Still clear cookie
  }
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

authRouter.post(
  '/change-pin',
  requireSession,
  requireCsrf,
  async (req: AuthenticatedRequest, res) => {
    const { currentPin, newPin, newPinSalt, newWrappedMasterKey } = req.body as Record<
      string,
      unknown
    >;

    if (
      typeof currentPin !== 'string' ||
      !/^\d{6}$/.test(currentPin) ||
      typeof newPin !== 'string' ||
      !/^\d{6}$/.test(newPin) ||
      typeof newPinSalt !== 'string' ||
      !newPinSalt.trim() ||
      newPinSalt.length > 255 ||
      typeof newWrappedMasterKey !== 'string' ||
      !newWrappedMasterKey ||
      newWrappedMasterKey.length > 4096 ||
      !isValidEncryptedField(newWrappedMasterKey)
    ) {
      res.status(400).json({ error: 'بيانات تحديث رمز الأمان غير صالحة' });
      return;
    }

    try {
      const [owners] = await pool.execute<OwnerRow[]>(
        'SELECT id, pin_salt, pin_verifier FROM owner_security WHERE id = 1 LIMIT 1'
      );
      const owner = owners[0];
      if (!owner) {
        res.status(404).json({ error: 'المالك غير مهيأ' });
        return;
      }

      const valid = verifyPinConstantTime(currentPin, owner.pin_salt, owner.pin_verifier);
      const now = toSqlDateTime();
      if (!valid) {
        await pool.execute(
          `INSERT INTO audit_events (id, action, summary, created_at)
           VALUES (?, 'login_failed', 'فشل التحقق عند محاولة تغيير رمز الأمان', ?)`,
          [crypto.randomUUID(), now]
        );
        res.status(401).json({ error: 'رمز الأمان الحالي غير صحيح' });
        return;
      }

      const newVerifier = hashPinVerifier(newPin, newPinSalt);
      await withTransaction(async (conn) => {
        await conn.execute(
          `UPDATE owner_security
           SET pin_salt = ?, pin_verifier = ?, wrapped_master_key = ?, updated_at = ?
           WHERE id = 1`,
          [newPinSalt, newVerifier, newWrappedMasterKey, now]
        );
        await conn.execute(
          `INSERT INTO audit_events (id, action, summary, created_at)
           VALUES (?, 'pin_changed', 'تم تحديث رمز أمان بنجاح', ?)`,
          [crypto.randomUUID(), now]
        );
      });

      res.json({ ok: true });
    } catch {
      res.status(503).json({ error: 'تعذر الحفظ على الخادم' });
    }
  }
);
