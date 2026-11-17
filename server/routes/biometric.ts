import crypto from 'node:crypto';
import { Router, type Response } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { resolveWebAuthnConfig, serverEnv } from '../config/env';
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
  isValidEncryptedField,
  verifyPinConstantTime,
} from '../security/crypto';
import {
  buildBiometricAuthenticationOptions,
  buildBiometricRegistrationOptions,
  extractVerifiedCredentialRecord,
  generateChallengeBase64Url,
  generatePrfInputBase64Url,
  isChallengeExpired,
  parseTransportsJson,
  sanitizeAuthenticationResponse,
  sanitizeRegistrationResponse,
  verifyBiometricAssertion,
  verifyBiometricRegistration,
  WEBAUTHN_CHALLENGE_TTL_MS,
} from '../security/webauthn';

interface OwnerRow extends RowDataPacket {
  id: number;
  pin_salt: string;
  pin_verifier: string;
}

interface BiometricCredentialRow extends RowDataPacket {
  id: string;
  owner_id: number;
  credential_id: string;
  public_key: string;
  sign_count: number;
  transports: string | null;
  prf_input: string;
  hkdf_salt: string;
  wrapped_master_key: string;
  device_type: string | null;
  backed_up: number;
  created_at: Date;
  updated_at: Date;
}

interface ChallengeRow extends RowDataPacket {
  id: string;
  challenge: string;
  operation: 'enroll' | 'replace' | 'authenticate';
  session_id: string | null;
  prf_input: string | null;
  staged_credential_json: string | null;
  expires_at: Date;
}

interface StagedCredentialPayload {
  credentialId: string;
  publicKeyBase64: string;
  signCount: number;
  transportsJson: string | null;
  deviceType: string;
  backedUp: boolean;
  prfInput: string;
}

export const biometricRouter = Router();

const enrollLimiter = createRateLimiter(10, 10 * 60 * 1000);
const authOptionsLimiter = createRateLimiter(20, 5 * 60 * 1000);
const authVerifyLimiter = createRateLimiter(15, 5 * 60 * 1000);
const manageLimiter = createRateLimiter(10, 5 * 60 * 1000);

function setSessionCookie(res: Response, sessionId: string): void {
  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: serverEnv.isProduction,
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });
}

function isValidSaltString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length >= 8 &&
    value.trim().length <= 255
  );
}

biometricRouter.get('/status', async (_req, res) => {
  try {
    const webauthn = resolveWebAuthnConfig(serverEnv);
    const [owners] = await pool.execute<OwnerRow[]>(
      'SELECT id FROM owner_security WHERE id = 1 LIMIT 1'
    );
    const initialized = owners.length > 0;

    if (!initialized) {
      res.json({
        initialized: false,
        serverConfigured: webauthn.enabled,
        rpId: webauthn.rpId || undefined,
        enrolled: false,
        credentialCount: 0,
        diagnostic: webauthn.diagnostic,
      });
      return;
    }

    const [creds] = await pool.execute<BiometricCredentialRow[]>(
      'SELECT id, updated_at FROM biometric_credentials WHERE owner_id = 1 ORDER BY updated_at DESC'
    );

    res.json({
      initialized: true,
      serverConfigured: webauthn.enabled,
      rpId: webauthn.rpId || undefined,
      enrolled: creds.length > 0,
      credentialCount: creds.length,
      updatedAt: creds[0]?.updated_at
        ? new Date(creds[0].updated_at).toISOString()
        : undefined,
      diagnostic: webauthn.diagnostic,
    });
  } catch {
    res.status(503).json({ error: 'تعذر التحقق من حالة الدخول البيومتري على الخادم' });
  }
});

async function handleBeginRegistration(
  req: AuthenticatedRequest,
  res: Response,
  operation: 'enroll' | 'replace'
): Promise<void> {
  const webauthn = resolveWebAuthnConfig(serverEnv);
  if (!webauthn.enabled) {
    res.status(503).json({
      error:
        webauthn.diagnostic ||
        'إعدادات WebAuthn غير مهيأة على الخادم لهذا النطاق الآمن',
    });
    return;
  }

  const { pin } = req.body as { pin?: unknown };
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
    res.status(400).json({ error: 'مطلوب إدخال رمز أمان الحالي (6 أرقام)' });
    return;
  }

  try {
    const [owners] = await pool.execute<OwnerRow[]>(
      'SELECT id, pin_salt, pin_verifier FROM owner_security WHERE id = 1 LIMIT 1'
    );
    const owner = owners[0];
    if (!owner) {
      res.status(404).json({ error: 'يجب تهيئة رمز أمان أولاً قبل تفعيل الدخول البيومتري' });
      return;
    }

    if (!verifyPinConstantTime(pin, owner.pin_salt, owner.pin_verifier)) {
      await pool.execute(
        `INSERT INTO audit_events (id, action, summary, created_at)
         VALUES (?, 'login_failed', 'فشل التحقق من رمز PIN عند محاولة إدارة الدخول البيومتري', ?)`,
        [crypto.randomUUID(), toSqlDateTime()]
      );
      res.status(401).json({ error: 'رمز أمان الحالي غير صحيح' });
      return;
    }

    const [existingCreds] = await pool.execute<BiometricCredentialRow[]>(
      'SELECT credential_id, transports FROM biometric_credentials WHERE owner_id = 1'
    );

    if (operation === 'enroll' && existingCreds.length > 0) {
      res.status(409).json({
        error: 'الدخول البيومتري مفعل مسبقاً — يمكنك استخدام إعادة التسجيل',
      });
      return;
    }

    const challenge = generateChallengeBase64Url();
    const prfInput = generatePrfInputBase64Url();
    const now = toSqlDateTime();
    const expiresAt = toSqlDateTime(new Date(Date.now() + WEBAUTHN_CHALLENGE_TTL_MS));

    await withTransaction(async (conn) => {
      await conn.execute('DELETE FROM webauthn_challenges WHERE expires_at <= NOW()');
      await conn.execute(
        'DELETE FROM webauthn_challenges WHERE session_id = ? AND operation IN (?, ?)',
        [req.sessionId || null, 'enroll', 'replace']
      );
      await conn.execute(
        `INSERT INTO webauthn_challenges
          (id, challenge, operation, session_id, prf_input, staged_credential_json, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
        [crypto.randomUUID(), challenge, operation, req.sessionId || null, prfInput, expiresAt, now]
      );
    });

    const options = await buildBiometricRegistrationOptions({
      rpName: webauthn.rpName,
      rpId: webauthn.rpId,
      challenge,
      excludeCredentials:
        operation === 'enroll'
          ? existingCreds.map((c) => ({
              id: c.credential_id,
              transports: parseTransportsJson(c.transports),
            }))
          : [],
    });

    res.json({ options, prfInput });
  } catch {
    res.status(503).json({ error: 'تعذر بدء تسجيل المصادقة البيومترية' });
  }
}

async function handleVerifyRegistration(
  req: AuthenticatedRequest,
  res: Response,
  operation: 'enroll' | 'replace'
): Promise<void> {
  const webauthn = resolveWebAuthnConfig(serverEnv);
  if (!webauthn.enabled) {
    res.status(503).json({ error: 'إعدادات WebAuthn غير مهيأة على الخادم' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const challenge = typeof body.challenge === 'string' ? body.challenge : '';
  const hkdfSalt = body.hkdfSalt;
  const wrappedMasterKey = body.wrappedMasterKey;
  const sanitizedResp = sanitizeRegistrationResponse(body.registrationResponse);

  if (
    !challenge ||
    !sanitizedResp ||
    !isValidSaltString(hkdfSalt) ||
    typeof wrappedMasterKey !== 'string' ||
    !wrappedMasterKey ||
    !isValidEncryptedField(wrappedMasterKey)
  ) {
    res.status(400).json({ error: 'بيانات تسجيل الدخول البيومتري غير صالحة' });
    return;
  }

  try {
    const result = await withTransaction(async (conn) => {
      const [challengeRows] = await conn.execute<ChallengeRow[]>(
        `SELECT * FROM webauthn_challenges
         WHERE challenge = ? AND operation = ? AND session_id = ?
         LIMIT 1 FOR UPDATE`,
        [challenge, operation, req.sessionId || '']
      );

      const challengeRow = challengeRows[0];
      if (!challengeRow) {
        return { ok: false as const, status: 400, error: 'تحدي التسجيل غير صالح أو تم استخدامه مسبقاً' };
      }

      // Single-use: consume immediately
      await conn.execute('DELETE FROM webauthn_challenges WHERE id = ?', [challengeRow.id]);

      if (isChallengeExpired(challengeRow.expires_at) || !challengeRow.prf_input) {
        return { ok: false as const, status: 400, error: 'انتهت صلاحية جلسة التسجيل البيومتري' };
      }

      let verification;
      try {
        verification = await verifyBiometricRegistration({
          response: sanitizedResp,
          expectedChallenge: challengeRow.challenge,
          expectedOrigin: webauthn.origin,
          expectedRpId: webauthn.rpId,
        });
      } catch {
        return { ok: false as const, status: 401, error: 'فشل التحقق التشفيري من أداة المصادقة' };
      }

      if (!verification.verified) {
        return { ok: false as const, status: 401, error: 'لم يتم التحقق من هوية المستخدم البيومترية' };
      }

      const record = extractVerifiedCredentialRecord(verification);

      const [duplicates] = await conn.execute<BiometricCredentialRow[]>(
        'SELECT id FROM biometric_credentials WHERE credential_id = ? LIMIT 1',
        [record.credentialId]
      );
      if (duplicates.length > 0 && operation === 'enroll') {
        return { ok: false as const, status: 409, error: 'معرّف الاعتماد البيومتري مسجل مسبقاً' };
      }

      const now = toSqlDateTime();
      if (operation === 'replace') {
        await conn.execute('DELETE FROM biometric_credentials WHERE owner_id = 1');
      }

      await conn.execute(
        `INSERT INTO biometric_credentials
          (id, owner_id, credential_id, public_key, sign_count, transports, prf_input, hkdf_salt, wrapped_master_key, device_type, backed_up, created_at, updated_at)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          record.credentialId,
          record.publicKeyBase64,
          record.signCount,
          record.transportsJson,
          challengeRow.prf_input,
          hkdfSalt.trim(),
          wrappedMasterKey,
          record.deviceType,
          record.backedUp ? 1 : 0,
          now,
          now,
        ]
      );

      await conn.execute(
        `INSERT INTO audit_events (id, action, summary, created_at)
         VALUES (?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          operation === 'replace' ? 'biometric_replaced' : 'biometric_enrolled',
          operation === 'replace'
            ? 'إعادة تسجيل وسيلة الدخول البيومتري وربطها بمفتاح الخزنة'
            : 'تفعيل الدخول البيومتري وربط وسيلة التحقق بمفتاح الخزنة',
          now,
        ]
      );

      return { ok: true as const, updatedAt: new Date().toISOString() };
    });

    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json({ ok: true, updatedAt: result.updatedAt });
  } catch {
    res.status(503).json({ error: 'تعذر حفظ اعتماد الدخول البيومتري على الخادم' });
  }
}

async function handleStageRegistration(
  req: AuthenticatedRequest,
  res: Response,
  operation: 'enroll' | 'replace'
): Promise<void> {
  const webauthn = resolveWebAuthnConfig(serverEnv);
  if (!webauthn.enabled) {
    res.status(503).json({ error: 'إعدادات WebAuthn غير مهيأة على الخادم' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const challenge = typeof body.challenge === 'string' ? body.challenge : '';
  const sanitizedResp = sanitizeRegistrationResponse(body.registrationResponse);

  if (!challenge || !sanitizedResp) {
    res.status(400).json({ error: 'بيانات التحقق الأولي للتسجيل غير صالحة' });
    return;
  }

  try {
    const result = await withTransaction(async (conn) => {
      const [challengeRows] = await conn.execute<ChallengeRow[]>(
        `SELECT * FROM webauthn_challenges
         WHERE challenge = ? AND operation = ? AND session_id = ?
         LIMIT 1 FOR UPDATE`,
        [challenge, operation, req.sessionId || '']
      );

      const challengeRow = challengeRows[0];
      if (!challengeRow) {
        return { ok: false as const, status: 400, error: 'تحدي التسجيل غير صالح أو منتهي الصلاحية' };
      }

      await conn.execute('DELETE FROM webauthn_challenges WHERE id = ?', [challengeRow.id]);

      if (isChallengeExpired(challengeRow.expires_at) || !challengeRow.prf_input) {
        return { ok: false as const, status: 400, error: 'انتهت صلاحية تحدي التسجيل البيومتري' };
      }

      let verification;
      try {
        verification = await verifyBiometricRegistration({
          response: sanitizedResp,
          expectedChallenge: challengeRow.challenge,
          expectedOrigin: webauthn.origin,
          expectedRpId: webauthn.rpId,
        });
      } catch {
        return { ok: false as const, status: 401, error: 'فشل التحقق التشفيري من أداة المصادقة' };
      }

      if (!verification.verified) {
        return { ok: false as const, status: 401, error: 'لم يكتمل التحقق من هوية المستخدم' };
      }

      const record = extractVerifiedCredentialRecord(verification);
      const [duplicates] = await conn.execute<BiometricCredentialRow[]>(
        'SELECT id FROM biometric_credentials WHERE credential_id = ? LIMIT 1',
        [record.credentialId]
      );
      if (duplicates.length > 0 && operation === 'enroll') {
        return { ok: false as const, status: 409, error: 'معرّف الاعتماد البيومتري مسجل مسبقاً' };
      }

      const nextChallenge = generateChallengeBase64Url();
      const now = toSqlDateTime();
      const expiresAt = toSqlDateTime(new Date(Date.now() + WEBAUTHN_CHALLENGE_TTL_MS));
      const stagedPayload: StagedCredentialPayload = {
        ...record,
        prfInput: challengeRow.prf_input,
      };

      await conn.execute(
        `INSERT INTO webauthn_challenges
          (id, challenge, operation, session_id, prf_input, staged_credential_json, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          nextChallenge,
          operation,
          req.sessionId || null,
          challengeRow.prf_input,
          JSON.stringify(stagedPayload),
          expiresAt,
          now,
        ]
      );

      const assertionOptions = await buildBiometricAuthenticationOptions({
        rpId: webauthn.rpId,
        challenge: nextChallenge,
        allowCredentials: [
          {
            id: record.credentialId,
            transports: parseTransportsJson(record.transportsJson),
          },
        ],
      });

      return {
        ok: true as const,
        assertionOptions,
        prfInput: challengeRow.prf_input,
      };
    });

    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json({
      assertionOptions: result.assertionOptions,
      prfInput: result.prfInput,
    });
  } catch {
    res.status(503).json({ error: 'تعذر تجهيز مرحلة ربط مفتاح التشفير البيومتري' });
  }
}

async function handleFinalizeStagedRegistration(
  req: AuthenticatedRequest,
  res: Response,
  operation: 'enroll' | 'replace'
): Promise<void> {
  const webauthn = resolveWebAuthnConfig(serverEnv);
  if (!webauthn.enabled) {
    res.status(503).json({ error: 'إعدادات WebAuthn غير مهيأة على الخادم' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const challenge = typeof body.challenge === 'string' ? body.challenge : '';
  const hkdfSalt = body.hkdfSalt;
  const wrappedMasterKey = body.wrappedMasterKey;
  const sanitizedAuth = sanitizeAuthenticationResponse(body.authenticationResponse);

  if (
    !challenge ||
    !sanitizedAuth ||
    !isValidSaltString(hkdfSalt) ||
    typeof wrappedMasterKey !== 'string' ||
    !wrappedMasterKey ||
    !isValidEncryptedField(wrappedMasterKey)
  ) {
    res.status(400).json({ error: 'بيانات إتمام الربط البيومتري غير صالحة' });
    return;
  }

  try {
    const result = await withTransaction(async (conn) => {
      const [challengeRows] = await conn.execute<ChallengeRow[]>(
        `SELECT * FROM webauthn_challenges
         WHERE challenge = ? AND operation = ? AND session_id = ?
         LIMIT 1 FOR UPDATE`,
        [challenge, operation, req.sessionId || '']
      );

      const challengeRow = challengeRows[0];
      if (!challengeRow || !challengeRow.staged_credential_json) {
        return { ok: false as const, status: 400, error: 'جلسة إتمام التسجيل غير موجودة أو منتهية' };
      }

      await conn.execute('DELETE FROM webauthn_challenges WHERE id = ?', [challengeRow.id]);

      if (isChallengeExpired(challengeRow.expires_at)) {
        return { ok: false as const, status: 400, error: 'انتهت صلاحية مرحلة إتمام الربط البيومتري' };
      }

      const staged = JSON.parse(challengeRow.staged_credential_json) as StagedCredentialPayload;
      if (sanitizedAuth.id !== staged.credentialId) {
        return { ok: false as const, status: 401, error: 'تطابق الاعتماد البيومتري غير صحيح' };
      }

      let verification;
      try {
        verification = await verifyBiometricAssertion({
          response: sanitizedAuth,
          expectedChallenge: challengeRow.challenge,
          expectedOrigin: webauthn.origin,
          expectedRpId: webauthn.rpId,
          credential: {
            id: staged.credentialId,
            publicKeyBase64: staged.publicKeyBase64,
            counter: staged.signCount,
            transports: parseTransportsJson(staged.transportsJson),
          },
        });
      } catch {
        return { ok: false as const, status: 401, error: 'فشل التحقق من توقيع الاعتماد البيومتري' };
      }

      if (!verification.verified) {
        return { ok: false as const, status: 401, error: 'لم يتم التحقق من هوية المستخدم البيومترية' };
      }

      const [duplicates] = await conn.execute<BiometricCredentialRow[]>(
        'SELECT id FROM biometric_credentials WHERE credential_id = ? LIMIT 1',
        [staged.credentialId]
      );
      if (duplicates.length > 0 && operation === 'enroll') {
        return { ok: false as const, status: 409, error: 'معرّف الاعتماد البيومتري مسجل مسبقاً' };
      }

      const now = toSqlDateTime();
      if (operation === 'replace') {
        await conn.execute('DELETE FROM biometric_credentials WHERE owner_id = 1');
      }

      await conn.execute(
        `INSERT INTO biometric_credentials
          (id, owner_id, credential_id, public_key, sign_count, transports, prf_input, hkdf_salt, wrapped_master_key, device_type, backed_up, created_at, updated_at)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          staged.credentialId,
          staged.publicKeyBase64,
          Number(verification.authenticationInfo.newCounter) || staged.signCount,
          staged.transportsJson,
          staged.prfInput,
          hkdfSalt.trim(),
          wrappedMasterKey,
          verification.authenticationInfo.credentialDeviceType || staged.deviceType,
          verification.authenticationInfo.credentialBackedUp ? 1 : 0,
          now,
          now,
        ]
      );

      await conn.execute(
        `INSERT INTO audit_events (id, action, summary, created_at)
         VALUES (?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          operation === 'replace' ? 'biometric_replaced' : 'biometric_enrolled',
          operation === 'replace'
            ? 'إعادة تسجيل وسيلة الدخول البيومتري وربطها بمفتاح الخزنة'
            : 'تفعيل الدخول البيومتري وربط وسيلة التحقق بمفتاح الخزنة',
          now,
        ]
      );

      return { ok: true as const, updatedAt: new Date().toISOString() };
    });

    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json({ ok: true, updatedAt: result.updatedAt });
  } catch {
    res.status(503).json({ error: 'تعذر حفظ اعتماد الدخول البيومتري على الخادم' });
  }
}

biometricRouter.post(
  '/enroll/options',
  requireSession,
  requireCsrf,
  enrollLimiter,
  (req: AuthenticatedRequest, res) => handleBeginRegistration(req, res, 'enroll')
);
biometricRouter.post(
  '/enroll/verify',
  requireSession,
  requireCsrf,
  authVerifyLimiter,
  (req: AuthenticatedRequest, res) => handleVerifyRegistration(req, res, 'enroll')
);
biometricRouter.post(
  '/enroll/stage',
  requireSession,
  requireCsrf,
  authVerifyLimiter,
  (req: AuthenticatedRequest, res) => handleStageRegistration(req, res, 'enroll')
);
biometricRouter.post(
  '/enroll/finalize',
  requireSession,
  requireCsrf,
  authVerifyLimiter,
  (req: AuthenticatedRequest, res) => handleFinalizeStagedRegistration(req, res, 'enroll')
);

biometricRouter.post(
  '/replace/options',
  requireSession,
  requireCsrf,
  enrollLimiter,
  (req: AuthenticatedRequest, res) => handleBeginRegistration(req, res, 'replace')
);
biometricRouter.post(
  '/replace/verify',
  requireSession,
  requireCsrf,
  authVerifyLimiter,
  (req: AuthenticatedRequest, res) => handleVerifyRegistration(req, res, 'replace')
);
biometricRouter.post(
  '/replace/stage',
  requireSession,
  requireCsrf,
  authVerifyLimiter,
  (req: AuthenticatedRequest, res) => handleStageRegistration(req, res, 'replace')
);
biometricRouter.post(
  '/replace/finalize',
  requireSession,
  requireCsrf,
  authVerifyLimiter,
  (req: AuthenticatedRequest, res) => handleFinalizeStagedRegistration(req, res, 'replace')
);

biometricRouter.post('/options', authOptionsLimiter, async (_req, res) => {
  const webauthn = resolveWebAuthnConfig(serverEnv);
  if (!webauthn.enabled) {
    res.status(503).json({
      error:
        webauthn.diagnostic ||
        'الدخول البيومتري غير مهيأ على الخادم لهذا النطاق الآمن',
    });
    return;
  }

  try {
    const [owners] = await pool.execute<OwnerRow[]>(
      'SELECT id FROM owner_security WHERE id = 1 LIMIT 1'
    );
    if (owners.length === 0) {
      res.status(404).json({ error: 'لم يتم تهيئة الخزنة بعد' });
      return;
    }

    const [creds] = await pool.execute<BiometricCredentialRow[]>(
      'SELECT id, credential_id, transports, prf_input FROM biometric_credentials WHERE owner_id = 1 ORDER BY updated_at DESC'
    );
    const cred = creds[0];
    if (!cred) {
      res.status(404).json({ error: 'الدخول البيومتري غير مفعل لهذا الحساب' });
      return;
    }

    const challenge = generateChallengeBase64Url();
    const now = toSqlDateTime();
    const expiresAt = toSqlDateTime(new Date(Date.now() + WEBAUTHN_CHALLENGE_TTL_MS));

    await withTransaction(async (conn) => {
      await conn.execute('DELETE FROM webauthn_challenges WHERE expires_at <= NOW()');
      await conn.execute(
        `INSERT INTO webauthn_challenges
          (id, challenge, operation, session_id, prf_input, staged_credential_json, expires_at, created_at)
         VALUES (?, ?, 'authenticate', NULL, ?, NULL, ?, ?)`,
        [crypto.randomUUID(), challenge, cred.prf_input, expiresAt, now]
      );
    });

    const options = await buildBiometricAuthenticationOptions({
      rpId: webauthn.rpId,
      challenge,
      allowCredentials: creds.map((row) => ({
        id: row.credential_id,
        transports: parseTransportsJson(row.transports),
      })),
    });

    res.json({ options, prfInput: cred.prf_input });
  } catch {
    res.status(503).json({ error: 'تعذر بدء التحقق البيومتري على الخادم' });
  }
});

biometricRouter.post('/verify', authVerifyLimiter, async (req, res) => {
  const webauthn = resolveWebAuthnConfig(serverEnv);
  if (!webauthn.enabled) {
    res.status(503).json({ error: 'إعدادات WebAuthn غير مهيأة على الخادم' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const challenge = typeof body.challenge === 'string' ? body.challenge : '';
  const sanitizedResp = sanitizeAuthenticationResponse(body.authenticationResponse);

  if (!challenge || !sanitizedResp) {
    res.status(400).json({ error: 'بيانات التحقق البيومتري غير صالحة' });
    return;
  }

  try {
    const priorSessionId = req.cookies?.[SESSION_COOKIE_NAME];
    const now = toSqlDateTime();

    const outcome = await withTransaction(async (conn) => {
      const [challengeRows] = await conn.execute<ChallengeRow[]>(
        `SELECT * FROM webauthn_challenges
         WHERE challenge = ? AND operation = 'authenticate'
         LIMIT 1 FOR UPDATE`,
        [challenge]
      );
      const challengeRow = challengeRows[0];
      if (!challengeRow) {
        await conn.execute(
          `INSERT INTO audit_events (id, action, summary, created_at)
           VALUES (?, 'biometric_login_failed', 'فشل فتح الخزنة بيومترياً: تحدي غير صالح أو مكرر', ?)`,
          [crypto.randomUUID(), now]
        );
        return { ok: false as const, status: 401, error: 'تعذر التحقق البيومتري' };
      }

      // Single-use: consume immediately
      await conn.execute('DELETE FROM webauthn_challenges WHERE id = ?', [challengeRow.id]);

      if (isChallengeExpired(challengeRow.expires_at)) {
        await conn.execute(
          `INSERT INTO audit_events (id, action, summary, created_at)
           VALUES (?, 'biometric_login_failed', 'فشل فتح الخزنة بيومترياً: انتهت صلاحية التحدي', ?)`,
          [crypto.randomUUID(), now]
        );
        return { ok: false as const, status: 401, error: 'انتهت صلاحية التحقق البيومتري' };
      }

      const [creds] = await conn.execute<BiometricCredentialRow[]>(
        `SELECT * FROM biometric_credentials
         WHERE owner_id = 1 AND credential_id = ?
         LIMIT 1 FOR UPDATE`,
        [sanitizedResp.id]
      );
      const cred = creds[0];
      if (!cred) {
        await conn.execute(
          `INSERT INTO audit_events (id, action, summary, created_at)
           VALUES (?, 'biometric_login_failed', 'فشل فتح الخزنة بيومترياً: اعتماد غير معروف', ?)`,
          [crypto.randomUUID(), now]
        );
        return { ok: false as const, status: 401, error: 'بيانات الدخول البيومتري غير معروفة' };
      }

      let verification;
      try {
        verification = await verifyBiometricAssertion({
          response: sanitizedResp,
          expectedChallenge: challengeRow.challenge,
          expectedOrigin: webauthn.origin,
          expectedRpId: webauthn.rpId,
          credential: {
            id: cred.credential_id,
            publicKeyBase64: cred.public_key,
            counter: Number(cred.sign_count) || 0,
            transports: parseTransportsJson(cred.transports),
          },
        });
      } catch {
        await conn.execute(
          `INSERT INTO audit_events (id, action, summary, created_at)
           VALUES (?, 'biometric_login_failed', 'فشل التحقق التشفيري من التوقيع البيومتري', ?)`,
          [crypto.randomUUID(), now]
        );
        return { ok: false as const, status: 401, error: 'تعذر التحقق البيومتري' };
      }

      if (!verification.verified) {
        await conn.execute(
          `INSERT INTO audit_events (id, action, summary, created_at)
           VALUES (?, 'biometric_login_failed', 'لم يكتمل التحقق من المستخدم عبر المصادقة البيومترية', ?)`,
          [crypto.randomUUID(), now]
        );
        return { ok: false as const, status: 401, error: 'تعذر التحقق البيومتري' };
      }

      const nextCounter = Number(verification.authenticationInfo.newCounter) || 0;
      await conn.execute(
        `UPDATE biometric_credentials
         SET sign_count = ?, device_type = ?, backed_up = ?, updated_at = ?
         WHERE id = ?`,
        [
          nextCounter,
          verification.authenticationInfo.credentialDeviceType || cred.device_type,
          verification.authenticationInfo.credentialBackedUp ? 1 : 0,
          now,
          cred.id,
        ]
      );

      const sessionId = generateRandomToken(32);
      const csrfToken = generateRandomToken(24);
      const expiresAt = toSqlDateTime(new Date(Date.now() + 12 * 60 * 60 * 1000));

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
         VALUES (?, 'biometric_login_success', 'تم فتح الخزنة عبر الدخول البيومتري بنجاح', ?)`,
        [crypto.randomUUID(), now]
      );

      return {
        ok: true as const,
        sessionId,
        csrfToken,
        hkdfSalt: cred.hkdf_salt,
        prfInput: cred.prf_input,
        wrappedMasterKey: cred.wrapped_master_key,
      };
    });

    if (!outcome.ok) {
      res.status(outcome.status).json({ error: outcome.error });
      return;
    }

    setSessionCookie(res, outcome.sessionId);
    res.json({
      ok: true,
      hkdfSalt: outcome.hkdfSalt,
      prfInput: outcome.prfInput,
      wrappedMasterKey: outcome.wrappedMasterKey,
      csrfToken: outcome.csrfToken,
    });
  } catch {
    res.status(503).json({ error: 'تعذر التحقق البيومتري على الخادم' });
  }
});

biometricRouter.post(
  '/remove',
  requireSession,
  requireCsrf,
  manageLimiter,
  async (req: AuthenticatedRequest, res) => {
    const { pin } = req.body as { pin?: unknown };
    if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
      res.status(400).json({ error: 'مطلوب إدخال رمز أمان (6 أرقام) لإلغاء الدخول البيومتري' });
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

      if (!verifyPinConstantTime(pin, owner.pin_salt, owner.pin_verifier)) {
        await pool.execute(
          `INSERT INTO audit_events (id, action, summary, created_at)
           VALUES (?, 'login_failed', 'فشل التحقق من رمز PIN عند محاولة إلغاء الدخول البيومتري', ?)`,
          [crypto.randomUUID(), toSqlDateTime()]
        );
        res.status(401).json({ error: 'رمز أمان غير صحيح' });
        return;
      }

      const now = toSqlDateTime();
      await withTransaction(async (conn) => {
        await conn.execute('DELETE FROM biometric_credentials WHERE owner_id = 1');
        await conn.execute('DELETE FROM webauthn_challenges');
        await conn.execute(
          `INSERT INTO audit_events (id, action, summary, created_at)
           VALUES (?, 'biometric_removed', 'تم إلغاء الدخول البيومتري مع بقاء رمز PIN نشطاً', ?)`,
          [crypto.randomUUID(), now]
        );
      });

      res.json({ ok: true });
    } catch {
      res.status(503).json({ error: 'تعذر إلغاء الدخول البيومتري على الخادم' });
    }
  }
);
