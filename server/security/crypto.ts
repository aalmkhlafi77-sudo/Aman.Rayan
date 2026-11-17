import crypto from 'node:crypto';

const PBKDF2_ITERATIONS = 120_000;
const ENC_FORMAT_REGEX = /^ENC:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/;

export const MAX_ENCRYPTED_FIELD_LENGTH = 262_144;
export const MAX_TITLE_LENGTH = 255;
export const MAX_TEXT_FIELD_LENGTH = 255;
export const MAX_URL_COUNT = 20;
export const MAX_URL_LENGTH = 2048;
export const MAX_CATEGORY_NAME_LENGTH = 120;
export const MAX_AUDIT_SUMMARY_LENGTH = 500;
export const MAX_BATCH_ITEMS = 2000;
export const MAX_BATCH_CATEGORIES = 200;

export const ALLOWED_AUDIT_ACTIONS = new Set([
  'login_success',
  'login_failed',
  'lock',
  'logout',
  'create',
  'update',
  'delete',
  'backup',
  'restore',
  'excel_export',
  'excel_import',
  'pin_changed',
  'wipe',
]);

const WEAK_BOOTSTRAP_TOKENS = new Set([
  'change_me',
  'changeme',
  'default',
  'bootstrap',
  'example',
  'test',
  'token',
]);

export function hashPinVerifier(pin: string, saltBase64: string): string {
  const salt = Buffer.from(saltBase64, 'base64');
  const derived = crypto.pbkdf2Sync(pin, salt, PBKDF2_ITERATIONS, 32, 'sha256');
  return derived.toString('base64');
}

export function verifyPinConstantTime(
  pin: string,
  saltBase64: string,
  storedVerifierBase64: string
): boolean {
  const computed = Buffer.from(hashPinVerifier(pin, saltBase64), 'base64');
  const stored = Buffer.from(storedVerifierBase64, 'base64');
  if (computed.length !== stored.length) return false;
  return crypto.timingSafeEqual(computed, stored);
}

export function generateRandomToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('hex');
}

export function isValidEncryptedField(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  return (
    typeof value === 'string' &&
    value.length <= MAX_ENCRYPTED_FIELD_LENGTH &&
    ENC_FORMAT_REGEX.test(value)
  );
}

export function safeTimingCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function validateBootstrapToken(
  supplied: unknown,
  configured: string
): { valid: boolean; error?: string } {
  const expected = configured.trim();
  if (
    !expected ||
    expected.length < 24 ||
    WEAK_BOOTSTRAP_TOKENS.has(expected.toLowerCase()) ||
    expected.toLowerCase().includes('change_me')
  ) {
    return {
      valid: false,
      error: 'رمز التأسيس الأولي غير مُكوّن بشكل آمن على الخادم (AMAN_BOOTSTRAP_TOKEN)',
    };
  }

  if (typeof supplied !== 'string' || !supplied.trim()) {
    return {
      valid: false,
      error: 'رمز التأسيس الأولي مطلوب في ترويسة X-AMAN-Bootstrap-Token',
    };
  }

  if (!safeTimingCompare(supplied.trim(), expected)) {
    return {
      valid: false,
      error: 'رمز التأسيس الأولي غير صحيح',
    };
  }

  return { valid: true };
}

export function isValidHttpUrlString(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateEncryptedItemPayload(body: Record<string, unknown>): {
  valid: boolean;
  error?: string;
} {
  if (typeof body.title !== 'string' || !body.title.trim()) {
    return { valid: false, error: 'عنوان العنصر مطلوب' };
  }
  if (body.title.trim().length > MAX_TITLE_LENGTH) {
    return { valid: false, error: 'عنوان العنصر يتجاوز الطول المسموح' };
  }
  if (
    body.username !== undefined &&
    body.username !== null &&
    (typeof body.username !== 'string' || body.username.length > MAX_TEXT_FIELD_LENGTH)
  ) {
    return { valid: false, error: 'اسم المستخدم غير صالح أو طويل جداً' };
  }
  if (
    body.email !== undefined &&
    body.email !== null &&
    (typeof body.email !== 'string' || body.email.length > MAX_TEXT_FIELD_LENGTH)
  ) {
    return { valid: false, error: 'البريد الإلكتروني غير صالح أو طويل جداً' };
  }
  if (
    body.categoryId !== undefined &&
    body.categoryId !== null &&
    (typeof body.categoryId !== 'string' || body.categoryId.length > 64)
  ) {
    return { valid: false, error: 'معرّف التصنيف غير صالح' };
  }
  if (body.urls !== undefined) {
    if (!Array.isArray(body.urls) || body.urls.length > MAX_URL_COUNT) {
      return { valid: false, error: 'قائمة الروابط تتجاوز الحد المسموح' };
    }
    for (const url of body.urls) {
      if (!isValidHttpUrlString(url)) {
        return { valid: false, error: 'تحتوي القائمة على رابط غير صالح أو غير آمن' };
      }
    }
  }
  if (!isValidEncryptedField(body.encryptedPassword)) {
    return { valid: false, error: 'يجب تشفير كلمة المرور قبل الإرسال (ENC:...)' };
  }
  if (!isValidEncryptedField(body.encryptedNotes)) {
    return { valid: false, error: 'يجب تشفير الملاحظات قبل الإرسال (ENC:...)' };
  }
  if (
    typeof body.encryptedSecretsPayload !== 'string' ||
    !isValidEncryptedField(body.encryptedSecretsPayload)
  ) {
    return { valid: false, error: 'يجب تشفير الحقول السرية قبل الإرسال (ENC:...)' };
  }
  return { valid: true };
}

export function validateAuditInput(
  action: unknown,
  summary: unknown
): { valid: boolean; action?: string; summary?: string } {
  if (typeof action !== 'string' || !ALLOWED_AUDIT_ACTIONS.has(action)) {
    return { valid: false };
  }
  if (typeof summary !== 'string' || !summary.trim()) {
    return { valid: false };
  }
  return {
    valid: true,
    action,
    summary: summary.trim().slice(0, MAX_AUDIT_SUMMARY_LENGTH),
  };
}
