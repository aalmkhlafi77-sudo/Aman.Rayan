export const APP_NAME = 'Aman Rayan';
export const APP_NAME_AR = 'أمان ريان';
export const APP_DESCRIPTION_AR = 'خزنة رقمية آمنة لحفظ كلمات المرور والمفاتيح والبيانات الحساسة';
export const APP_VERSION = '2.0.1';
export const APP_DESIGNER = 'عبدالله المخلافي 2026';
export const APP_SIGNATURE = 'تصميم : عبدالله المخلافي 2026';

// Backup envelope format identifiers — independent of APP_VERSION for strict backward compatibility
export const BACKUP_FORMAT = 'AMAN_ENCRYPTED_VAULT' as const;
export const BACKUP_FORMAT_VERSION = '2.0.0' as const;
export const BACKUP_APP_ID = 'AMAN Windows Desktop Vault' as const;

export type AppMode = 'preview' | 'production';

/**
 * Strict mode resolution:
 * - Accepts only explicit "preview" or "production".
 * - Allows implicit "preview" default ONLY when Vite DEV server is running AND VITE_APP_MODE is unset.
 * - Production builds MUST fail clearly if VITE_APP_MODE is missing, misspelled, or invalid.
 */
export function resolveAppMode(rawMode: unknown, isDev: boolean): AppMode {
  if (rawMode === 'preview' || rawMode === 'production') {
    return rawMode;
  }

  if ((rawMode === undefined || rawMode === '') && isDev === true) {
    return 'preview';
  }

  throw new Error(
    `Invalid VITE_APP_MODE configuration ("${String(rawMode ?? '')}"). ` +
      'Production builds require VITE_APP_MODE="production" or explicit "preview". Refusing unsafe fallback to PreviewDataAdapter.'
  );
}

const hasViteEnv = typeof import.meta !== 'undefined' && import.meta.env !== undefined;

export const APP_MODE: AppMode = resolveAppMode(
  hasViteEnv
    ? import.meta.env.VITE_APP_MODE
    : typeof process !== 'undefined'
      ? process.env?.VITE_APP_MODE
      : undefined,
  hasViteEnv
    ? Boolean(import.meta.env.DEV)
    : typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production'
);

export const IS_PREVIEW_MODE = APP_MODE === 'preview';
