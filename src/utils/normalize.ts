import type { Category, SecretEntry, VaultItem } from '../types/aman';

export function safeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

export function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function normalizeArabic(value: string): string {
  return safeString(value)
    .normalize('NFKD')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .toLowerCase()
    .trim();
}

export function normalizeUrl(raw: unknown): string | null {
  const value = safeString(raw).replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!value) return null;

  const lowered = value.toLowerCase();
  if (/^(javascript|vbscript|data|file|blob|about):/i.test(lowered)) {
    return null;
  }

  // Reject any explicit scheme other than http:// or https:// (e.g., ftp://, mailto:, ssh:, custom:)
  const hasExplicitScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
  const looksLikeHostPort = /^[^/:?#]+:\d+(\/|$|\?|#)/.test(value);

  if (hasExplicitScheme && !looksLikeHostPort && !/^https?:\/\//i.test(value)) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function openSafeExternalUrl(raw: unknown): { ok: boolean; url?: string } {
  const safeUrl = normalizeUrl(raw);
  if (!safeUrl) {
    return { ok: false };
  }
  window.open(safeUrl, '_blank', 'noopener,noreferrer');
  return { ok: true, url: safeUrl };
}

export function normalizeSecretEntries(value: unknown): SecretEntry[] {
  return safeArray<Record<string, unknown>>(value)
    .map((entry) => ({
      id: safeString(entry?.id) || crypto.randomUUID(),
      label: safeString(entry?.label).trim(),
      value: safeString(entry?.value),
    }))
    .filter((entry) => entry.label.length > 0 || entry.value.length > 0);
}

export function normalizeCategory(raw: unknown): Category | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = safeString(obj.id).trim();
  const name = safeString(obj.name).trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    createdAt: safeString(obj.createdAt) || new Date().toISOString(),
  };
}

export function normalizeVaultItem(raw: unknown): VaultItem {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const urls = safeArray<unknown>(obj.urls)
    .map((u) => safeString(u).trim())
    .filter(Boolean);

  return {
    id: safeString(obj.id) || crypto.randomUUID(),
    title: safeString(obj.title).trim() || 'عنصر بدون عنوان',
    username: safeString(obj.username).trim() || undefined,
    email: safeString(obj.email).trim() || undefined,
    password: safeString(obj.password) || undefined,
    urls,
    notes: safeString(obj.notes) || undefined,
    categoryId: safeString(obj.categoryId).trim() || undefined,
    isFavorite: Boolean(obj.isFavorite),
    apiKeys: normalizeSecretEntries(obj.apiKeys),
    tokens: normalizeSecretEntries(obj.tokens),
    secretKeys: normalizeSecretEntries(obj.secretKeys),
    licenseKeys: normalizeSecretEntries(obj.licenseKeys),
    certificates: normalizeSecretEntries(obj.certificates),
    createdAt: safeString(obj.createdAt) || new Date().toISOString(),
    updatedAt: safeString(obj.updatedAt) || new Date().toISOString(),
  };
}

export interface PasswordGeneratorOptions {
  length?: number;
  uppercase?: boolean;
  lowercase?: boolean;
  numbers?: boolean;
  symbols?: boolean;
}

export function generateSecurePassword(options: PasswordGeneratorOptions | number = 20): string {
  const opts: Required<PasswordGeneratorOptions> =
    typeof options === 'number'
      ? {
          length: options,
          uppercase: true,
          lowercase: true,
          numbers: true,
          symbols: true,
        }
      : {
          length: Math.max(8, Math.min(64, options.length ?? 20)),
          uppercase: options.uppercase ?? true,
          lowercase: options.lowercase ?? true,
          numbers: options.numbers ?? true,
          symbols: options.symbols ?? true,
        };

  let alphabet = '';
  if (opts.uppercase) alphabet += 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  if (opts.lowercase) alphabet += 'abcdefghijkmnopqrstuvwxyz';
  if (opts.numbers) alphabet += '23456789';
  if (opts.symbols) alphabet += '!@#$%^&*_-+=';

  if (!alphabet) {
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';
  }

  const random = new Uint32Array(opts.length);
  crypto.getRandomValues(random);
  return Array.from(random)
    .map((n) => alphabet[n % alphabet.length])
    .join('');
}

export function formatArabicDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
