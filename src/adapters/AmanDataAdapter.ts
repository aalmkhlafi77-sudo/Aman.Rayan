import type {
  AppSettings,
  AuditAction,
  AuditEvent,
  Category,
  CategoryInput,
  EncryptedVaultItem,
  EncryptedVaultItemInput,
  VaultSnapshot,
} from '../types/aman';

export interface AuthStatusResponse {
  initialized: boolean;
  unlocked: boolean;
  csrfToken?: string;
}

export interface UnlockResponse {
  pinSalt: string;
  wrappedMasterKey: string;
  csrfToken?: string;
}

export interface BatchImportRequest {
  items: EncryptedVaultItemInput[];
  categories: CategoryInput[];
  replaceExisting?: boolean;
  source: 'excel' | 'aman_restore';
}

export interface BatchImportResponse {
  importedCount: number;
  categories: Category[];
  items: EncryptedVaultItem[];
}

export interface AmanDataAdapter {
  getAuthStatus(): Promise<AuthStatusResponse>;
  setupOwner(
    pin: string,
    pinSalt: string,
    wrappedMasterKey: string,
    bootstrapToken?: string
  ): Promise<{ csrfToken?: string }>;
  unlock(pin: string): Promise<UnlockResponse>;
  lock(): Promise<void>;
  logout(): Promise<void>;
  changePin(
    currentPin: string,
    newPin: string,
    newPinSalt: string,
    newWrappedMasterKey: string
  ): Promise<void>;

  getVault(): Promise<VaultSnapshot>;
  createItem(item: EncryptedVaultItemInput): Promise<EncryptedVaultItem>;
  updateItem(id: string, item: EncryptedVaultItemInput): Promise<EncryptedVaultItem>;
  deleteItem(id: string): Promise<void>;

  getCategories(): Promise<Category[]>;
  saveCategory(category: CategoryInput): Promise<Category>;
  deleteCategory(id: string): Promise<void>;

  batchImport(payload: BatchImportRequest): Promise<BatchImportResponse>;

  getAuditEvents(): Promise<AuditEvent[]>;
  recordAuditEvent(action: AuditAction, summary: string): Promise<void>;

  saveSettings(settings: AppSettings): Promise<AppSettings>;
  wipeVault(pin: string): Promise<void>;
}
