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
  Category,
  SortMode,
  VaultItem,
  VaultItemInput,
  ViewMode,
} from '../../types/aman';
import { APP_NAME_AR, APP_SIGNATURE, APP_VERSION, IS_PREVIEW_MODE } from '../../version';
import { formatArabicDate, normalizeArabic, openSafeExternalUrl } from '../../utils/normalize';
import type { BatchImportRequest } from '../../adapters/AmanDataAdapter';
import { getPreviewAdapter } from '../../adapters';
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

  const previewAdapter = getPreviewAdapter();

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

  const handleCopySecret = async (value: string, label: string, sensitive = false) => {
    try {
      await navigator.clipboard.writeText(value);
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
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#e5b440]/30 bg-gradient-to-b from-[#1a2624] to-[#0c1211] text-[#ffd365]">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-[#f3f6f5]">
                {APP_NAME_AR}
              </h1>
              <p className="text-[11px] text-[#83918f]">AMAN · {APP_VERSION}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-1.5 text-[#8b9997] hover:bg-white/5 lg:hidden"
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
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold whitespace-nowrap transition ${
                  active
                    ? 'bg-[#e5b440]/14 text-[#ffd365]'
                    : 'text-[#a3b0ae] hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  {nav.icon}
                  <span>{nav.label}</span>
                </span>
                {typeof nav.count === 'number' ? (
                  <span className="font-mono-tabular text-[11px] opacity-75">{nav.count}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Categories */}
        {isVaultListing ? (
          <div className="space-y-1.5 border-t border-white/8 pt-4">
            <p className="px-3 text-[11px] font-bold text-[#758482]">التصنيفات</p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategoryId('all');
                setMobileMenuOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                selectedCategoryId === 'all'
                  ? 'bg-white/8 text-white'
                  : 'text-[#8b9997] hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <Folder className="h-3.5 w-3.5" />
              <span>جميع التصنيفات</span>
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSelectedCategoryId(cat.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  selectedCategoryId === cat.id
                    ? 'bg-white/8 text-white'
                    : 'text-[#8b9997] hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                <span className="truncate">{cat.name}</span>
                <span className="font-mono-tabular text-[11px] opacity-65">
                  {items.filter((i) => i.categoryId === cat.id).length}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Bottom Lock & Signature */}
      <div className="space-y-2 border-t border-white/8 pt-4">
        <button
          type="button"
          onClick={() => void onLock()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e5b440]/30 bg-[#e5b440]/10 py-2.5 text-xs font-bold text-[#ffd365] transition hover:bg-[#e5b440]/20"
        >
          <Lock className="h-4 w-4" />
          قفل الخزنة الآن
        </button>
        <button
          type="button"
          onClick={() => void onLogout()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-2 text-xs font-semibold text-[#93a19f] transition hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" />
          تسجيل الخروج
        </button>
      </div>
    </div>
  );

  return (
    <div dir="rtl" className="aman-safe-bg flex min-h-screen w-full text-[#f3f6f5]">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-l border-white/8 bg-[#0b1010]/90 lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="w-72 border-l border-white/10 bg-[#0b1010] shadow-2xl">
            {sidebarContent}
          </div>
          <div
            className="flex-1 bg-black/70"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      ) : null}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Clean Workspace Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 bg-[#0c1212]/80 px-4 py-3.5 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="فتح القائمة"
              className="rounded-xl border border-white/10 p-2 text-[#b9c4c2] hover:bg-white/5 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            {isVaultListing ? (
              <div className="relative w-56 sm:w-80">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7c8a88]" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث بالعنوان، المستخدم، البريد، الرابط..."
                  className="w-full rounded-xl border border-white/10 bg-[#070a0a] py-2 pr-9 pl-3 text-xs text-white outline-none transition focus:border-[#e5b440]/60 sm:text-sm"
                />
              </div>
            ) : (
              <h2 className="text-sm font-bold text-[#dce3e1]">
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
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#e5b440] px-4 py-2 text-xs font-bold text-[#0b0e0e] whitespace-nowrap transition hover:bg-[#ffd365]"
            >
              <Plus className="h-4 w-4" />
              إضافة عنصر
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6">
          {isVaultListing ? (
            <div className="mx-auto max-w-6xl space-y-5">
              {/* View & Sort Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-[#8b9997]">
                  عرض <span className="font-mono-tabular font-bold text-[#f3f6f5]">{filteredItems.length}</span>{' '}
                  عنصر
                  {selectedCategoryId !== 'all'
                    ? ` · ${categoryMap.get(selectedCategoryId) || ''}`
                    : ''}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                    className="rounded-xl border border-white/10 bg-[#101616] px-3 py-1.5 text-xs font-semibold text-[#dce3e1] outline-none"
                  >
                    <option value="updated">الأحدث تحديثاً</option>
                    <option value="title">أبجدياً حسب العنوان</option>
                    <option value="favorite">المفضلة أولاً</option>
                  </select>

                  <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#101616] p-1">
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
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                          viewMode === v.mode
                            ? 'bg-white/10 text-[#ffd365]'
                            : 'text-[#8b9997] hover:text-white'
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
                <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#101616] px-6 py-16 text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-[#e5b440]">
                    <Shield className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-bold text-[#f3f6f5]">
                    {items.length === 0 ? 'خزنة أمان فارغة حالياً' : 'لا توجد نتائج مطابقة'}
                  </h3>
                  <p className="mt-1.5 max-w-md text-xs leading-relaxed text-[#8b9997]">
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
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#e5b440] px-5 py-2.5 text-xs font-bold text-[#0b0e0e] transition hover:bg-[#ffd365]"
                    >
                      <Plus className="h-4 w-4" />
                      إضافة أول عنصر
                    </button>

                    {IS_PREVIEW_MODE && previewAdapter && items.length === 0 ? (
                      <button
                        type="button"
                        disabled={loadingDemo}
                        onClick={() => void handleLoadPreviewDemo()}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-xs font-bold text-amber-200 transition hover:bg-amber-400/20 disabled:opacity-50"
                      >
                        <FlaskConical className="h-4 w-4" />
                        {loadingDemo
                          ? 'جاري التعبئة...'
                          : 'تعبئة بيانات تجريبية (وضع المعاينة فقط)'}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : viewMode === 'list' ? (
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#101616]">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-right text-xs">
                      <thead className="border-b border-white/8 bg-[#0b1010] text-[#8b9997]">
                        <tr>
                          <th className="px-4 py-3 font-semibold">العنوان</th>
                          <th className="px-4 py-3 font-semibold">التصنيف</th>
                          <th className="px-4 py-3 font-semibold">المستخدم / البريد</th>
                          <th className="px-4 py-3 font-semibold">التحديث</th>
                          <th className="px-4 py-3 font-semibold">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/6">
                        {filteredItems.map((item) => (
                          <tr
                            key={item.id}
                            onClick={() => setDetailItem(item)}
                            className="cursor-pointer transition hover:bg-white/[0.03]"
                          >
                            <td className="px-4 py-3 font-bold text-white">
                              <span className="inline-flex items-center gap-1.5">
                                {item.isFavorite ? (
                                  <Star className="h-3.5 w-3.5 fill-[#ffd365] text-[#ffd365]" />
                                ) : null}
                                {item.title}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[#93a19f]">
                              {item.categoryId ? categoryMap.get(item.categoryId) || '—' : '—'}
                            </td>
                            <td dir="ltr" className="px-4 py-3 text-right text-[#b9c4c2]">
                              {item.username || item.email || '—'}
                            </td>
                            <td className="font-mono-tabular px-4 py-3 text-[#7c8a88]">
                              {formatArabicDate(item.updatedAt)}
                            </td>
                            <td
                              className="px-4 py-3"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center gap-1">
                                {item.password ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleCopySecret(item.password!, 'كلمة المرور', true)
                                    }
                                    title="نسخ كلمة المرور"
                                    className="rounded-lg p-1.5 text-[#93a19f] hover:bg-white/5 hover:text-[#ffd365]"
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingItem(item);
                                    setEditorOpen(true);
                                  }}
                                  title="تعديل"
                                  className="rounded-lg p-1.5 text-[#93a19f] hover:bg-white/5 hover:text-white"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(item)}
                                  title="حذف"
                                  className="rounded-lg p-1.5 text-[#93a19f] hover:bg-red-500/10 hover:text-red-400"
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
                        className={`group cursor-pointer rounded-2xl border border-white/10 bg-[#101616] transition hover:border-[#e5b440]/40 ${
                          viewMode === 'compact' ? 'p-3.5' : 'p-5'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-bold text-[#f3f6f5] group-hover:text-[#ffd365]">
                              {item.title}
                            </h3>
                            <p className="mt-1 truncate text-xs text-[#8b9997]">
                              {catName || 'بدون تصنيف'}
                              {item.username || item.email
                                ? ` · ${item.username || item.email}`
                                : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleToggleFavorite(item);
                            }}
                            aria-label="المفضلة"
                            className={`rounded-lg p-1.5 transition ${
                              item.isFavorite
                                ? 'text-[#ffd365]'
                                : 'text-[#5b6967] hover:text-white'
                            }`}
                          >
                            <Star
                              className={`h-4 w-4 ${item.isFavorite ? 'fill-current' : ''}`}
                            />
                          </button>
                        </div>

                        {viewMode === 'cards' ? (
                          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#7c8a88]">
                            <span>{item.password ? 'كلمة مرور مشفرة' : 'بدون كلمة مرور'}</span>
                            {secretsTotal > 0 ? (
                              <>
                                <span>·</span>
                                <span>{secretsTotal} مفاتيح/أسرار</span>
                              </>
                            ) : null}
                            {item.urls.length > 0 ? (
                              <>
                                <span>·</span>
                                <span>{item.urls.length} رابط</span>
                              </>
                            ) : null}
                          </div>
                        ) : null}

                        <div
                          className={`flex items-center justify-between border-t border-white/6 ${
                            viewMode === 'compact' ? 'mt-2.5 pt-2' : 'mt-4 pt-3'
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-1">
                            {item.password ? (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleCopySecret(item.password!, 'كلمة المرور', true)
                                }
                                title="نسخ كلمة المرور"
                                className="rounded-lg p-1.5 text-[#93a19f] transition hover:bg-white/5 hover:text-[#ffd365]"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                            {item.urls[0] ? (
                              <button
                                type="button"
                                onClick={() => handleOpenUrl(item.urls[0])}
                                title="فتح الرابط بأمان"
                                className="rounded-lg p-1.5 text-[#93a19f] transition hover:bg-white/5 hover:text-emerald-300"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void handleDuplicate(item)}
                              title="تكرار (نسخة)"
                              className="rounded-lg p-1.5 text-[#93a19f] transition hover:bg-white/5 hover:text-white"
                            >
                              <Files className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingItem(item);
                                setEditorOpen(true);
                              }}
                              title="تعديل"
                              className="rounded-lg p-1.5 text-[#93a19f] transition hover:bg-white/5 hover:text-white"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(item)}
                              title="حذف"
                              className="rounded-lg p-1.5 text-[#93a19f] transition hover:bg-red-500/10 hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
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
              onSaveSettings={onSaveSettings}
              onChangePin={onChangePin}
              onCreateCategory={onCreateCategory}
              onDeleteCategory={onDeleteCategory}
              onWipeVault={onWipeVault}
              onDemoDataLoaded={onReloadVault}
              onNotify={(type, title, desc) => onNotify(type, title, desc)}
            />
          )}
        </main>

        {/* Quiet Signature Footer */}
        <footer className="border-t border-white/6 px-6 py-3 text-center text-[11px] text-[#788785]">
          {APP_SIGNATURE} · الإصدار {APP_VERSION}
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
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-red-500/35 bg-[#101616] p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white">تأكيد حذف العنصر</h3>
            <p className="text-xs leading-relaxed text-[#b9c4c2]">
              هل أنت متأكد من حذف العنصر{' '}
              <span className="font-bold text-white">"{deleteTarget.title}"</span> نهائياً؟
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-[#b9c4c2] hover:bg-white/5"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleConfirmDelete()}
                className="rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white transition hover:bg-red-500 disabled:opacity-50"
              >
                {deleting ? 'جاري الحذف...' : 'حذف نهائياً'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
