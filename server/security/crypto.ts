import crypto from 'node:crypto';

const PBKDF2_ITERATIONS = 120_000;
const ENC_FORMAT_REGEX = /^ENC:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/;

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
  return typeof value === 'string' && ENC_FORMAT_REGEX.test(value);
}

export function safeTimingCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
