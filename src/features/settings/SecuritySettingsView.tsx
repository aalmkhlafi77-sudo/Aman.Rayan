import React, { useState } from 'react';
import {
  Clock,
  KeyRound,
  FolderPlus,
  Trash2,
  AlertTriangle,
  FlaskConical,
  Volume2,
} from 'lucide-react';
import type { AppSettings, Category } from '../../types/aman';
import { IS_PREVIEW_MODE } from '../../version';
import { getPreviewAdapter } from '../../adapters';
import {
  playWheelDetent,
  setMechanicalAudioConfig,
} from '../../services/mechanicalAudio';

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
  const [mechanicalSoundsEnabled, setMechanicalSoundsEnabled] = useState<boolean>(
    settings.mechanicalSoundsEnabled !== false
  );
  const [mechanicalSoundsVolume, setMechanicalSoundsVolume] = useState<number>(
    typeof settings.mechanicalSoundsVolume === 'number' ? settings.mechanicalSoundsVolume : 45
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
      await onSaveSettings({
        autoLockMinutes,
        clipboardClearSeconds,
        mechanicalSoundsEnabled,
        mechanicalSoundsVolume,
      });
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
        <h2 className="text-xl font-extrabold text-[#f2f5f5]">الإعدادات والأمان</h2>
        <p className="mt-1 text-sm text-[#c2cccf]">
          التحكم في القفل التلقائي، رمز الأمان، التصنيفات، ومسح الخزنة
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Auto-Lock, Clipboard & Mechanical Audio */}
        <div className="steel-plate rounded-2xl p-1.5">
          <div className="flex items-center gap-2.5 px-4 py-3">
            <div className="steel-recess flex h-8 w-8 items-center justify-center rounded-lg text-[#76e5ff]">
              <Clock className="h-4 w-4" />
            </div>
            <h3 className="text-base font-extrabold text-[#161e21]">القفل التلقائي والحافظة</h3>
          </div>

          <form
            onSubmit={(e) => void handleSaveSettings(e)}
            className="steel-modal-body space-y-4 rounded-xl p-5"
          >
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#c2cccf]">
                القفل التلقائي عند عدم النشاط
              </label>
              <select
                value={autoLockMinutes}
                onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
                className="steel-input w-full rounded-xl px-3.5 py-2.5 text-sm"
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
              <label className="mb-1.5 block text-xs font-semibold text-[#c2cccf]">
                مهلة مسح الحافظة بعد نسخ الأسرار
              </label>
              <select
                value={clipboardClearSeconds}
                onChange={(e) => setClipboardClearSeconds(Number(e.target.value))}
                className="steel-input w-full rounded-xl px-3.5 py-2.5 text-sm"
              >
                <option value={10}>10 ثوانٍ</option>
                <option value={20}>20 ثانية</option>
                <option value={30}>30 ثانية</option>
                <option value={60}>60 ثانية</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#c2cccf]">
                الأصوات الميكانيكية
              </label>
              <div className="steel-switch-slot grid grid-cols-2 gap-1.5 rounded-xl p-1">
                <button
                  type="button"
                  aria-pressed={mechanicalSoundsEnabled}
                  onClick={() => {
                    setMechanicalSoundsEnabled(true);
                    setMechanicalAudioConfig({
                      enabled: true,
                      volume: mechanicalSoundsVolume,
                    });
                    playWheelDetent(2);
                  }}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-extrabold transition ${
                    mechanicalSoundsEnabled
                      ? 'steel-switch-lever'
                      : 'text-[#94a4a9] hover:text-[#f2f5f5]'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      mechanicalSoundsEnabled
                        ? 'bg-[#36e5a4] shadow-[0_0_8px_rgba(54,229,164,0.85)]'
                        : 'bg-[#354145]'
                    }`}
                  />
                  <span>تشغيل</span>
                </button>
                <button
                  type="button"
                  aria-pressed={!mechanicalSoundsEnabled}
                  onClick={() => {
                    setMechanicalSoundsEnabled(false);
                    setMechanicalAudioConfig({
                      enabled: false,
                      volume: mechanicalSoundsVolume,
                    });
                  }}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-extrabold transition ${
                    !mechanicalSoundsEnabled
                      ? 'steel-switch-lever'
                      : 'text-[#94a4a9] hover:text-[#f2f5f5]'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      !mechanicalSoundsEnabled
                        ? 'bg-[#58d9ff] shadow-[0_0_8px_rgba(88,217,255,0.8)]'
                        : 'bg-[#354145]'
                    }`}
                  />
                  <span>إيقاف</span>
                </button>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-[#c2cccf]">
                <span className="flex items-center gap-1.5">
                  <Volume2 className="h-3.5 w-3.5 text-[#76e5ff]" />
                  مستوى صوت المؤثرات
                </span>
                <span className="font-mono-tabular text-[#76e5ff]">
                  {mechanicalSoundsVolume}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                disabled={!mechanicalSoundsEnabled}
                value={mechanicalSoundsVolume}
                onChange={(e) => {
                  const nextVol = Number(e.target.value);
                  setMechanicalSoundsVolume(nextVol);
                  setMechanicalAudioConfig({
                    enabled: mechanicalSoundsEnabled,
                    volume: nextVol,
                  });
                }}
                onPointerUp={() => {
                  if (mechanicalSoundsEnabled) {
                    playWheelDetent(2);
                  }
                }}
                aria-label="مستوى صوت المؤثرات"
                className="w-full accent-[#58d9ff] disabled:opacity-40"
              />
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="steel-btn-primary w-full rounded-xl py-2.5 text-sm font-extrabold"
            >
              {savingSettings ? 'جاري الحفظ...' : 'حفظ إعدادات الجلسة'}
            </button>
          </form>
        </div>

        {/* Change PIN */}
        <div className="steel-plate rounded-2xl p-1.5">
          <div className="flex items-center gap-2.5 px-4 py-3">
            <div className="steel-recess flex h-8 w-8 items-center justify-center rounded-lg text-[#76e5ff]">
              <KeyRound className="h-4 w-4" />
            </div>
            <h3 className="text-base font-extrabold text-[#161e21]">تغيير رمز أمان (6 أرقام)</h3>
          </div>

          <form
            onSubmit={(e) => void handleChangePin(e)}
            className="steel-modal-body flex h-[calc(100%-56px)] flex-col justify-between gap-4 rounded-xl p-5"
          >
            <div className="space-y-3.5">
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="رمز الأمان الحالي (6 أرقام)"
                className="steel-input font-mono-tabular w-full rounded-xl px-3.5 py-2.5 text-sm"
              />

              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="رمز الأمان الجديد (6 أرقام)"
                className="steel-input font-mono-tabular w-full rounded-xl px-3.5 py-2.5 text-sm"
              />

              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={confirmNewPin}
                onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="تأكيد الرمز الجديد"
                className="steel-input font-mono-tabular w-full rounded-xl px-3.5 py-2.5 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={changingPin}
              className="steel-btn-secondary w-full rounded-xl py-2.5 text-sm font-bold text-[#76e5ff]"
            >
              {changingPin ? 'جاري التحديث...' : 'تحديث رمز الأمان'}
            </button>
          </form>
        </div>
      </div>

      {/* Category Manager */}
      <div className="steel-plate rounded-2xl p-1.5">
        <div className="flex items-center gap-2.5 px-4 py-3">
          <div className="steel-recess flex h-8 w-8 items-center justify-center rounded-lg text-[#76e5ff]">
            <FolderPlus className="h-4 w-4" />
          </div>
          <h3 className="text-base font-extrabold text-[#161e21]">إدارة التصنيفات</h3>
        </div>

        <div className="steel-modal-body space-y-4 rounded-xl p-5">
          <form onSubmit={(e) => void handleAddCategory(e)} className="flex flex-wrap gap-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="اسم التصنيف الجديد..."
              className="steel-input min-w-[200px] flex-1 rounded-xl px-3.5 py-2.5 text-sm"
            />
            <button
              type="submit"
              className="steel-btn-primary rounded-xl px-5 py-2.5 text-sm font-extrabold"
            >
              إضافة تصنيف
            </button>
          </form>

          {categories.length === 0 ? (
            <p className="text-xs text-[#94a4a9]">لا توجد تصنيفات مضافة بعد.</p>
          ) : (
            <div className="steel-recess divide-y divide-white/10 rounded-xl">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm font-medium text-[#f2f5f5]">{cat.name}</span>
                  <button
                    type="button"
                    onClick={() => void onDeleteCategory(cat.id)}
                    className="rounded-lg p-1.5 text-[#94a4a9] transition hover:bg-[#d95c5c]/15 hover:text-[#d95c5c]"
                    aria-label={`حذف ${cat.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* PREVIEW ONLY: Isolated Optional Demo Data Button */}
      {IS_PREVIEW_MODE && previewAdapter ? (
        <div className="steel-plate rounded-2xl p-1.5">
          <div className="steel-module-dark flex flex-wrap items-center justify-between gap-4 rounded-xl border-[#d7aa45]/35 p-5">
            <div className="flex items-start gap-3">
              <div className="steel-recess flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#f0c761]">
                <FlaskConical className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#f0c761]">
                  Load Demo Data — تعبئة بيانات تجريبية (وضع المعاينة فقط)
                </h3>
                <p className="mt-1 text-xs text-[#c2cccf]">
                  زر اختياري ومعزول لوضع المعاينة في Google AI Studio لاختبار الخزنة بعناصر مشفرة
                  جاهزة، ولا يوجد مطلقاً في وضع الإنتاج.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={loadingDemo}
              onClick={() => void handleLoadDemo()}
              className="steel-btn-secondary rounded-xl border-[#d7aa45]/45 px-4 py-2.5 text-xs font-bold text-[#f0c761]"
            >
              {loadingDemo ? 'جاري التشفير والتعبئة...' : 'تعبئة بيانات تجريبية (وضع المعاينة فقط)'}
            </button>
          </div>
        </div>
      ) : null}

      {/* Danger Zone: Complete Vault Wipe */}
      <div className="steel-plate rounded-2xl p-1.5">
        <div className="steel-module-dark flex flex-wrap items-center justify-between gap-4 rounded-xl border-[#d95c5c]/45 p-5">
          <div className="flex items-start gap-3">
            <div className="steel-recess flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#d95c5c]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#f4b8b8]">مسح الخزنة بالكامل</h3>
              <p className="mt-1 text-xs text-[#c2cccf]">
                يحذف جميع العناصر والتصنيفات ومفتاح المالك ويعيد التطبيق لحالة الإنشاء الأول.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setWipeModalOpen(true)}
            className="steel-btn-danger rounded-xl px-4 py-2.5 text-xs font-bold"
          >
            مسح الخزنة بالكامل
          </button>
        </div>
      </div>

      {/* Wipe Confirmation Modal */}
      {wipeModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="steel-modal-shell w-full max-w-md overflow-hidden rounded-2xl p-1.5 shadow-2xl">
            <div className="px-4 py-3">
              <h3 className="text-base font-extrabold text-[#161e21]">تأكيد مسح خزنة أمان بالكامل</h3>
            </div>
            <form
              onSubmit={(e) => void handleConfirmWipe(e)}
              className="steel-modal-body space-y-4 rounded-xl p-5"
            >
              <p className="text-xs leading-relaxed text-[#c2cccf]">
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
                className="steel-input font-mono-tabular w-full rounded-xl px-3.5 py-2.5 text-sm"
              />
              <label className="flex cursor-pointer items-center gap-2 text-xs text-[#f2f5f5]">
                <input
                  type="checkbox"
                  checked={wipeConfirmed}
                  onChange={(e) => setWipeConfirmed(e.target.checked)}
                  className="accent-[#d95c5c]"
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
                  className="steel-btn-secondary rounded-xl px-4 py-2 text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={wiping || !wipeConfirmed || wipePin.length !== 6}
                  className="steel-btn-danger rounded-xl px-5 py-2 text-xs font-bold"
                >
                  {wiping ? 'جاري المسح...' : 'تنفيذ المسح النهائي'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};
