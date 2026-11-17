import React, { useState } from 'react';
import {
  Clock,
  KeyRound,
  FolderPlus,
  Trash2,
  AlertTriangle,
  FlaskConical,
} from 'lucide-react';
import type { AppSettings, Category } from '../../types/aman';
import { IS_PREVIEW_MODE } from '../../version';
import { getPreviewAdapter } from '../../adapters';

interface SecuritySettingsViewProps {
  settings: AppSettings;
  categories: Category[];
  masterKey: CryptoKey;
  onSaveSettings: (next: AppSettings) => Promise<void>;
  onChangePin: (currentPin: string, newPin: string) => Promise<void>;
  onCreateCategory: (name: string) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  onWipeVault: (pin: string) => Promise<void>;
  onDemoDataLoaded: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'warning', title: string, description?: string) => void;
}

export const SecuritySettingsView: React.FC<SecuritySettingsViewProps> = ({
  settings,
  categories,
  masterKey,
  onSaveSettings,
  onChangePin,
  onCreateCategory,
  onDeleteCategory,
  onWipeVault,
  onDemoDataLoaded,
  onNotify,
}) => {
  const [autoLockMinutes, setAutoLockMinutes] = useState(settings.autoLockMinutes);
  const [clipboardClearSeconds, setClipboardClearSeconds] = useState(
    settings.clipboardClearSeconds
  );
  const [savingSettings, setSavingSettings] = useState(false);

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [changingPin, setChangingPin] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState('');

  const [wipeModalOpen, setWipeModalOpen] = useState(false);
  const [wipePin, setWipePin] = useState('');
  const [wipeConfirmed, setWipeConfirmed] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const previewAdapter = getPreviewAdapter();

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await onSaveSettings({ autoLockMinutes, clipboardClearSeconds });
      onNotify('success', 'تم حفظ إعدادات الأمان');
    } catch (err) {
      onNotify(
        'error',
        'تعذر حفظ الإعدادات',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(currentPin) || !/^\d{6}$/.test(newPin)) {
      onNotify('warning', 'يجب أن يتكون رمز الأمان من 6 أرقام');
      return;
    }
    if (newPin !== confirmNewPin) {
      onNotify('error', 'رمزا الأمان الجديدان غير متطابقين');
      return;
    }
    setChangingPin(true);
    try {
      await onChangePin(currentPin, newPin);
      setCurrentPin('');
      setNewPin('');
      setConfirmNewPin('');
      onNotify('success', 'تم تحديث رمز أمان بنجاح');
    } catch (err) {
      onNotify(
        'error',
        'تعذر تغيير رمز الأمان',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setChangingPin(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    try {
      await onCreateCategory(newCategoryName.trim());
      setNewCategoryName('');
      onNotify('success', 'تمت إضافة التصنيف');
    } catch (err) {
      onNotify(
        'error',
        'تعذر إضافة التصنيف',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const handleConfirmWipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(wipePin) || !wipeConfirmed) return;
    setWiping(true);
    try {
      await onWipeVault(wipePin);
      setWipeModalOpen(false);
      setWipePin('');
      setWipeConfirmed(false);
      onNotify('info' as 'success', 'تم مسح الخزنة والعودة للتهيئة الأولية');
    } catch (err) {
      onNotify(
        'error',
        'تعذر مسح الخزنة',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setWiping(false);
    }
  };

  const handleLoadDemo = async () => {
    if (!IS_PREVIEW_MODE || !previewAdapter) return;
    setLoadingDemo(true);
    try {
      await previewAdapter.loadDemoData(masterKey);
      await onDemoDataLoaded();
      onNotify('success', 'تمت إضافة بيانات المعاينة التجريبية المشفرة');
    } catch (err) {
      onNotify(
        'error',
        'تعذر تحميل البيانات التجريبية',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setLoadingDemo(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#f3f6f5]">الإعدادات والأمان</h2>
        <p className="mt-1 text-sm text-[#8b9997]">
          التحكم في القفل التلقائي، رمز الأمان، التصنيفات، ومسح الخزنة
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Auto-Lock & Clipboard */}
        <form
          onSubmit={(e) => void handleSaveSettings(e)}
          className="space-y-4 rounded-2xl border border-white/10 bg-[#101616] p-6"
        >
          <div className="flex items-center gap-2.5">
            <Clock className="h-5 w-5 text-[#e5b440]" />
            <h3 className="text-base font-bold text-white">القفل التلقائي والحافظة</h3>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[#b9c4c2]">
              القفل التلقائي عند عدم النشاط
            </label>
            <select
              value={autoLockMinutes}
              onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
              className="w-full rounded-xl border border-white/10 bg-[#0a0e0e] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#e5b440]/70"
            >
              <option value={2}>دقيقتان</option>
              <option value={5}>5 دقائق (افتراضي)</option>
              <option value={10}>10 دقائق</option>
              <option value={15}>15 دقيقة</option>
              <option value={30}>30 دقيقة</option>
              <option value={60}>ساعة واحدة</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[#b9c4c2]">
              مهلة مسح الحافظة بعد نسخ الأسرار
            </label>
            <select
              value={clipboardClearSeconds}
              onChange={(e) => setClipboardClearSeconds(Number(e.target.value))}
              className="w-full rounded-xl border border-white/10 bg-[#0a0e0e] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#e5b440]/70"
            >
              <option value={10}>10 ثوانٍ</option>
              <option value={20}>20 ثانية</option>
              <option value={30}>30 ثانية</option>
              <option value={60}>60 ثانية</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={savingSettings}
            className="w-full rounded-xl bg-[#e5b440] py-2.5 text-sm font-bold text-[#0b0e0e] transition hover:bg-[#ffd365] disabled:opacity-50"
          >
            {savingSettings ? 'جاري الحفظ...' : 'حفظ إعدادات الجلسة'}
          </button>
        </form>

        {/* Change PIN */}
        <form
          onSubmit={(e) => void handleChangePin(e)}
          className="space-y-4 rounded-2xl border border-white/10 bg-[#101616] p-6"
        >
          <div className="flex items-center gap-2.5">
            <KeyRound className="h-5 w-5 text-[#e5b440]" />
            <h3 className="text-base font-bold text-white">تغيير رمز أمان (6 أرقام)</h3>
          </div>

          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="رمز الأمان الحالي (6 أرقام)"
            className="font-mono-tabular w-full rounded-xl border border-white/10 bg-[#0a0e0e] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#e5b440]/70"
          />

          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="رمز الأمان الجديد (6 أرقام)"
            className="font-mono-tabular w-full rounded-xl border border-white/10 bg-[#0a0e0e] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#e5b440]/70"
          />

          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={confirmNewPin}
            onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="تأكيد الرمز الجديد"
            className="font-mono-tabular w-full rounded-xl border border-white/10 bg-[#0a0e0e] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#e5b440]/70"
          />

          <button
            type="submit"
            disabled={changingPin}
            className="w-full rounded-xl border border-[#e5b440]/40 bg-[#e5b440]/15 py-2.5 text-sm font-bold text-[#ffd365] transition hover:bg-[#e5b440]/25 disabled:opacity-50"
          >
            {changingPin ? 'جاري التحديث...' : 'تحديث رمز الأمان'}
          </button>
        </form>
      </div>

      {/* Category Manager */}
      <div className="space-y-4 rounded-2xl border border-white/10 bg-[#101616] p-6">
        <div className="flex items-center gap-2.5">
          <FolderPlus className="h-5 w-5 text-[#e5b440]" />
          <h3 className="text-base font-bold text-white">إدارة التصنيفات</h3>
        </div>

        <form onSubmit={(e) => void handleAddCategory(e)} className="flex flex-wrap gap-2">
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="اسم التصنيف الجديد..."
            className="min-w-[200px] flex-1 rounded-xl border border-white/10 bg-[#0a0e0e] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#e5b440]/70"
          />
          <button
            type="submit"
            className="rounded-xl bg-[#e5b440] px-5 py-2.5 text-sm font-bold text-[#0b0e0e] transition hover:bg-[#ffd365]"
          >
            إضافة تصنيف
          </button>
        </form>

        {categories.length === 0 ? (
          <p className="text-xs text-[#8b9997]">لا توجد تصنيفات مضافة بعد.</p>
        ) : (
          <div className="divide-y divide-white/8 rounded-xl border border-white/8 bg-[#0a0e0e]">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm font-medium text-[#dce3e1]">{cat.name}</span>
                <button
                  type="button"
                  onClick={() => void onDeleteCategory(cat.id)}
                  className="rounded-lg p-1.5 text-[#8b9997] transition hover:bg-red-500/10 hover:text-red-400"
                  aria-label={`حذف ${cat.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PREVIEW ONLY: Isolated Optional Demo Data Button */}
      {IS_PREVIEW_MODE && previewAdapter ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
          <div className="flex items-start gap-3">
            <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <h3 className="text-sm font-bold text-amber-300">
                Load Demo Data — تعبئة بيانات تجريبية (وضع المعاينة فقط)
              </h3>
              <p className="mt-1 text-xs text-[#93a19f]">
                زر اختياري ومعزول لوضع المعاينة في Google AI Studio لاختبار الخزنة بعناصر مشفرة
                جاهزة، ولا يوجد مطلقاً في وضع الإنتاج.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={loadingDemo}
            onClick={() => void handleLoadDemo()}
            className="rounded-xl border border-amber-400/50 bg-amber-400/15 px-4 py-2.5 text-xs font-bold text-amber-200 transition hover:bg-amber-400/25 disabled:opacity-50"
          >
            {loadingDemo ? 'جاري التشفير والتعبئة...' : 'تعبئة بيانات تجريبية (وضع المعاينة فقط)'}
          </button>
        </div>
      ) : null}

      {/* Danger Zone: Complete Vault Wipe */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <div>
            <h3 className="text-sm font-bold text-red-300">مسح الخزنة بالكامل</h3>
            <p className="mt-1 text-xs text-[#93a19f]">
              يحذف جميع العناصر والتصنيفات ومفتاح المالك ويعيد التطبيق لحالة الإنشاء الأول.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setWipeModalOpen(true)}
          className="rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-2.5 text-xs font-bold text-red-200 transition hover:bg-red-500/25"
        >
          مسح الخزنة بالكامل
        </button>
      </div>

      {/* Wipe Confirmation Modal */}
      {wipeModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={(e) => void handleConfirmWipe(e)}
            className="w-full max-w-md space-y-4 rounded-2xl border border-red-500/40 bg-[#101616] p-6 shadow-2xl"
          >
            <h3 className="text-lg font-bold text-red-300">تأكيد مسح خزنة أمان بالكامل</h3>
            <p className="text-xs leading-relaxed text-[#b9c4c2]">
              سيؤدي هذا الإجراء إلى حذف جميع البيانات المشفرة نهائياً ضمن معاملة ذرية والعودة إلى
              شاشة إنشاء رمز أمان جديد.
            </p>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              required
              value={wipePin}
              onChange={(e) => setWipePin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="أدخل رمز الأمان (6 أرقام) للتأكيد"
              className="font-mono-tabular w-full rounded-xl border border-white/10 bg-[#0a0e0e] px-3.5 py-2.5 text-sm text-white outline-none focus:border-red-400"
            />
            <label className="flex cursor-pointer items-center gap-2 text-xs text-[#dce3e1]">
              <input
                type="checkbox"
                checked={wipeConfirmed}
                onChange={(e) => setWipeConfirmed(e.target.checked)}
                className="accent-red-500"
              />
              <span>أفهم أن هذا الإجراء نهائي ولا يمكن التراجع عنه</span>
            </label>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setWipeModalOpen(false);
                  setWipePin('');
                  setWipeConfirmed(false);
                }}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-[#b9c4c2] hover:bg-white/5"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={wiping || !wipeConfirmed || wipePin.length !== 6}
                className="rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white transition hover:bg-red-500 disabled:opacity-45"
              >
                {wiping ? 'جاري المسح...' : 'تنفيذ المسح النهائي'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
};
