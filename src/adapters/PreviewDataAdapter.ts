/**
 * PREVIEW ONLY — Browser-local IndexedDB persistence for Google AI Studio interactive preview.
 * This adapter must NEVER be used in production mode or replace SQL persistence.
 */

import { computeLocalPinVerifier, encryptVaultItemInput } from '../services/crypto';
import type {
  AppSettings,
  AuditAction,
  AuditEvent,
  Category,
  CategoryInput,
  EncryptedVaultItem,
  EncryptedVaultItemInput,
  VaultItemInput,
  VaultSnapshot,
} from '../types/aman';
import { safeArray, safeString } from '../utils/normalize';
import type {
  AmanDataAdapter,
  AuthStatusResponse,
  BatchImportRequest,
  BatchImportResponse,
  UnlockResponse,
} from './AmanDataAdapter';

const DB_NAME = 'aman_preview_vault_v2';
const DB_VERSION = 1;

interface PreviewOwnerSecurity {
  id: 1;
  pinSalt: string;
  pinVerifier: string;
  wrappedMasterKey: string;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  autoLockMinutes: 5,
  clipboardClearSeconds: 20,
  mechanicalSoundsEnabled: true,
  mechanicalSoundsVolume: 45,
};

function openPreviewDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('owner_security')) {
        db.createObjectStore('owner_security', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('vault_items')) {
        db.createObjectStore('vault_items', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('audit_events')) {
        db.createObjectStore('audit_events', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('app_settings')) {
        db.createObjectStore('app_settings', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('فشل فتح قاعدة المعاينة المحلية'));
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbDelete(db: IDBDatabase, store: string, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbClearAll(db: IDBDatabase, stores: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    for (const s of stores) {
      tx.objectStore(s).clear();
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export class PreviewDataAdapter implements AmanDataAdapter {
  private sessionUnlocked = false;

  private async appendAudit(db: IDBDatabase, action: AuditAction, summary: string): Promise<void> {
    const event: AuditEvent = {
      id: crypto.randomUUID(),
      action,
      summary,
      createdAt: new Date().toISOString(),
    };
    await idbPut(db, 'audit_events', event);
  }

  async getAuthStatus(): Promise<AuthStatusResponse> {
    const db = await openPreviewDb();
    try {
      const owner = await idbGet<PreviewOwnerSecurity>(db, 'owner_security', 1);
      return {
        initialized: Boolean(owner),
        unlocked: Boolean(owner) && this.sessionUnlocked,
      };
    } finally {
      db.close();
    }
  }

  async setupOwner(
    pin: string,
    pinSalt: string,
    wrappedMasterKey: string
  ): Promise<{ csrfToken?: string }> {
    if (!/^\d{6}$/.test(pin)) {
      throw new Error('يجب أن يتكون رمز الأمان من 6 أرقام');
    }
    const db = await openPreviewDb();
    try {
      const existing = await idbGet<PreviewOwnerSecurity>(db, 'owner_security', 1);
      if (existing) {
        throw new Error('تم تهيئة المالك مسبقاً ولا يمكن إعادة الإنشاء');
      }
      const pinVerifier = await computeLocalPinVerifier(pin, pinSalt);
      const now = new Date().toISOString();
      const record: PreviewOwnerSecurity = {
        id: 1,
        pinSalt,
        pinVerifier,
        wrappedMasterKey,
        createdAt: now,
        updatedAt: now,
      };
      await idbPut(db, 'owner_security', record);
      await idbPut(db, 'app_settings', { id: 1, ...DEFAULT_SETTINGS });
      await this.appendAudit(db, 'pin_changed', 'تهيئة رمز أمان الخاص بالمالك (المعاينة)');
      this.sessionUnlocked = false;
      return {};
    } finally {
      db.close();
    }
  }

  async unlock(pin: string): Promise<UnlockResponse> {
    const db = await openPreviewDb();
    try {
      const owner = await idbGet<PreviewOwnerSecurity>(db, 'owner_security', 1);
      if (!owner) {
        throw new Error('لم يتم تهيئة الخزنة بعد');
      }
      const computed = await computeLocalPinVerifier(pin, owner.pinSalt);
      if (computed !== owner.pinVerifier) {
        await this.appendAudit(db, 'login_failed', 'محاولة إدخال رمز أمان غير صحيح');
        throw new Error('رمز أمان غير صحيح');
      }
      this.sessionUnlocked = true;
      await this.appendAudit(db, 'login_success', 'تم فتح الخزنة بنجاح');
      return {
        pinSalt: owner.pinSalt,
        wrappedMasterKey: owner.wrappedMasterKey,
      };
    } finally {
      db.close();
    }
  }

  async lock(): Promise<void> {
    this.sessionUnlocked = false;
    const db = await openPreviewDb();
    try {
      await this.appendAudit(db, 'lock', 'تم قفل الخزنة');
    } finally {
      db.close();
    }
  }

  async logout(): Promise<void> {
    this.sessionUnlocked = false;
    const db = await openPreviewDb();
    try {
      await this.appendAudit(db, 'logout', 'تم تسجيل الخروج من الجلسة');
    } finally {
      db.close();
    }
  }

  async changePin(
    currentPin: string,
    newPin: string,
    newPinSalt: string,
    newWrappedMasterKey: string
  ): Promise<void> {
    if (!/^\d{6}$/.test(newPin)) {
      throw new Error('يجب أن يتكون رمز الأمان الجديد من 6 أرقام');
    }
    const db = await openPreviewDb();
    try {
      const owner = await idbGet<PreviewOwnerSecurity>(db, 'owner_security', 1);
      if (!owner) {
        throw new Error('لم يتم تهيئة المالك');
      }
      const currentComputed = await computeLocalPinVerifier(currentPin, owner.pinSalt);
      if (currentComputed !== owner.pinVerifier) {
        await this.appendAudit(db, 'login_failed', 'فشل التحقق عند محاولة تغيير رمز الأمان');
        throw new Error('رمز الأمان الحالي غير صحيح');
      }
      const newVerifier = await computeLocalPinVerifier(newPin, newPinSalt);
      await idbPut(db, 'owner_security', {
        ...owner,
        pinSalt: newPinSalt,
        pinVerifier: newVerifier,
        wrappedMasterKey: newWrappedMasterKey,
        updatedAt: new Date().toISOString(),
      });
      await this.appendAudit(db, 'pin_changed', 'تم تحديث رمز أمان بنجاح');
    } finally {
      db.close();
    }
  }

  async getVault(): Promise<VaultSnapshot> {
    if (!this.sessionUnlocked) {
      throw new Error('الخزنة مقفلة');
    }
    const db = await openPreviewDb();
    try {
      const [items, categories, settingsRow] = await Promise.all([
        idbGetAll<EncryptedVaultItem>(db, 'vault_items'),
        idbGetAll<Category>(db, 'categories'),
        idbGet<AppSettings & { id: number }>(db, 'app_settings', 1),
      ]);
      const settings: AppSettings = settingsRow
        ? {
            autoLockMinutes: Number(settingsRow.autoLockMinutes) || DEFAULT_SETTINGS.autoLockMinutes,
            clipboardClearSeconds:
              Number(settingsRow.clipboardClearSeconds) || DEFAULT_SETTINGS.clipboardClearSeconds,
            mechanicalSoundsEnabled:
              typeof settingsRow.mechanicalSoundsEnabled === 'boolean'
                ? settingsRow.mechanicalSoundsEnabled
                : true,
            mechanicalSoundsVolume:
              typeof settingsRow.mechanicalSoundsVolume === 'number'
                ? Math.max(0, Math.min(100, Math.round(settingsRow.mechanicalSoundsVolume)))
                : 45,
          }
        : DEFAULT_SETTINGS;
      return {
        items: safeArray<EncryptedVaultItem>(items),
        categories: safeArray<Category>(categories),
        settings,
      };
    } finally {
      db.close();
    }
  }

  async createItem(input: EncryptedVaultItemInput): Promise<EncryptedVaultItem> {
    if (!this.sessionUnlocked) {
      throw new Error('الخزنة مقفلة');
    }
    const db = await openPreviewDb();
    try {
      const now = new Date().toISOString();
      const item: EncryptedVaultItem = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      await idbPut(db, 'vault_items', item);
      await this.appendAudit(db, 'create', `إضافة عنصر: ${safeString(item.title)}`);
      return item;
    } finally {
      db.close();
    }
  }

  async updateItem(id: string, input: EncryptedVaultItemInput): Promise<EncryptedVaultItem> {
    if (!this.sessionUnlocked) {
      throw new Error('الخزنة مقفلة');
    }
    const db = await openPreviewDb();
    try {
      const existing = await idbGet<EncryptedVaultItem>(db, 'vault_items', id);
      if (!existing) {
        throw new Error('العنصر غير موجود');
      }
      const updated: EncryptedVaultItem = {
        ...input,
        id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      await idbPut(db, 'vault_items', updated);
      await this.appendAudit(db, 'update', `تحديث عنصر: ${safeString(updated.title)}`);
      return updated;
    } finally {
      db.close();
    }
  }

  async deleteItem(id: string): Promise<void> {
    if (!this.sessionUnlocked) {
      throw new Error('الخزنة مقفلة');
    }
    const db = await openPreviewDb();
    try {
      const existing = await idbGet<EncryptedVaultItem>(db, 'vault_items', id);
      await idbDelete(db, 'vault_items', id);
      await this.appendAudit(
        db,
        'delete',
        `حذف عنصر: ${safeString(existing?.title || id)}`
      );
    } finally {
      db.close();
    }
  }

  async getCategories(): Promise<Category[]> {
    if (!this.sessionUnlocked) {
      throw new Error('الخزنة مقفلة');
    }
    const db = await openPreviewDb();
    try {
      return safeArray<Category>(await idbGetAll<Category>(db, 'categories'));
    } finally {
      db.close();
    }
  }

  async saveCategory(category: CategoryInput): Promise<Category> {
    if (!this.sessionUnlocked) {
      throw new Error('الخزنة مقفلة');
    }
    const db = await openPreviewDb();
    try {
      const name = safeString(category.name).trim();
      if (!name) throw new Error('اسم التصنيف مطلوب');
      const saved: Category = {
        id: category.id || crypto.randomUUID(),
        name,
        createdAt: new Date().toISOString(),
      };
      await idbPut(db, 'categories', saved);
      return saved;
    } finally {
      db.close();
    }
  }

  async deleteCategory(id: string): Promise<void> {
    if (!this.sessionUnlocked) {
      throw new Error('الخزنة مقفلة');
    }
    const db = await openPreviewDb();
    try {
      await idbDelete(db, 'categories', id);
      const allItems = await idbGetAll<EncryptedVaultItem>(db, 'vault_items');
      for (const item of allItems) {
        if (item.categoryId === id) {
          await idbPut(db, 'vault_items', { ...item, categoryId: undefined });
        }
      }
    } finally {
      db.close();
    }
  }

  async batchImport(payload: BatchImportRequest): Promise<BatchImportResponse> {
    if (!this.sessionUnlocked) {
      throw new Error('الخزنة مقفلة');
    }
    const db = await openPreviewDb();
    try {
      const tx = db.transaction(['vault_items', 'categories'], 'readwrite');
      const itemsStore = tx.objectStore('vault_items');
      const catStore = tx.objectStore('categories');

      if (payload.replaceExisting) {
        itemsStore.clear();
        catStore.clear();
      }

      const now = new Date().toISOString();
      const savedCategories: Category[] = [];
      for (const cat of payload.categories) {
        const record: Category = {
          id: cat.id || crypto.randomUUID(),
          name: safeString(cat.name).trim() || 'عام',
          createdAt: now,
        };
        catStore.put(record);
        savedCategories.push(record);
      }

      const savedItems: EncryptedVaultItem[] = [];
      for (const itemInput of payload.items) {
        const record: EncryptedVaultItem = {
          ...itemInput,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        };
        itemsStore.put(record);
        savedItems.push(record);
      }

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('فشلت عملية الاستيراد الذرية'));
        tx.onabort = () => reject(tx.error ?? new Error('تم التراجع عن الاستيراد'));
      });

      await this.appendAudit(
        db,
        payload.source === 'aman_restore' ? 'restore' : 'excel_import',
        payload.source === 'aman_restore'
          ? `استعادة نسخة مشفرة (${savedItems.length} عنصر)`
          : `استيراد من Excel (${savedItems.length} عنصر)`
      );

      const [allCats, allItems] = await Promise.all([
        idbGetAll<Category>(db, 'categories'),
        idbGetAll<EncryptedVaultItem>(db, 'vault_items'),
      ]);

      return {
        importedCount: savedItems.length,
        categories: allCats,
        items: allItems,
      };
    } finally {
      db.close();
    }
  }

  async getAuditEvents(): Promise<AuditEvent[]> {
    if (!this.sessionUnlocked) {
      throw new Error('الخزنة مقفلة');
    }
    const db = await openPreviewDb();
    try {
      const events = await idbGetAll<AuditEvent>(db, 'audit_events');
      return events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } finally {
      db.close();
    }
  }

  async recordAuditEvent(action: AuditAction, summary: string): Promise<void> {
    const db = await openPreviewDb();
    try {
      await this.appendAudit(db, action, summary);
    } finally {
      db.close();
    }
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    if (!this.sessionUnlocked) {
      throw new Error('الخزنة مقفلة');
    }
    const db = await openPreviewDb();
    try {
      const clean: AppSettings = {
        autoLockMinutes: Math.max(1, Math.min(120, Number(settings.autoLockMinutes) || 5)),
        clipboardClearSeconds: Math.max(5, Math.min(300, Number(settings.clipboardClearSeconds) || 20)),
        mechanicalSoundsEnabled:
          typeof settings.mechanicalSoundsEnabled === 'boolean'
            ? settings.mechanicalSoundsEnabled
            : true,
        mechanicalSoundsVolume:
          typeof settings.mechanicalSoundsVolume === 'number' &&
          Number.isFinite(settings.mechanicalSoundsVolume)
            ? Math.max(0, Math.min(100, Math.round(settings.mechanicalSoundsVolume)))
            : 45,
      };
      await idbPut(db, 'app_settings', { id: 1, ...clean });
      return clean;
    } finally {
      db.close();
    }
  }

  async wipeVault(pin: string): Promise<void> {
    const db = await openPreviewDb();
    try {
      const owner = await idbGet<PreviewOwnerSecurity>(db, 'owner_security', 1);
      if (!owner) {
        throw new Error('الخزنة غير مهيأة');
      }
      const computed = await computeLocalPinVerifier(pin, owner.pinSalt);
      if (computed !== owner.pinVerifier) {
        await this.appendAudit(db, 'login_failed', 'فشل التحقق عند طلب مسح الخزنة');
        throw new Error('رمز أمان غير صحيح');
      }
      await idbClearAll(db, [
        'owner_security',
        'vault_items',
        'categories',
        'audit_events',
        'app_settings',
      ]);
      this.sessionUnlocked = false;
    } finally {
      db.close();
    }
  }

  /**
   * PREVIEW ONLY: Isolated demo data loader available ONLY in preview mode AFTER unlock.
   * Never exists or executes in production/MySQL mode.
   */
  async loadDemoData(masterKey: CryptoKey): Promise<void> {
    if (!this.sessionUnlocked) {
      throw new Error('يجب فتح الخزنة أولاً');
    }

    const catCloud = await this.saveCategory({ name: 'الحسابات السحابية والخوادم' });
    const catApis = await this.saveCategory({ name: 'مفاتيح API والتكامل' });
    const catLicenses = await this.saveCategory({ name: 'التراخيص والشهادات' });
    const catFinance = await this.saveCategory({ name: 'الحسابات الخاصة والملاحظات' });

    const demoSamples: VaultItemInput[] = [
      {
        title: 'لوحة استضافة Hostinger الإنتاجية',
        username: 'admin_aman',
        email: 'ops@aman-vault.example',
        password: 'Am@n#Host!2026$ServerKey',
        urls: ['https://hpanel.hostinger.com'],
        notes: 'خادم الإنتاج الرئيسي وقاعدة بيانات MariaDB الخاصة بالنظام.',
        categoryId: catCloud.id,
        isFavorite: true,
        apiKeys: [{ id: crypto.randomUUID(), label: 'Deploy API Key', value: 'hst_live_9821a7c4e12f90' }],
        tokens: [{ id: crypto.randomUUID(), label: 'Webhook Token', value: 'whsec_aman_441098bc22' }],
        secretKeys: [],
        licenseKeys: [],
        certificates: [],
      },
      {
        title: 'بوابة الدفع والتوقيع الرقمي',
        username: 'merchant_core',
        email: 'billing@aman-vault.example',
        password: 'P@y#Gate!9912StrongPass',
        urls: ['https://dashboard.example.com'],
        notes: 'مفاتيح البيئة الإنتاجية — يحفظ سرياً ولا يشارك.',
        categoryId: catApis.id,
        isFavorite: true,
        apiKeys: [{ id: crypto.randomUUID(), label: 'Public Key', value: 'pk_live_51AmanSample9012' }],
        tokens: [],
        secretKeys: [{ id: crypto.randomUUID(), label: 'Secret Signing Key', value: 'sk_live_AmanPrivate998123' }],
        licenseKeys: [],
        certificates: [],
      },
      {
        title: 'ترخيص JetBrains & شهادة SSL الداخلية',
        username: 'dev_owner',
        email: 'dev@aman-vault.example',
        password: '',
        urls: ['https://account.jetbrains.com'],
        notes: 'تجديد سنوي في شهر نوفمبر.',
        categoryId: catLicenses.id,
        isFavorite: false,
        apiKeys: [],
        tokens: [],
        secretKeys: [],
        licenseKeys: [{ id: crypto.randomUUID(), label: 'All Products Pack', value: 'JB-2026-AMAN-8841-XQZ9' }],
        certificates: [
          {
            id: crypto.randomUUID(),
            label: 'Internal Root CA Fingerprint',
            value: 'SHA256:9F:4A:2B:C1:88:E4:7D:12:0A:55:B9',
          },
        ],
      },
      {
        title: 'ملاحظات الطوارئ ورموز الاسترداد',
        username: 'owner',
        email: '',
        password: 'Recovery!Master#Vault2026',
        urls: [],
        notes: 'رموز الاسترداد الاحتياطية للمحفظة المشفرة وخادم النسخ الاحتياطي.',
        categoryId: catFinance.id,
        isFavorite: false,
        apiKeys: [],
        tokens: [],
        secretKeys: [{ id: crypto.randomUUID(), label: 'Recovery Seed Backup', value: 'AMAN-REC-9910-4421-8837' }],
        licenseKeys: [],
        certificates: [],
      },
    ];

    const encryptedItems: EncryptedVaultItemInput[] = [];
    for (const sample of demoSamples) {
      encryptedItems.push(await encryptVaultItemInput(masterKey, sample));
    }

    for (const encItem of encryptedItems) {
      await this.createItem(encItem);
    }
  }
}
