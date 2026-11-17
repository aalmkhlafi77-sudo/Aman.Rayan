export const APP_NAME = 'AMAN';
export const APP_NAME_AR = 'أمان';
export const APP_DESCRIPTION_AR = 'خزنة رقمية آمنة لحفظ كلمات المرور والمفاتيح والبيانات الحساسة';
export const APP_VERSION = '2.0.1';
export const APP_DESIGNER = 'عبدالله المخلافي 2026';
export const APP_SIGNATURE = 'تصميم : عبدالله المخلافي 2026';

// Backup envelope format identifiers — independent of APP_VERSION for strict backward compatibility
export const BACKUP_FORMAT = 'AMAN_ENCRYPTED_VAULT' as const;
export const BACKUP_FORMAT_VERSION = '2.0.0' as const;
export const BACKUP_APP_ID = 'AMAN Windows Desktop Vault' as const;

export type AppMode = 'preview' | 'production';

export const APP_MODE: AppMode =
  import.meta.env.VITE_APP_MODE === 'production' ? 'production' : 'preview';

export const IS_PREVIEW_MODE = APP_MODE === 'preview';
