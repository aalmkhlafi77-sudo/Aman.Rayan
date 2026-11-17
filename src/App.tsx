import { useCallback, useEffect, useRef, useState } from 'react';
import { dataAdapter } from './adapters';
import type { BatchImportRequest } from './adapters/AmanDataAdapter';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastContainer } from './components/ToastContainer';
import { PinLockScreen } from './features/auth/PinLockScreen';
import { VaultDashboard } from './features/vault/VaultDashboard';
import {
  decryptVaultItem,
  encryptVaultItemInput,
  generateMasterVaultKey,
  generateSaltBase64,
  unwrapMasterKeyWithPin,
  wrapMasterKeyWithPin,
} from './services/crypto';
import type {
  AppSettings,
  AuditEvent,
  Category,
  LockState,
  ToastMessage,
  VaultItem,
  VaultItemInput,
} from './types/aman';
import { normalizeCategory } from './utils/normalize';

const DEFAULT_SETTINGS: AppSettings = {
  autoLockMinutes: 5,
  clipboardClearSeconds: 20,
};

function AmanApplication() {
  const [lockState, setLockState] = useState<LockState>('loading');
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pendingUnlockDataRef = useRef<{
    key: CryptoKey;
    items: VaultItem[];
    categories: Category[];
    settings: AppSettings;
  } | null>(null);

  const notify = useCallback(
    (type: ToastMessage['type'], title: string, description?: string) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev.slice(-3), { id, type, title, description }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearSensitiveMemory = useCallback(() => {
    pendingUnlockDataRef.current = null;
    setMasterKey(null);
    setItems([]);
    setCategories([]);
    setAuditEvents([]);
  }, []);

  // Initial auth bootstrap
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const status = await dataAdapter.getAuthStatus();
        if (!active) return;
        setLockState(status.initialized ? 'locked' : 'setup');
      } catch (err) {
        if (!active) return;
        setLockState('locked');
        notify(
          'error',
          'تعذر الاتصال بالخادم',
          err instanceof Error ? err.message : undefined
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [notify]);

  const decryptAndLoadVault = useCallback(async (key: CryptoKey) => {
    const snapshot = await dataAdapter.getVault();
    const decryptedItems: VaultItem[] = [];
    for (const encItem of snapshot.items) {
      decryptedItems.push(await decryptVaultItem(key, encItem));
    }
    const safeCats = snapshot.categories
      .map((c) => normalizeCategory(c))
      .filter((c): c is Category => c !== null);

    return {
      items: decryptedItems,
      categories: safeCats,
      settings: snapshot.settings || DEFAULT_SETTINGS,
    };
  }, []);

  const handleSetupComplete = async (pin: string, bootstrapToken?: string) => {
    const pinSalt = generateSaltBase64(16);
    const freshMasterKey = await generateMasterVaultKey();
    const wrappedMasterKey = await wrapMasterKeyWithPin(freshMasterKey, pin, pinSalt);

    await dataAdapter.setupOwner(pin, pinSalt, wrappedMasterKey, bootstrapToken);
    setLockState('locked');
    notify('success', 'تم إنشاء رمز أمان وتهيئة الخزنة بنجاح', 'أدخل الرمز الآن لفتح الخزنة');
  };

  const handleUnlockAttempt = async (
    pin: string
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const unlockRes = await dataAdapter.unlock(pin);
      const unwrappedKey = await unwrapMasterKeyWithPin(
        unlockRes.wrappedMasterKey,
        pin,
        unlockRes.pinSalt
      );
      const loaded = await decryptAndLoadVault(unwrappedKey);
      pendingUnlockDataRef.current = {
        key: unwrappedKey,
        ...loaded,
      };
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'رمز أمان غير صحيح',
      };
    }
  };

  const handleUnlockAnimationFinished = useCallback(() => {
    const pending = pendingUnlockDataRef.current;
    if (!pending) return;
    setMasterKey(pending.key);
    setItems(pending.items);
    setCategories(pending.categories);
    setSettings(pending.settings);
    pendingUnlockDataRef.current = null;
    setLockState('unlocked');
  }, []);

  const handleLock = useCallback(
    async (isAutoLock = false) => {
      clearSensitiveMemory();
      setLockState('locked');
      try {
        await dataAdapter.lock();
      } catch {
        // Session cleared locally regardless of network state
      }
      notify(
        'info',
        isAutoLock ? 'تم قفل الخزنة تلقائياً لعدم النشاط' : 'تم قفل الخزنة'
      );
    },
    [clearSensitiveMemory, notify]
  );

  const handleLogout = useCallback(async () => {
    clearSensitiveMemory();
    setLockState('locked');
    try {
      await dataAdapter.logout();
    } catch {
      // Ignore network hiccup during logout cleanup
    }
    notify('info', 'تم تسجيل الخروج بأمان');
  }, [clearSensitiveMemory, notify]);

  // Inactivity Auto-Lock Timer (default 5 minutes, configurable)
  useEffect(() => {
    if (lockState !== 'unlocked') return;
    const timeoutMs = Math.max(1, settings.autoLockMinutes) * 60 * 1000;
    let timer = window.setTimeout(() => {
      void handleLock(true);
    }, timeoutMs);

    const resetTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void handleLock(true);
      }, timeoutMs);
    };

    const events: (keyof WindowEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
    ];
    for (const ev of events) {
      window.addEventListener(ev, resetTimer, { passive: true });
    }

    return () => {
      window.clearTimeout(timer);
      for (const ev of events) {
        window.removeEventListener(ev, resetTimer);
      }
    };
  }, [handleLock, lockState, settings.autoLockMinutes]);

  const handleReloadVault = useCallback(async () => {
    if (!masterKey) return;
    const loaded = await decryptAndLoadVault(masterKey);
    setItems(loaded.items);
    setCategories(loaded.categories);
    setSettings(loaded.settings);
  }, [decryptAndLoadVault, masterKey]);

  const handleCreateItem = async (input: VaultItemInput) => {
    if (!masterKey) throw new Error('الخزنة مقفلة');
    const encryptedInput = await encryptVaultItemInput(masterKey, input);
    const createdEncrypted = await dataAdapter.createItem(encryptedInput);
    const decrypted = await decryptVaultItem(masterKey, createdEncrypted);
    setItems((prev) => [decrypted, ...prev]);
  };

  const handleUpdateItem = async (id: string, input: VaultItemInput) => {
    if (!masterKey) throw new Error('الخزنة مقفلة');
    const encryptedInput = await encryptVaultItemInput(masterKey, input);
    const updatedEncrypted = await dataAdapter.updateItem(id, encryptedInput);
    const decrypted = await decryptVaultItem(masterKey, updatedEncrypted);
    setItems((prev) => prev.map((it) => (it.id === id ? decrypted : it)));
  };

  const handleDeleteItem = async (id: string) => {
    await dataAdapter.deleteItem(id);
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleCreateCategory = async (name: string) => {
    const saved = await dataAdapter.saveCategory({ name });
    setCategories((prev) => [...prev, saved]);
  };

  const handleDeleteCategory = async (id: string) => {
    await dataAdapter.deleteCategory(id);
    setCategories((prev) => prev.filter((c) => c.id !== id));
    setItems((prev) =>
      prev.map((it) => (it.categoryId === id ? { ...it, categoryId: undefined } : it))
    );
  };

  const handleBatchImport = async (payload: BatchImportRequest) => {
    if (!masterKey) throw new Error('الخزنة مقفلة');
    const result = await dataAdapter.batchImport(payload);
    const decryptedItems: VaultItem[] = [];
    for (const encItem of result.items) {
      decryptedItems.push(await decryptVaultItem(masterKey, encItem));
    }
    setCategories(
      result.categories
        .map((c) => normalizeCategory(c))
        .filter((c): c is Category => c !== null)
    );
    setItems(decryptedItems);
  };

  const handleRefreshAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const logs = await dataAdapter.getAuditEvents();
      setAuditEvents(logs);
    } catch (err) {
      notify(
        'error',
        'تعذر تحميل سجل التدقيق',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setAuditLoading(false);
    }
  }, [notify]);

  const handleRecordAudit = async (action: 'backup' | 'excel_export', summary: string) => {
    await dataAdapter.recordAuditEvent(action, summary);
  };

  const handleSaveSettings = async (next: AppSettings) => {
    const saved = await dataAdapter.saveSettings(next);
    setSettings(saved);
  };

  const handleChangePin = async (currentPin: string, newPin: string) => {
    if (!masterKey) throw new Error('الخزنة مقفلة');
    const newSalt = generateSaltBase64(16);
    const newWrapped = await wrapMasterKeyWithPin(masterKey, newPin, newSalt);
    await dataAdapter.changePin(currentPin, newPin, newSalt, newWrapped);
  };

  const handleWipeVault = async (pin: string) => {
    await dataAdapter.wipeVault(pin);
    clearSensitiveMemory();
    setSettings(DEFAULT_SETTINGS);
    setLockState('setup');
  };

  return (
    <>
      {lockState === 'loading' ? (
        <div
          dir="rtl"
          className="aman-safe-bg flex min-h-screen items-center justify-center"
        >
          <div className="text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#e5b440]/25 border-t-[#e5b440]" />
            <p className="text-xs font-semibold text-[#93a19f]">جاري تهيئة أمان...</p>
          </div>
        </div>
      ) : lockState === 'unlocked' && masterKey ? (
        <VaultDashboard
          items={items}
          categories={categories}
          settings={settings}
          auditEvents={auditEvents}
          auditLoading={auditLoading}
          masterKey={masterKey}
          onCreateItem={handleCreateItem}
          onUpdateItem={handleUpdateItem}
          onDeleteItem={handleDeleteItem}
          onCreateCategory={handleCreateCategory}
          onDeleteCategory={handleDeleteCategory}
          onBatchImport={handleBatchImport}
          onRecordAudit={handleRecordAudit}
          onRefreshAudit={handleRefreshAudit}
          onSaveSettings={handleSaveSettings}
          onChangePin={handleChangePin}
          onWipeVault={handleWipeVault}
          onReloadVault={handleReloadVault}
          onLock={() => handleLock(false)}
          onLogout={handleLogout}
          onNotify={notify}
        />
      ) : (
        <PinLockScreen
          mode={lockState === 'setup' ? 'setup' : 'locked'}
          onSetupComplete={handleSetupComplete}
          onUnlockAttempt={handleUnlockAttempt}
          onUnlockAnimationFinished={handleUnlockAnimationFinished}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AmanApplication />
    </ErrorBoundary>
  );
}
