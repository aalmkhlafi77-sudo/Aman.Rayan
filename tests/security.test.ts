import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextFunction, Response } from 'express';
import { resolveAppMode, BACKUP_APP_ID, BACKUP_FORMAT, BACKUP_FORMAT_VERSION } from '../src/version';
import { normalizeUrl } from '../src/utils/normalize';
import {
  createEncryptedBackupEnvelope,
  decryptBackupEnvelope,
  decryptVaultItem,
  encryptVaultItemInput,
  generateMasterVaultKey,
  generateSaltBase64,
  unwrapMasterKeyWithBiometricPrf,
  unwrapMasterKeyWithPin,
  validateBackupEnvelopeFormat,
  wrapMasterKeyWithBiometricPrf,
  wrapMasterKeyWithPin,
} from '../src/services/crypto';
import {
  resolveWebAuthnConfig,
  validateProductionConfig,
  validateWebAuthnProductionSettings,
  type ServerEnvConfig,
} from '../server/config/env';
import {
  hashPinVerifier,
  isValidEncryptedField,
  safeTimingCompare,
  validateAuditInput,
  validateBootstrapToken,
  validateEncryptedItemPayload,
  verifyPinConstantTime,
} from '../server/security/crypto';
import { requireCsrf, type AuthenticatedRequest } from '../server/middleware/security';
import {
  generateChallengeBase64Url,
  generatePrfInputBase64Url,
  isChallengeExpired,
  isValidBase64UrlToken,
} from '../server/security/webauthn';

function makeValidProdEnv(overrides: Partial<ServerEnvConfig> = {}): ServerEnvConfig {
  return {
    nodeEnv: 'production',
    isProduction: true,
    port: 3000,
    publicOrigin: 'https://vault.aman-secure.org',
    dbHost: '127.0.0.1',
    dbPort: 3306,
    dbName: 'aman',
    dbUser: 'aman_app',
    dbPassword: 'strong-production-db-password-987654',
    sessionSecret: 'a-very-long-random-production-session-secret-64-chars-minimum-ok',
    amanBootstrapToken: '',
    webauthnRpName: 'Aman Rayan',
    webauthnRpId: '',
    webauthnOrigin: '',
    ...overrides,
  };
}

function makeMockRes() {
  const state: { statusCode: number; body: unknown } = { statusCode: 200, body: undefined };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      state.body = payload;
      return this;
    },
  } as unknown as Response;
  return { res, state };
}

test('resolveAppMode prevents silent preview fallback in production builds', () => {
  assert.equal(resolveAppMode('preview', false), 'preview');
  assert.equal(resolveAppMode('production', false), 'production');
  assert.equal(resolveAppMode(undefined, true), 'preview');
  assert.equal(resolveAppMode('', true), 'preview');

  assert.throws(() => resolveAppMode(undefined, false), /Invalid VITE_APP_MODE/);
  assert.throws(() => resolveAppMode('', false), /Invalid VITE_APP_MODE/);
  assert.throws(() => resolveAppMode('prod', false), /Invalid VITE_APP_MODE/);
  assert.throws(() => resolveAppMode('staging', true), /Invalid VITE_APP_MODE/);
});

test('validateProductionConfig rejects placeholders/invalid values and allows removed bootstrap token', () => {
  assert.doesNotThrow(() => validateProductionConfig(makeValidProdEnv(), 'production'));
  assert.doesNotThrow(() => validateProductionConfig(makeValidProdEnv({ amanBootstrapToken: '' })));

  assert.throws(
    () => validateProductionConfig(makeValidProdEnv({ dbPassword: 'CHANGE_ME' })),
    /DB_PASSWORD/
  );
  assert.throws(
    () => validateProductionConfig(makeValidProdEnv({ dbPassword: '' })),
    /DB_PASSWORD/
  );
  assert.throws(
    () => validateProductionConfig(makeValidProdEnv({ sessionSecret: 'short-secret' })),
    /SESSION_SECRET/
  );
  assert.throws(
    () => validateProductionConfig(makeValidProdEnv({ publicOrigin: 'https://example.com' })),
    /example\.com/
  );
  assert.throws(
    () => validateProductionConfig(makeValidProdEnv({ publicOrigin: 'ftp://vault.test' })),
    /http:\/\/ or https:\/\//
  );
  assert.throws(
    () => validateProductionConfig(makeValidProdEnv(), 'preview'),
    /VITE_APP_MODE/
  );
});

test('WebAuthn production validation enforces HTTPS, exact RP/origin match, and rejects localhost/example.com', () => {
  const disabledProd = resolveWebAuthnConfig(makeValidProdEnv());
  assert.equal(disabledProd.enabled, false);

  const validWebAuthn = makeValidProdEnv({
    webauthnRpName: 'Aman Rayan',
    webauthnRpId: 'vault.aman-secure.org',
    webauthnOrigin: 'https://vault.aman-secure.org',
  });
  assert.deepEqual(validateWebAuthnProductionSettings(validWebAuthn), []);
  assert.equal(resolveWebAuthnConfig(validWebAuthn).enabled, true);

  assert.ok(
    validateWebAuthnProductionSettings(
      makeValidProdEnv({
        webauthnRpId: 'localhost',
        webauthnOrigin: 'http://localhost:3000',
      })
    ).length > 0
  );
  assert.ok(
    validateWebAuthnProductionSettings(
      makeValidProdEnv({
        webauthnRpId: 'vault.aman-secure.org',
        webauthnOrigin: 'http://vault.aman-secure.org',
      })
    ).length > 0
  );
  assert.ok(
    validateWebAuthnProductionSettings(
      makeValidProdEnv({
        webauthnRpId: 'vault.aman-secure.org',
        webauthnOrigin: 'https://other-domain.org',
      })
    ).length > 0
  );
  assert.ok(
    validateWebAuthnProductionSettings(
      makeValidProdEnv({
        webauthnRpId: '*.aman-secure.org',
        webauthnOrigin: 'https://vault.aman-secure.org',
      })
    ).length > 0
  );
});

test('normalizeUrl allows safe HTTP(S) URLs and rejects dangerous or non-HTTP schemes', () => {
  assert.equal(normalizeUrl('https://github.com/login'), 'https://github.com/login');
  assert.equal(normalizeUrl('http://localhost:8080/admin'), 'http://localhost:8080/admin');
  assert.equal(normalizeUrl('example.org/panel'), 'https://example.org/panel');
  assert.equal(normalizeUrl('localhost:3000/api'), 'https://localhost:3000/api');

  const rejected = [
    'javascript:alert(1)',
    '  JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'vbscript:msgbox(1)',
    'blob:https://example.com/123',
    'about:blank',
    'ftp://files.example.org/secret.txt',
    'mailto:admin@example.org',
    'ssh://root@10.0.0.1',
    'custom://app/open',
    '',
  ];
  for (const raw of rejected) {
    assert.equal(normalizeUrl(raw), null, `Expected URL to be rejected: ${raw}`);
  }
});

test('server PBKDF2 PIN verification and bootstrap token validation are strict and constant-time', () => {
  const salt = Buffer.from('0123456789abcdef').toString('base64');
  const verifier = hashPinVerifier('482910', salt);

  assert.equal(verifyPinConstantTime('482910', salt, verifier), true);
  assert.equal(verifyPinConstantTime('482911', salt, verifier), false);
  assert.equal(safeTimingCompare('abc123', 'abc123'), true);
  assert.equal(safeTimingCompare('abc123', 'abc124'), false);
  assert.equal(safeTimingCompare('abc123', 'abc1234'), false);

  const validBootstrap = 'aman_bootstrap_9f4b7e2c1a8d6f034b72e9a1c5d80e2a';
  assert.equal(validateBootstrapToken(validBootstrap, validBootstrap).valid, true);
  assert.equal(validateBootstrapToken('wrong-token', validBootstrap).valid, false);
  assert.equal(validateBootstrapToken('', validBootstrap).valid, false);
  assert.equal(validateBootstrapToken('short', 'short').valid, false);
  assert.equal(validateBootstrapToken('CHANGE_ME_12345678901234567890', 'CHANGE_ME_12345678901234567890').valid, false);
});

test('server encrypted item payload & audit validators enforce ENC:... format and bounds', () => {
  assert.equal(isValidEncryptedField('ENC:AAAA:BBBB'), true);
  assert.equal(isValidEncryptedField(''), true);
  assert.equal(isValidEncryptedField('plaintext-secret'), false);

  const validPayload = {
    title: 'GitHub',
    username: 'abdullah',
    email: 'user@aman.local',
    encryptedPassword: 'ENC:ivBase64==:cipherBase64==',
    encryptedNotes: 'ENC:ivBase64==:notesCipher==',
    encryptedSecretsPayload: 'ENC:ivBase64==:bundleCipher==',
    urls: ['https://github.com'],
  };
  assert.equal(validateEncryptedItemPayload(validPayload).valid, true);

  assert.equal(
    validateEncryptedItemPayload({ ...validPayload, encryptedPassword: 'raw-password' }).valid,
    false
  );
  assert.equal(
    validateEncryptedItemPayload({ ...validPayload, encryptedNotes: 'raw-notes' }).valid,
    false
  );
  assert.equal(
    validateEncryptedItemPayload({ ...validPayload, encryptedSecretsPayload: '{"apiKeys":[]}' }).valid,
    false
  );
  assert.equal(
    validateEncryptedItemPayload({ ...validPayload, urls: ['javascript:alert(1)'] }).valid,
    false
  );
  assert.equal(
    validateEncryptedItemPayload({ ...validPayload, title: 'x'.repeat(300) }).valid,
    false
  );

  assert.equal(validateAuditInput('create', 'Created entry').valid, true);
  assert.equal(validateAuditInput('arbitrary_action', 'bad').valid, false);
  assert.equal(validateAuditInput('create', '   ').valid, false);
});

test('Web Crypto vault encryption and .aman v2.0.0 backup roundtrip preserve format and reject bad secrets', async () => {
  const pin = '739204';
  const pinSalt = generateSaltBase64(16);
  const masterKey = await generateMasterVaultKey();
  const wrapped = await wrapMasterKeyWithPin(masterKey, pin, pinSalt);
  assert.ok(wrapped.startsWith('ENC:'));

  const unwrapped = await unwrapMasterKeyWithPin(wrapped, pin, pinSalt);
  await assert.rejects(() => unwrapMasterKeyWithPin(wrapped, '000000', pinSalt));

  const encryptedInput = await encryptVaultItemInput(unwrapped, {
    title: 'Hostinger Production DB',
    username: 'aman_app',
    email: 'ops@aman.local',
    password: 'SuperSecret!2026',
    urls: ['https://hpanel.hostinger.com'],
    notes: 'Rotation note',
    isFavorite: true,
    apiKeys: [{ id: 'k1', label: 'Primary', value: 'ak_live_12345' }],
    tokens: [],
    secretKeys: [],
    licenseKeys: [],
    certificates: [],
  });

  assert.ok(encryptedInput.encryptedPassword?.startsWith('ENC:'));
  assert.ok(encryptedInput.encryptedNotes?.startsWith('ENC:'));
  assert.ok(encryptedInput.encryptedSecretsPayload.startsWith('ENC:'));
  assert.ok(!encryptedInput.encryptedPassword?.includes('SuperSecret'));

  const decryptedItem = await decryptVaultItem(unwrapped, {
    ...encryptedInput,
    id: 'item-1',
    createdAt: '2026-11-17T10:00:00.000Z',
    updatedAt: '2026-11-17T10:00:00.000Z',
  });
  assert.equal(decryptedItem.password, 'SuperSecret!2026');
  assert.equal(decryptedItem.apiKeys[0]?.value, 'ak_live_12345');

  const envelope = await createEncryptedBackupEnvelope(
    {
      exportedAt: '2026-11-17T10:00:00.000Z',
      categories: [{ id: 'cat-1', name: 'Servers', createdAt: '2026-11-17T10:00:00.000Z' }],
      items: [decryptedItem],
      settings: { autoLockMinutes: 5, clipboardClearSeconds: 20 },
    },
    'BackupPass#2026'
  );

  assert.equal(envelope.format, BACKUP_FORMAT);
  assert.equal(envelope.version, BACKUP_FORMAT_VERSION);
  assert.equal(envelope.app, BACKUP_APP_ID);
  assert.equal(validateBackupEnvelopeFormat(envelope), true);
  assert.equal(validateBackupEnvelopeFormat({ format: 'WRONG' }), false);

  const restored = await decryptBackupEnvelope(envelope, 'BackupPass#2026');
  assert.equal(restored.items.length, 1);
  await assert.rejects(() => decryptBackupEnvelope(envelope, 'WrongPassword'));
});

// Biometric invariant: PRF material must unwrap the existing vault master key, never create a second vault key.
test('biometric PRF wrapping recovers the same master key and rejects wrong PRF material', async () => {
  const masterKey = await generateMasterVaultKey();
  const prfOutput = crypto.getRandomValues(new Uint8Array(32));
  const wrongPrfOutput = crypto.getRandomValues(new Uint8Array(32));
  const hkdfSalt = generateSaltBase64(16);

  const wrapped = await wrapMasterKeyWithBiometricPrf(masterKey, prfOutput, hkdfSalt);
  assert.ok(wrapped.startsWith('ENC:'));

  const recovered = await unwrapMasterKeyWithBiometricPrf(wrapped, prfOutput, hkdfSalt);

  const sample = new TextEncoder().encode('Aman Rayan biometric key verification');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, recovered, sample);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, masterKey, ciphertext);
  assert.equal(new TextDecoder().decode(plaintext), 'Aman Rayan biometric key verification');

  await assert.rejects(() =>
    unwrapMasterKeyWithBiometricPrf(wrapped, wrongPrfOutput, hkdfSalt)
  );

  prfOutput.fill(0);
  wrongPrfOutput.fill(0);
});

test('WebAuthn challenge helpers create strong base64url tokens and enforce expiry', () => {
  const challenge = generateChallengeBase64Url();
  const prfInput = generatePrfInputBase64Url();

  assert.equal(isValidBase64UrlToken(challenge, 32, 128), true);
  assert.equal(isValidBase64UrlToken(prfInput, 32, 128), true);
  assert.notEqual(challenge, prfInput);
  assert.equal(isValidBase64UrlToken('bad token with spaces'), false);

  assert.equal(isChallengeExpired(new Date(Date.now() - 1_000)), true);
  assert.equal(isChallengeExpired(new Date(Date.now() + 60_000)), false);
  assert.equal(isChallengeExpired('not-a-date'), true);
});

test('requireCsrf blocks missing/invalid CSRF tokens on mutations and allows valid matching tokens', () => {
  let called = false;
  const next: NextFunction = () => {
    called = true;
  };

  const { res: resMissing, state: stateMissing } = makeMockRes();
  requireCsrf(
    { method: 'POST', headers: {}, csrfToken: 'expected-csrf-token' } as AuthenticatedRequest,
    resMissing,
    next
  );
  assert.equal(called, false);
  assert.equal(stateMissing.statusCode, 403);

  const { res: resMismatch, state: stateMismatch } = makeMockRes();
  requireCsrf(
    {
      method: 'DELETE',
      headers: { 'x-csrf-token': 'wrong-token' },
      csrfToken: 'expected-csrf-token',
    } as unknown as AuthenticatedRequest,
    resMismatch,
    next
  );
  assert.equal(called, false);
  assert.equal(stateMismatch.statusCode, 403);

  const { res: resValid } = makeMockRes();
  requireCsrf(
    {
      method: 'POST',
      headers: { 'x-csrf-token': 'expected-csrf-token' },
      csrfToken: 'expected-csrf-token',
    } as unknown as AuthenticatedRequest,
    resValid,
    next
  );
  assert.equal(called, true);
});
