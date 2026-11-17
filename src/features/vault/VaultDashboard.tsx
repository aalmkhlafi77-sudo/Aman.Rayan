import React, { useMemo, useState } from 'react';
import {
  Shield,
  Search,
  Plus,
  Star,
  Lock,
  LogOut,
  LayoutGrid,
  Rows3,
  List,
  Copy,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  Pencil,
  Trash2,
  Files,
  Wand2,
  HardDriveDownload,
  FileSpreadsheet,
  History,
  Settings,
  Menu,
  X,
  Folder,
  FlaskConical,
} from 'lucide-react';
import type {
  AppSettings,
  AuditEvent,
  BiometricCapability,
  BiometricStatus,
  Category,
  SortMode,
  VaultItem,
  VaultItemInput,
  ViewMode,
} from '../../types/aman';
import { APP_NAME, APP_NAME_AR, APP_SIGNATURE, APP_VERSION, IS_PREVIEW_MODE } from '../../version';
import { formatArabicDate, normalizeArabic, openSafeExternalUrl } from '../../utils/normalize';
import type { BatchImportRequest } from '../../adapters/AmanDataAdapter';
import { getPreviewAdapter } from '../../adapters';
import { AmanRayanEmblem } from '../../components/AmanRayanEmblem';
import { VaultItemModal } from './VaultItemModal';
import { VaultItemDetailModal } from './VaultItemDetailModal';
import { PasswordGeneratorView } from '../generator/PasswordGeneratorView';
import { BackupRestoreView } from '../backup/BackupRestoreView';
import { ExcelToolsView } from '../excel/ExcelToolsView';
import { AuditLogView } from '../audit/AuditLogView';
import { SecuritySettingsView } from '../settings/SecuritySettingsView';

type ActiveSection =
  | 'vault'
  | 'favorites'
  | 'generator'
  | 'backup'
  | 'excel'
  | 'audit'
  | 'settings';

interface VaultDashboardProps {
  items: VaultItem[];
  categories: Category[];
  settings: AppSettings;
  auditEvents: AuditEvent[];
  auditLoading: boolean;
  masterKey: CryptoKey;
  biometricStatus: BiometricStatus | null;
  biometricCapability: BiometricCapability | null;
  onCreateItem: (input: VaultItemInput) => Promise<void>;
  onUpdateItem: (id: string, input: VaultItemInput) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onCreateCategory: (name: string) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  onBatchImport: (payload: BatchImportRequest) => Promise<void>;
  onRecordAudit: (action: 'backup' | 'excel_export', summary: string) => Promise<void>;
  onRefreshAudit: () => Promise<void>;
  onSaveSettings: (next: AppSettings) => Promise<void>;
  onChangePin: (currentPin: string, newPin: string) => Promise<void>;
  onEnrollBiometric: (pin: string) => Promise<void>;
  onReplaceBiometric: (pin: string) => Promise<void>;
  onRemoveBiometric: (pin: string) => Promise<void>;
  onWipeVault: (pin: string) => Promise<void>;
  onReloadVault: () => Promise<void>;
  onLock: () => Promise<void>;
  onLogout: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, description?: string) => void;
}

export const VaultDashboard: React.FC<VaultDashboardProps> = ({
  items,
  categories,
  settings,
  auditEvents,
  auditLoading,
  masterKey,
  biometricStatus,
  biometricCapability,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
  onCreateCategory,
  onDeleteCategory,
  onBatchImport,
  onRecordAudit,
  onRefreshAudit,
  onSaveSettings,
  onChangePin,
  onEnrollBiometric,
  onReplaceBiometric,
  onRemoveBiometric,
  onWipeVault,
  onReloadVault,
  onLock,
  onLogout,
  onNotify,
}) => {
  const [activeSection, setActiveSection] = useState<ActiveSection>('vault');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [sortMode, setSortMode] = useState<SortMode>('updated');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);
  const [savingItem, setSavingItem] = useState(false);

  const [detailItem, setDetailItem] = useState<VaultItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VaultItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [revealedCards, setRevealedCards] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const previewAdapter = getPreviewAdapter();

  const toggleCardReveal = (id: string) => {
    setRevealedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  const filteredItems = useMemo(() => {
    const queryNorm = normalizeArabic(searchQuery);

    const list = items.filter((item) => {
      if (activeSection === 'favorites' && !item.isFavorite) return false;
      if (selectedCategoryId !== 'all' && item.categoryId !== selectedCategoryId) {
        return false;
      }
      if (!queryNorm) return true;

      const haystack = [
        item.title,
        item.username || '',
        item.email || '',
        item.urls.join(' '),
        item.notes || '',
      ]
        .map((v) => normalizeArabic(v))
        .join(' ');

      return haystack.includes(queryNorm);
    });

    return [...list].sort((a, b) => {
      if (sortMode === 'title') {
        return a.title.localeCompare(b.title, 'ar');
      }
      if (sortMode === 'favorite') {
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [activeSection, items, searchQuery, selectedCategoryId, sortMode]);

  const handleCopySecret = async (
    value: string,
    label: string,
    sensitive = false,
    trackKey?: string
  ) => {
    try {
      await navigator.clipboard.writeText(value);
      if (trackKey) {
        setCopiedKey(trackKey);
        window.setTimeout(() => {
          setCopiedKey((prev) => (prev === trackKey ? null : prev));
        }, 900);
      }
      onNotify(
        'success',
        `تم نسخ ${label}`,
        sensitive
          ? `سيُحاول المسح التلقائي للحافظة بعد ${settings.clipboardClearSeconds} ثانية إذا سمحت سياسة المتصفح`
          : undefined
      );

      if (sensitive) {
        window.setTimeout(() => {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText('').catch(() => {
              // Browser focus policy may block background clipboard clearing
            });
          }
        }, settings.clipboardClearSeconds * 1000);
      }
    } catch {
      onNotify('error', 'تعذر النسخ إلى الحافظة');
    }
  };

  const handleOpenUrl = (rawUrl: string) => {
    const res = openSafeExternalUrl(rawUrl);
    if (!res.ok) {
      onNotify('error', 'تم حظر رابط غير آمن', 'يُسمح فقط بروابط http و https الموثوقة');
    }
  };

  const handleSaveEditor = async (input: VaultItemInput, existingId?: string) => {
    setSavingItem(true);
    try {
      if (existingId) {
        await onUpdateItem(existingId, input);
        onNotify('success', 'تم تحديث العنصر');
      } else {
        await onCreateItem(input);
        onNotify('success', 'تم الحفظ في الخزنة');
      }
      setEditorOpen(false);
      setEditingItem(null);
    } finally {
      setSavingItem(false);
    }
  };

  const handleDuplicate = async (item: VaultItem) => {
    try {
      await onCreateItem({
        title: `${item.title} (نسخة)`,
        username: item.username,
        email: item.email,
        password: item.password,
        urls: [...item.urls],
        notes: item.notes,
        categoryId: item.categoryId,
        isFavorite: item.isFavorite,
        apiKeys: item.apiKeys.map((s) => ({ ...s, id: crypto.randomUUID() })),
        tokens: item.tokens.map((s) => ({ ...s, id: crypto.randomUUID() })),
        secretKeys: item.secretKeys.map((s) => ({ ...s, id: crypto.randomUUID() })),
        licenseKeys: item.licenseKeys.map((s) => ({ ...s, id: crypto.randomUUID() })),
        certificates: item.certificates.map((s) => ({ ...s, id: crypto.randomUUID() })),
      });
      setDetailItem(null);
      onNotify('success', 'تم إنشاء نسخة من العنصر');
    } catch (err) {
      onNotify(
        'error',
        'تعذر تكرار العنصر',
        err instanceof Error ? err.message : 'تعذر الحفظ على الخادم'
      );
    }
  };

  const handleToggleFavorite = async (item: VaultItem) => {
    try {
      await onUpdateItem(item.id, {
        title: item.title,
        username: item.username,
        email: item.email,
        password: item.password,
        urls: item.urls,
        notes: item.notes,
        categoryId: item.categoryId,
        isFavorite: !item.isFavorite,
        apiKeys: item.apiKeys,
        tokens: item.tokens,
        secretKeys: item.secretKeys,
        licenseKeys: item.licenseKeys,
        certificates: item.certificates,
      });
      if (detailItem?.id === item.id) {
        setDetailItem({ ...item, isFavorite: !item.isFavorite });
      }
    } catch (err) {
      onNotify(
        'error',
        'تعذر تحديث المفضلة',
        err instanceof Error ? err.message : 'تعذر الحفظ على الخادم'
      );
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await onDeleteItem(deleteTarget.id);
      if (detailItem?.id === deleteTarget.id) {
        setDetailItem(null);
      }
      setDeleteTarget(null);
      onNotify('success', 'تم حذف العنصر من الخزنة');
    } catch (err) {
      onNotify(
        'error',
        'تعذر حذف العنصر',
        err instanceof Error ? err.message : 'تعذر الحفظ على الخادم'
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleLoadPreviewDemo = async () => {
    if (!IS_PREVIEW_MODE || !previewAdapter) return;
    setLoadingDemo(true);
    try {
      await previewAdapter.loadDemoData(masterKey);
      await onReloadVault();
      onNotify('success', 'تمت تعبئة البيانات التجريبية بنجاح (وضع المعاينة فقط)');
    } catch (err) {
      onNotify(
        'error',
        'تعذر تعبئة البيانات التجريبية',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setLoadingDemo(false);
    }
  };

  const navItems: { id: ActiveSection; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'vault', label: 'كل العناصر', icon: <Shield className="h-4 w-4" />, count: items.length },
    {
      id: 'favorites',
      label: 'المفضلة',
      icon: <Star className="h-4 w-4" />,
      count: items.filter((i) => i.isFavorite).length,
    },
    { id: 'generator', label: 'مولّد كلمات المرور', icon: <Wand2 className="h-4 w-4" /> },
    { id: 'backup', label: 'النسخ الاحتياطي (.aman)', icon: <HardDriveDownload className="h-4 w-4" /> },
    { id: 'excel', label: 'أدوات Excel (.xlsx)', icon: <FileSpreadsheet className="h-4 w-4" /> },
    { id: 'audit', label: 'سجل التدقيق', icon: <History className="h-4 w-4" /> },
    { id: 'settings', label: 'الإعدادات والأمان', icon: <Settings className="h-4 w-4" /> },
  ];

  const isVaultListing = activeSection === 'vault' || activeSection === 'favorites';

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between p-4">
      <div className="space-y-6">
        {/* Brand */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5">
            <AmanRayanEmblem className="h-10 w-10 drop-shadow-[0_2px_8px_rgba(88,217,255,0.28)]" />
            <div className="min-w-0">
              <h1
                dir="ltr"
                className="font-latin-brand truncate text-right text-sm font-extrabold tracking-tight text-[#f2f5f5]"
              >
                {APP_NAME}
              </h1>
              <p className="truncate text-xs font-bold text-[#76e5ff]">
                {APP_NAME_AR}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="إغلاق القائمة"
            className="steel-btn-secondary rounded-lg p-1.5 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="space-y-1">
          {navItems.map((nav) => {
            const active = activeSection === nav.id;
            return (
              <button
                key={nav.id}
                type="button"
                onClick={() => {
                  setActiveSection(nav.id);
                  if (nav.id === 'audit') {
                    void onRefreshAudit();
                  }
                  setMobileMenuOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold whitespace-nowrap ${
                  active ? 'steel-nav-item--active' : 'steel-nav-item'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span className={active ? 'text-[#58d9ff]' : 'text-[#94a4a9]'}>{nav.icon}</span>
                  <span>{nav.label}</span>
                </span>
                {typeof nav.count === 'number' ? (
                  <span
                    className={`font-mono-tabular text-[11px] ${
                      active ? 'text-[#76e5ff]' : 'text-[#94a4a9]'
                    }`}
                  >
                    {nav.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Categories */}
        {isVaultListing ? (
          <div className="space-y-1.5 border-t border-white/12 pt-4">
            <p className="px-2 text-[11px] font-bold text-[#94a4a9]">التصنيفات</p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategoryId('all');
                setMobileMenuOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                selectedCategoryId === 'all' ? 'steel-tag steel-tag--active' : 'steel-tag hover:text-white'
              }`}
            >
              <Folder className={`h-3.5 w-3.5 ${selectedCategoryId === 'all' ? 'text-[#58d9ff]' : ''}`} />
              <span>جميع التصنيفات</span>
            </button>
            {categories.map((cat) => {
              const catActive = selectedCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategoryId(cat.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    catActive ? 'steel-tag steel-tag--active' : 'steel-tag hover:text-white'
                  }`}
                >
                  <span className="truncate">{cat.name}</span>
                  <span
                    className={`font-mono-tabular text-[11px] ${
                      catActive ? 'text-[#76e5ff]' : 'text-[#94a4a9]'
                    }`}
                  >
                    {items.filter((i) => i.categoryId === cat.id).length}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Bottom Lock & Logout */}
      <div className="space-y-2 border-t border-white/12 pt-4">
        <button
          type="button"
          onClick={() => void onLock()}
          className="steel-btn-secondary flex w-full items-center justify-center gap-2 rounded-xl border-[#58d9ff]/45 py-2.5 text-xs font-bold text-[#f2f5f5]"
        >
          <Lock className="h-4 w-4 text-[#58d9ff]" />
          قفل الخزنة الآن
        </button>
        <button
          type="button"
          onClick={() => void onLogout()}
          className="steel-btn-secondary flex w-full items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold text-[#c2cccf]"
        >
          <LogOut className="h-3.5 w-3.5" />
          تسجيل الخروج
        </button>
      </div>
    </div>
  );

  return (
    <div dir="rtl" className="aman-safe-bg aman-vault-shell flex min-h-screen w-full text-[#f2f5f5]">
      {/* Desktop Sidebar */}
      <aside className="steel-sidebar aman-vault-sidebar-enter hidden w-64 shrink-0 lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="steel-sidebar w-72 shadow-2xl">
            {sidebarContent}
          </div>
          <div
            className="flex-1 bg-black/65 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      ) : null}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Polished Medium-Steel Workspace Top Bar */}
        <header className="steel-topbar aman-vault-topbar-enter flex flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="فتح القائمة"
              className="steel-btn-secondary rounded-xl p-2 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 lg:hidden">
              <AmanRayanEmblem className="h-8 w-8 drop-shadow-[0_1px_6px_rgba(88,217,255,0.26)]" />
              <span className="hidden text-xs font-extrabold text-[#f2f5f5] sm:inline">
                {APP_NAME_AR}
              </span>
            </div>

            {isVaultListing ? (
              <div className="relative w-44 sm:w-72 md:w-80">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a4a9]" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث بالعنوان، المستخدم، البريد، الرابط..."
                  className="steel-search w-full rounded-xl py-2 pr-9 pl-3 text-xs sm:text-sm"
                />
              </div>
            ) : (
              <h2 className="text-sm font-bold text-[#f2f5f5]">
                {navItems.find((n) => n.id === activeSection)?.label}
              </h2>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingItem(null);
                setEditorOpen(true);
              }}
              className="steel-btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-extrabold whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              إضافة عنصر
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="aman-vault-content-enter flex-1 p-4 sm:p-6">
          {isVaultListing ? (
            <div className="mx-auto max-w-6xl space-y-5">
              {/* View & Sort Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-semibold text-[#dce2e3]">
                  عرض <span className="font-mono-tabular font-bold text-[#76e5ff]">{filteredItems.length}</span>{' '}
                  عنصر
                  {selectedCategoryId !== 'all'
                    ? ` · ${categoryMap.get(selectedCategoryId) || ''}`
                    : ''}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                    className="steel-input rounded-xl px-3 py-1.5 text-xs font-semibold"
                  >
                    <option value="updated">الأحدث تحديثاً</option>
                    <option value="title">أبجدياً حسب العنوان</option>
                    <option value="favorite">المفضلة أولاً</option>
                  </select>

                  <div className="steel-switch-slot flex items-center gap-1 rounded-xl p-1">
                    {[
                      { mode: 'cards' as const, icon: <LayoutGrid className="h-3.5 w-3.5" />, label: 'بطاقات' },
                      { mode: 'compact' as const, icon: <Rows3 className="h-3.5 w-3.5" />, label: 'مضغوط' },
                      { mode: 'list' as const, icon: <List className="h-3.5 w-3.5" />, label: 'قائمة' },
                    ].map((v) => (
                      <button
                        key={v.mode}
                        type="button"
                        onClick={() => setViewMode(v.mode)}
                        title={v.label}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                          viewMode === v.mode
                            ? 'steel-switch-lever'
                            : 'text-[#c2cccf] hover:text-white'
                        }`}
                      >
                        {v.icon}
                        <span className="hidden sm:inline">{v.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Empty State */}
              {filteredItems.length === 0 ? (
                <div className="steel-plate rounded-2xl p-1.5">
                  <div className="steel-recess flex flex-col items-center justify-center rounded-xl px-6 py-16 text-center">
                    <AmanRayanEmblem className="mb-4 h-16 w-16 drop-shadow-[0_4px_14px_rgba(88,217,255,0.28)]" />
                    <h3 className="text-base font-bold text-[#f2f5f5]">
                      {items.length === 0 ? `خزنة ${APP_NAME_AR} فارغة حالياً` : 'لا توجد نتائج مطابقة'}
                    </h3>
                    <p className="mt-1.5 max-w-md text-xs leading-relaxed text-[#c2cccf]">
                      {items.length === 0
                        ? 'ابدأ بإضافة حساباتك، كلمات المرور، مفاتيح API، التراخيص أو الشهادات، وسيتم تشفيرها وحفظها بأمان.'
                        : 'جرّب تعديل كلمات البحث أو تغيير تصفية التصنيف.'}
                    </p>
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingItem(null);
                          setEditorOpen(true);
                        }}
                        className="steel-btn-primary inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-xs font-extrabold"
                      >
                        <Plus className="h-4 w-4" />
                        إضافة أول عنصر
                      </button>

                      {IS_PREVIEW_MODE && previewAdapter && items.length === 0 ? (
                        <button
                          type="button"
                          disabled={loadingDemo}
                          onClick={() => void handleLoadPreviewDemo()}
                          className="steel-btn-secondary inline-flex items-center gap-1.5 rounded-xl border-[#d7aa45]/50 px-4 py-2.5 text-xs font-bold text-[#f0c761]"
                        >
                          <FlaskConical className="h-4 w-4" />
                          {loadingDemo
                            ? 'جاري التعبئة...'
                            : 'تعبئة بيانات تجريبية (وضع المعاينة فقط)'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : viewMode === 'list' ? (
                <div className="steel-plate overflow-hidden rounded-2xl p-1">
                  <div className="steel-module-dark overflow-hidden rounded-xl">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] border-collapse text-right text-xs">
                        <thead className="steel-table-head">
                          <tr>
                            <th className="px-4 py-3 font-extrabold">العنوان</th>
                            <th className="px-4 py-3 font-extrabold">التصنيف</th>
                            <th className="px-4 py-3 font-extrabold">المستخدم / البريد</th>
                            <th className="px-4 py-3 font-extrabold">التحديث</th>
                            <th className="px-4 py-3 font-extrabold">إجراءات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/8">
                          {filteredItems.map((item) => (
                            <tr
                              key={item.id}
                              onClick={() => setDetailItem(item)}
                              className="steel-table-row cursor-pointer"
                            >
                              <td className="px-4 py-3 font-bold text-[#f2f5f5]">
                                <span className="inline-flex items-center gap-1.5">
                                  {item.isFavorite ? (
                                    <Star className="h-3.5 w-3.5 fill-[#d7aa45] text-[#f0c761]" />
                                  ) : null}
                                  {item.title}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-[#c2cccf]">
                                {item.categoryId ? categoryMap.get(item.categoryId) || '—' : '—'}
                              </td>
                              <td dir="ltr" className="px-4 py-3 text-right text-[#dce2e3]">
                                {item.username || item.email || '—'}
                              </td>
                              <td className="font-mono-tabular px-4 py-3 text-[#94a4a9]">
                                {formatArabicDate(item.updatedAt)}
                              </td>
                              <td
                                className="px-4 py-3"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center gap-1.5">
                                  {item.password ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleCopySecret(item.password!, 'كلمة المرور', true, `list-pass-${item.id}`)
                                      }
                                      title="نسخ كلمة المرور"
                                      aria-label="نسخ كلمة المرور"
                                      className="vault-action-btn vault-action-btn--copy !h-7 !w-7 !min-h-7 !min-w-7"
                                    >
                                      {copiedKey === `list-pass-${item.id}` ? (
                                        <Check className="h-3.5 w-3.5 text-[#5eead4]" />
                                      ) : (
                                        <Copy className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingItem(item);
                                      setEditorOpen(true);
                                    }}
                                    title="تعديل"
                                    aria-label="تعديل"
                                    className="vault-action-btn vault-action-btn--edit !h-7 !w-7 !min-h-7 !min-w-7"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteTarget(item)}
                                    title="حذف"
                                    aria-label="حذف"
                                    className="vault-action-btn vault-action-btn--danger !h-7 !w-7 !min-h-7 !min-w-7"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className={
                    viewMode === 'cards'
                      ? 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3'
                      : 'grid grid-cols-1 gap-2.5 md:grid-cols-2'
                  }
                >
                  {filteredItems.map((item) => {
                    const catName = item.categoryId ? categoryMap.get(item.categoryId) : undefined;
                    const secretsTotal =
                      item.apiKeys.length +
                      item.tokens.length +
                      item.secretKeys.length +
                      item.licenseKeys.length +
                      item.certificates.length;

                    return (
                      <article
                        key={item.id}
                        onClick={() => setDetailItem(item)}
                        className={`steel-card-module group cursor-pointer rounded-2xl ${
                          viewMode === 'compact' ? 'p-1' : 'p-1.5'
                        }`}
                      >
                        {/* Outer Machined Steel Header Strip */}
                        <div
                          className={`flex items-start justify-between gap-2.5 ${
                            viewMode === 'compact' ? 'px-2.5 py-2' : 'px-3.5 py-2.5'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-extrabold text-[#161e21]">
                              {item.title}
                            </h3>
                            <p className="mt-0.5 truncate text-xs font-semibold text-[#3b494f]">
                              {catName || 'بدون تصنيف'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleToggleFavorite(item);
                            }}
                            title={item.isFavorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                            aria-label={item.isFavorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                            className={`vault-action-btn vault-action-btn--favorite ${
                              item.isFavorite ? 'vault-action-btn--favorite-active' : ''
                            }`}
                          >
                            <Star
                              className={`h-4 w-4 ${item.isFavorite ? 'fill-current text-[#f0c761]' : ''}`}
                            />
                          </button>
                        </div>

                        {/* Dark Recessed Inner Instrument Bay */}
                        <div
                          className={`steel-card-bay flex flex-col gap-2 rounded-xl ${
                            viewMode === 'compact' ? 'p-2' : 'p-3'
                          }`}
                        >
                          {/* 1. URL Row if available */}
                          {item.urls[0] ? (
                            <div className="steel-recess-deep flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-xs">
                              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                                <span className="shrink-0 text-[11px] font-semibold text-[#8ea0a5]">الموقع:</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenUrl(item.urls[0]);
                                  }}
                                  dir="ltr"
                                  className="vault-link-highlight min-w-0 truncate text-left text-xs"
                                  title={`فتح الرابط بأمان: ${item.urls[0]}`}
                                >
                                  {item.urls[0]}
                                </button>
                              </div>
                              <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenUrl(item.urls[0])}
                                  className="vault-action-btn vault-action-btn--link"
                                  title="فتح الرابط بأمان في نافذة جديدة"
                                  aria-label="فتح الرابط"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleCopySecret(item.urls[0], 'الرابط', false, `card-url-${item.id}`)}
                                  className="vault-action-btn vault-action-btn--copy"
                                  title="نسخ الرابط"
                                  aria-label="نسخ الرابط"
                                >
                                  {copiedKey === `card-url-${item.id}` ? (
                                    <Check className="h-3.5 w-3.5 text-[#5eead4]" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {/* 2. Username / Email Row if available */}
                          {item.username || item.email ? (
                            <div className="steel-recess-deep flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-xs">
                              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                                <span className="shrink-0 text-[11px] font-semibold text-[#8ea0a5]">المستخدم:</span>
                                <span dir="ltr" className="min-w-0 truncate font-mono text-left text-xs font-medium text-[#f2f5f5]">
                                  {item.username || item.email}
                                </span>
                              </div>
                              <div className="flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleCopySecret(item.username || item.email!, 'اسم المستخدم', false, `card-user-${item.id}`)
                                  }
                                  className="vault-action-btn vault-action-btn--copy"
                                  title="نسخ اسم المستخدم"
                                  aria-label="نسخ اسم المستخدم"
                                >
                                  {copiedKey === `card-user-${item.id}` ? (
                                    <Check className="h-3.5 w-3.5 text-[#5eead4]" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {/* 3. Password Row if available (Masked by default) */}
                          {item.password ? (
                            <div className="steel-recess-deep flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-xs">
                              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                                <span className="shrink-0 text-[11px] font-semibold text-[#8ea0a5]">كلمة المرور:</span>
                                <span dir="ltr" className="min-w-0 truncate font-mono-tabular text-left text-xs font-bold tracking-wider text-[#f2f5f5]">
                                  {revealedCards[item.id] ? item.password : '••••••••••••'}
                                </span>
                              </div>
                              <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => toggleCardReveal(item.id)}
                                  className="vault-action-btn vault-action-btn--view"
                                  title={revealedCards[item.id] ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                                  aria-label={revealedCards[item.id] ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                                >
                                  {revealedCards[item.id] ? (
                                    <EyeOff className="h-3.5 w-3.5" />
                                  ) : (
                                    <Eye className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleCopySecret(item.password!, 'كلمة المرور', true, `card-pass-${item.id}`)
                                  }
                                  className="vault-action-btn vault-action-btn--copy"
                                  title="نسخ كلمة المرور"
                                  aria-label="نسخ كلمة المرور"
                                >
                                  {copiedKey === `card-pass-${item.id}` ? (
                                    <Check className="h-3.5 w-3.5 text-[#5eead4]" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {/* Fallback note if no fields */}
                          {!item.username && !item.email && !item.password && item.urls.length === 0 ? (
                            <div className="py-1 text-center text-xs text-[#8ea0a5]">
                              {item.notes ? (
                                <p className="truncate">{item.notes}</p>
                              ) : (
                                <p>عنصر مشفر آمن</p>
                              )}
                            </div>
                          ) : null}

                          {/* 4. Bottom Row: Date & Action Controls */}
                          <div
                            className="mt-1 flex items-center justify-between border-t border-white/8 pt-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-2 text-[11px] text-[#8ea0a5]">
                              <span className="font-mono-tabular">{formatArabicDate(item.updatedAt)}</span>
                              {secretsTotal > 0 ? (
                                <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-[#76e5ff]">
                                  {secretsTotal} أسرار
                                </span>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingItem(item);
                                  setEditorOpen(true);
                                }}
                                className="vault-action-btn vault-action-btn--edit"
                                title="تعديل العنصر"
                                aria-label="تعديل العنصر"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDuplicate(item)}
                                className="vault-action-btn"
                                title="تكرار (نسخة)"
                                aria-label="تكرار العنصر"
                              >
                                <Files className="h-3.5 w-3.5 text-[#c2cccf]" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(item)}
                                className="vault-action-btn vault-action-btn--danger"
                                title="حذف العنصر"
                                aria-label="حذف العنصر"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeSection === 'generator' ? (
            <PasswordGeneratorView
              onCopy={(val, label, sensitive) => void handleCopySecret(val, label, sensitive)}
            />
          ) : activeSection === 'backup' ? (
            <BackupRestoreView
              items={items}
              categories={categories}
              masterKey={masterKey}
              onBackupCreated={() => onRecordAudit('backup', 'تصدير نسخة احتياطية مشفرة (.aman)')}
              onCommitRestore={onBatchImport}
              onNotify={(type, title, desc) => onNotify(type, title, desc)}
            />
          ) : activeSection === 'excel' ? (
            <ExcelToolsView
              items={items}
              categories={categories}
              masterKey={masterKey}
              onExported={() => onRecordAudit('excel_export', 'تصدير بيانات الخزنة إلى Excel (.xlsx)')}
              onCommitImport={onBatchImport}
              onNotify={(type, title, desc) => onNotify(type, title, desc)}
            />
          ) : activeSection === 'audit' ? (
            <AuditLogView
              events={auditEvents}
              loading={auditLoading}
              onRefresh={onRefreshAudit}
            />
          ) : (
            <SecuritySettingsView
              settings={settings}
              categories={categories}
              masterKey={masterKey}
              biometricStatus={biometricStatus}
              biometricCapability={biometricCapability}
              onSaveSettings={onSaveSettings}
              onChangePin={onChangePin}
              onEnrollBiometric={onEnrollBiometric}
              onReplaceBiometric={onReplaceBiometric}
              onRemoveBiometric={onRemoveBiometric}
              onCreateCategory={onCreateCategory}
              onDeleteCategory={onDeleteCategory}
              onWipeVault={onWipeVault}
              onDemoDataLoaded={onReloadVault}
              onNotify={(type, title, desc) => onNotify(type, title, desc)}
            />
          )}
        </main>

        {/* Quiet Etched Signature Footer */}
        <footer className="border-t border-white/14 px-6 py-3 text-center text-[11px] font-medium text-[#c2cccf]/85 [text-shadow:0_1px_1px_rgba(9,13,14,0.65)]">
          {APP_SIGNATURE} · الإصدار <span className="font-mono-tabular">{APP_VERSION}</span>
        </footer>
      </div>

      {/* Create / Edit Modal */}
      <VaultItemModal
        open={editorOpen}
        editingItem={editingItem}
        categories={categories}
        isSaving={savingItem}
        onClose={() => {
          setEditorOpen(false);
          setEditingItem(null);
        }}
        onSave={handleSaveEditor}
      />

      {/* Detail Inspection Modal */}
      <VaultItemDetailModal
        item={detailItem}
        categories={categories}
        onClose={() => setDetailItem(null)}
        onEdit={(item) => {
          setDetailItem(null);
          setEditingItem(item);
          setEditorOpen(true);
        }}
        onDuplicate={(item) => void handleDuplicate(item)}
        onDelete={(item) => setDeleteTarget(item)}
        onToggleFavorite={(item) => void handleToggleFavorite(item)}
        onCopySecret={(val, label, sensitive) => void handleCopySecret(val, label, sensitive)}
        onOpenUrl={handleOpenUrl}
      />

      {/* Delete Confirmation Dialog */}
      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="steel-modal-shell w-full max-w-md overflow-hidden rounded-2xl p-1.5 shadow-2xl">
            <div className="px-4 py-3">
              <h3 className="text-base font-extrabold text-[#161e21]">تأكيد حذف العنصر</h3>
            </div>
            <div className="steel-modal-body space-y-4 rounded-xl p-5">
              <p className="text-xs leading-relaxed text-[#c2cccf]">
                هل أنت متأكد من حذف العنصر{' '}
                <span className="font-bold text-[#f2f5f5]">"{deleteTarget.title}"</span> نهائياً؟
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeleteTarget(null)}
                  className="steel-btn-secondary rounded-xl px-4 py-2 text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void handleConfirmDelete()}
                  className="steel-btn-danger rounded-xl px-5 py-2 text-xs font-bold"
                >
                  {deleting ? 'جاري الحذف...' : 'حذف نهائياً'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
