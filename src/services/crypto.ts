import {
  APP_SIGNATURE,
  BACKUP_APP_ID,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
} from '../version';
import type {
  BackupEnvelope,
  DecryptedBackupData,
  EncryptedVaultItem,
  EncryptedVaultItemInput,
  SecretEntry,
  VaultItem,
  VaultItemInput,
} from '../types/aman';
import { normalizeSecretEntries, safeArray, safeString } from '../utils/normalize';

const PBKDF2_ITERATIONS = 120_000;
const ENC_PREFIX = 'ENC:';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function generateSaltBase64(length = 16): string {
  const salt = new Uint8Array(length);
  crypto.getRandomValues(salt);
  return toBase64(salt);
}

export async function deriveKeyFromPin(
  pin: string,
  saltBase64: string,
  iterations = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey', 'deriveBits']
  );

  const salt = fromBase64(saltBase64);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );
}

export async function computeLocalPinVerifier(pin: string, saltBase64: string): Promise<string> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const salt = fromBase64(saltBase64);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    256
  );
  return toBase64(new Uint8Array(bits));
}

export async function generateMasterVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function wrapMasterKeyWithPin(
  masterKey: CryptoKey,
  pin: string,
  saltBase64: string
): Promise<string> {
  const kek = await deriveKeyFromPin(pin, saltBase64);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const wrapped = await crypto.subtle.wrapKey('raw', masterKey, kek, {
    name: 'AES-GCM',
    iv: toArrayBuffer(iv),
  });
  return `${ENC_PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(wrapped))}`;
}

export async function unwrapMasterKeyWithPin(
  wrappedMasterKey: string,
  pin: string,
  saltBase64: string
): Promise<CryptoKey> {
  const parsed = parseEncryptedEnvelope(wrappedMasterKey);
  if (!parsed) {
    throw new Error('Invalid wrapped master key format');
  }
  const kek = await deriveKeyFromPin(pin, saltBase64);
  return crypto.subtle.unwrapKey(
    'raw',
    toArrayBuffer(parsed.ciphertext),
    kek,
    { name: 'AES-GCM', iv: toArrayBuffer(parsed.iv) },
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

const BIOMETRIC_HKDF_INFO = 'AMAN RAYAN BIOMETRIC MASTER KEY WRAP v1';

function copyPrfInputBytes(prfOutput: ArrayBuffer | Uint8Array): Uint8Array {
  const view = prfOutput instanceof Uint8Array ? prfOutput : new Uint8Array(prfOutput);
  if (view.byteLength < 16) {
    throw new Error('بيانات PRF غير كافية لاشتقاق مفتاح الربط');
  }
  return new Uint8Array(view);
}

async function deriveBiometricWrappingKey(
  prfBytes: Uint8Array,
  hkdfSaltBase64: string
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(prfBytes),
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );
  const saltBytes = fromBase64(hkdfSaltBase64);
  const infoBytes = new TextEncoder().encode(BIOMETRIC_HKDF_INFO);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(saltBytes),
      info: toArrayBuffer(infoBytes),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

export async function wrapMasterKeyWithBiometricPrf(
  masterKey: CryptoKey,
  prfOutput: ArrayBuffer | Uint8Array,
  hkdfSaltBase64: string
): Promise<string> {
  const prfBytes = copyPrfInputBytes(prfOutput);
  try {
    const wrappingKey = await deriveBiometricWrappingKey(prfBytes, hkdfSaltBase64);
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const wrapped = await crypto.subtle.wrapKey('raw', masterKey, wrappingKey, {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
    });
    return `${ENC_PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(wrapped))}`;
  } finally {
    prfBytes.fill(0);
  }
}

export async function unwrapMasterKeyWithBiometricPrf(
  wrappedMasterKey: string,
  prfOutput: ArrayBuffer | Uint8Array,
  hkdfSaltBase64: string
): Promise<CryptoKey> {
  const parsed = parseEncryptedEnvelope(wrappedMasterKey);
  if (!parsed) {
    throw new Error('صيغة مغلف المفتاح البيومتري غير صالحة');
  }
  const prfBytes = copyPrfInputBytes(prfOutput);
  try {
    const wrappingKey = await deriveBiometricWrappingKey(prfBytes, hkdfSaltBase64);
    return await crypto.subtle.unwrapKey(
      'raw',
      toArrayBuffer(parsed.ciphertext),
      wrappingKey,
      { name: 'AES-GCM', iv: toArrayBuffer(parsed.iv) },
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  } finally {
    prfBytes.fill(0);
  }
}

function parseEncryptedEnvelope(value: string): { iv: Uint8Array; ciphertext: Uint8Array } | null {
  if (!value || !value.startsWith(ENC_PREFIX)) return null;
  const parts = value.slice(ENC_PREFIX.length).split(':');
  if (parts.length !== 2) return null;
  try {
    return {
      iv: fromBase64(parts[0]),
      ciphertext: fromBase64(parts[1]),
    };
  } catch {
    return null;
  }
}

export async function encryptSecretText(masterKey: CryptoKey, plaintext: string): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    masterKey,
    encoded
  );
  return `${ENC_PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(encrypted))}`;
}

export async function decryptSecretText(masterKey: CryptoKey, encoded: string): Promise<string> {
  if (!encoded) return '';
  const parsed = parseEncryptedEnvelope(encoded);
  if (!parsed) return '';
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(parsed.iv) },
      masterKey,
      toArrayBuffer(parsed.ciphertext)
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return '';
  }
}

interface SecretsBundle {
  apiKeys: SecretEntry[];
  tokens: SecretEntry[];
  secretKeys: SecretEntry[];
  licenseKeys: SecretEntry[];
  certificates: SecretEntry[];
}

export async function encryptVaultItemInput(
  masterKey: CryptoKey,
  input: VaultItemInput
): Promise<EncryptedVaultItemInput> {
  const encryptedPassword = input.password
    ? await encryptSecretText(masterKey, input.password)
    : undefined;

  const encryptedNotes = input.notes
    ? await encryptSecretText(masterKey, input.notes)
    : undefined;

  const bundle: SecretsBundle = {
    apiKeys: normalizeSecretEntries(input.apiKeys),
    tokens: normalizeSecretEntries(input.tokens),
    secretKeys: normalizeSecretEntries(input.secretKeys),
    licenseKeys: normalizeSecretEntries(input.licenseKeys),
    certificates: normalizeSecretEntries(input.certificates),
  };

  const encryptedSecretsPayload = await encryptSecretText(masterKey, JSON.stringify(bundle));

  return {
    title: safeString(input.title).trim() || 'عنصر بدون عنوان',
    username: safeString(input.username).trim() || undefined,
    email: safeString(input.email).trim() || undefined,
    encryptedPassword,
    urls: safeArray<string>(input.urls).map((u) => safeString(u).trim()).filter(Boolean),
    encryptedNotes,
    categoryId: safeString(input.categoryId).trim() || undefined,
    isFavorite: Boolean(input.isFavorite),
    encryptedSecretsPayload,
  };
}

export async function decryptVaultItem(
  masterKey: CryptoKey,
  raw: EncryptedVaultItem
): Promise<VaultItem> {
  const password = raw.encryptedPassword
    ? await decryptSecretText(masterKey, raw.encryptedPassword)
    : undefined;

  const notes = raw.encryptedNotes
    ? await decryptSecretText(masterKey, raw.encryptedNotes)
    : undefined;

  let bundle: SecretsBundle = {
    apiKeys: [],
    tokens: [],
    secretKeys: [],
    licenseKeys: [],
    certificates: [],
  };

  if (raw.encryptedSecretsPayload) {
    const json = await decryptSecretText(masterKey, raw.encryptedSecretsPayload);
    if (json) {
      try {
        const parsed = JSON.parse(json) as Partial<SecretsBundle>;
        bundle = {
          apiKeys: normalizeSecretEntries(parsed.apiKeys),
          tokens: normalizeSecretEntries(parsed.tokens),
          secretKeys: normalizeSecretEntries(parsed.secretKeys),
          licenseKeys: normalizeSecretEntries(parsed.licenseKeys),
          certificates: normalizeSecretEntries(parsed.certificates),
        };
      } catch {
        // Malformed secrets payload should never crash the interface
      }
    }
  }

  return {
    id: safeString(raw.id),
    title: safeString(raw.title) || 'عنصر بدون عنوان',
    username: safeString(raw.username) || undefined,
    email: safeString(raw.email) || undefined,
    password: password || undefined,
    urls: safeArray<string>(raw.urls).map((u) => safeString(u)).filter(Boolean),
    notes: notes || undefined,
    categoryId: safeString(raw.categoryId) || undefined,
    isFavorite: Boolean(raw.isFavorite),
    apiKeys: bundle.apiKeys,
    tokens: bundle.tokens,
    secretKeys: bundle.secretKeys,
    licenseKeys: bundle.licenseKeys,
    certificates: bundle.certificates,
    createdAt: safeString(raw.createdAt) || new Date().toISOString(),
    updatedAt: safeString(raw.updatedAt) || new Date().toISOString(),
  };
}

export async function createEncryptedBackupEnvelope(
  data: DecryptedBackupData,
  backupPassword: string
): Promise<BackupEnvelope> {
  const salt = generateSaltBase64(16);
  const key = await deriveKeyFromPin(backupPassword, salt, 100_000);
  const payload = await encryptSecretText(key, JSON.stringify(data));

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    app: BACKUP_APP_ID,
    createdAt: new Date().toISOString(),
    salt,
    payload,
    designer: APP_SIGNATURE,
  };
}

export function validateBackupEnvelopeFormat(raw: unknown): raw is BackupEnvelope {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  return (
    obj.format === BACKUP_FORMAT &&
    typeof obj.version === 'string' &&
    typeof obj.salt === 'string' &&
    obj.salt.length > 0 &&
    typeof obj.payload === 'string' &&
    obj.payload.startsWith(ENC_PREFIX)
  );
}

export async function decryptBackupEnvelope(
  envelope: BackupEnvelope,
  backupPassword: string
): Promise<DecryptedBackupData> {
  const key = await deriveKeyFromPin(backupPassword, envelope.salt, 100_000);
  const json = await decryptSecretText(key, envelope.payload);
  if (!json) {
    throw new Error('تعذر فك تشفير النسخة الاحتياطية: كلمة المرور غير صحيحة أو الملف تالف');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('بنية النسخة الاحتياطية غير صالحة');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('محتوى النسخة الاحتياطية غير صالح');
  }

  const data = parsed as Record<string, unknown>;
  if (!Array.isArray(data.items) || !Array.isArray(data.categories)) {
    throw new Error('بيانات النسخة الاحتياطية ناقصة أو غير صالحة');
  }

  return {
    exportedAt: safeString(data.exportedAt) || envelope.createdAt,
    categories: data.categories,
    items: data.items,
    settings:
      data.settings && typeof data.settings === 'object'
        ? (data.settings as DecryptedBackupData['settings'])
        : undefined,
  };
}
