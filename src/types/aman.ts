export interface SecretEntry {
  id: string;
  label: string;
  value: string;
}

export interface VaultItem {
  id: string;
  title: string;
  username?: string;
  email?: string;
  password?: string;
  urls: string[];
  notes?: string;
  categoryId?: string;
  isFavorite: boolean;
  apiKeys: SecretEntry[];
  tokens: SecretEntry[];
  secretKeys: SecretEntry[];
  licenseKeys: SecretEntry[];
  certificates: SecretEntry[];
  createdAt: string;
  updatedAt: string;
}

export type VaultItemInput = Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Storage and API wire format.
 * Confidential fields are ALWAYS stored and transmitted as ENC:IV:CIPHERTEXT.
 */
export interface EncryptedVaultItem {
  id: string;
  title: string;
  username?: string;
  email?: string;
  encryptedPassword?: string;
  urls: string[];
  encryptedNotes?: string;
  categoryId?: string;
  isFavorite: boolean;
  encryptedSecretsPayload: string; // ENC:IV:CIPHERTEXT wrapping apiKeys/tokens/secretKeys/licenseKeys/certificates
  createdAt: string;
  updatedAt: string;
}

export type EncryptedVaultItemInput = Omit<EncryptedVaultItem, 'id' | 'createdAt' | 'updatedAt'>;

export interface Category {
  id: string;
  name: string;
  createdAt: string;
}

export interface CategoryInput {
  id?: string;
  name: string;
}

export interface AppSettings {
  autoLockMinutes: number;
  clipboardClearSeconds: number;
  mechanicalSoundsEnabled?: boolean;
  mechanicalSoundsVolume?: number;
}

export type AuditAction =
  | 'login_success'
  | 'login_failed'
  | 'lock'
  | 'logout'
  | 'pin_changed'
  | 'create'
  | 'update'
  | 'delete'
  | 'backup'
  | 'restore'
  | 'excel_export'
  | 'excel_import'
  | 'wipe';

export interface AuditEvent {
  id: string;
  action: AuditAction;
  summary: string;
  createdAt: string;
}

export interface VaultSnapshot {
  items: EncryptedVaultItem[];
  categories: Category[];
  settings: AppSettings;
}

export interface DecryptedBackupData {
  exportedAt: string;
  categories: Category[];
  items: VaultItem[];
  settings?: AppSettings;
}

export interface BackupEnvelope {
  format: 'AMAN_ENCRYPTED_VAULT';
  version: '2.0.0';
  app: 'AMAN Windows Desktop Vault';
  createdAt: string;
  salt: string;
  payload: string;
  designer: 'تصميم : عبدالله المخلافي 2026';
}

export type LockState = 'loading' | 'setup' | 'locked' | 'unlocking' | 'unlocked';
export type ViewMode = 'cards' | 'compact' | 'list';
export type SortMode = 'updated' | 'title' | 'favorite';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
}
