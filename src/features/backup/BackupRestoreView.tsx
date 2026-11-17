import React, { useRef, useState } from 'react';
import { Download, Upload, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  createEncryptedBackupEnvelope,
  decryptBackupEnvelope,
  encryptVaultItemInput,
  validateBackupEnvelopeFormat,
} from '../../services/crypto';
import type {
  BackupEnvelope,
  Category,
  DecryptedBackupData,
  VaultItem,
} from '../../types/aman';
import { normalizeCategory, normalizeVaultItem } from '../../utils/normalize';
import type { BatchImportRequest } from '../../adapters/AmanDataAdapter';

interface BackupRestoreViewProps {
  items: VaultItem[];
  categories: Category[];
  masterKey: CryptoKey;
  onBackupCreated: () => Promise<void>;
  onCommitRestore: (payload: BatchImportRequest) => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'warning', title: string, description?: string) => void;
}

export const BackupRestoreView: React.FC<BackupRestoreViewProps> = ({
  items,
  categories,
  masterKey,
  onBackupCreated,
  onCommitRestore,
  onNotify,
}) => {
  const [backupPass, setBackupPass] = useState('');
  const [backupPassConfirm, setBackupPassConfirm] = useState('');
  const [exporting, setExporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [stagedEnvelope, setStagedEnvelope] = useState<BackupEnvelope | null>(null);
  const [stagedFileName, setStagedFileName] = useState('');
  const [restorePass, setRestorePass] = useState('');
  const [decryptedPreview, setDecryptedPreview] = useState<DecryptedBackupData | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [restoring, setRestoring] = useState(false);

  const handleExportBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (backupPass.length < 6) {
      onNotify('warning', 'كلمة مرور النسخة الاحتياطية قصيرة', 'استخدم 6 أحرف/أرقام على الأقل');
      return;
    }
    if (backupPass !== backupPassConfirm) {
      onNotify('error', 'كلمتا مرور النسخة الاحتياطية غير متطابقتين');
      return;
    }

    setExporting(true);
    try {
      const envelope = await createEncryptedBackupEnvelope(
        {
          exportedAt: new Date().toISOString(),
          categories,
          items,
        },
        backupPass
      );

      const blob = new Blob([JSON.stringify(envelope, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `aman-backup-${new Date().toISOString().slice(0, 10)}.aman`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setBackupPass('');
      setBackupPassConfirm('');
      await onBackupCreated();
      onNotify('success', 'تم إنشاء النسخة الاحتياطية المشفرة (.aman)');
    } catch (err) {
      onNotify(
        'error',
        'فشل إنشاء النسخة الاحتياطية',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDecryptedPreview(null);
    setRestorePass('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (!validateBackupEnvelopeFormat(parsed)) {
        throw new Error('تنسيق ملف .aman غير صالح أو غير مدعوم');
      }
      setStagedEnvelope(parsed);
      setStagedFileName(file.name);
    } catch (err) {
      setStagedEnvelope(null);
      setStagedFileName('');
      onNotify(
        'error',
        'ملف غير صالح',
        err instanceof Error ? err.message : 'تعذر قراءة ملف النسخة الاحتياطية'
      );
    } finally {
      e.target.value = '';
    }
  };

  const handleDecryptPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stagedEnvelope || !restorePass) return;
    try {
      const decoded = await decryptBackupEnvelope(stagedEnvelope, restorePass);
      setDecryptedPreview(decoded);
    } catch (err) {
      onNotify(
        'error',
        'تعذر فك التشفير',
        err instanceof Error ? err.message : 'كلمة مرور النسخة الاحتياطية غير صحيحة'
      );
    }
  };

  const handleConfirmRestore = async () => {
    if (!decryptedPreview) return;
    setRestoring(true);
    try {
      const validCategories = decryptedPreview.categories
        .map((c) => normalizeCategory(c))
        .filter((c): c is Category => c !== null);

      const encryptedItems = [];
      for (const rawItem of decryptedPreview.items) {
        const normalized = normalizeVaultItem(rawItem);
        encryptedItems.push(await encryptVaultItemInput(masterKey, normalized));
      }

      await onCommitRestore({
        items: encryptedItems,
        categories: validCategories.map((c) => ({ id: c.id, name: c.name })),
        replaceExisting,
        source: 'aman_restore',
      });

      setStagedEnvelope(null);
      setStagedFileName('');
      setRestorePass('');
      setDecryptedPreview(null);
      onNotify('success', 'تمت الاستعادة الذرية للنسخة الاحتياطية بنجاح');
    } catch (err) {
      onNotify(
        'error',
        'فشلت الاستعادة وتم التراجع للحفاظ على البيانات',
        err instanceof Error ? err.message : 'تعذر الحفظ على الخادم'
      );
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-[#f2f5f5]">النسخ الاحتياطي والاستعادة المشفرة (.aman)</h2>
        <p className="mt-1 text-sm text-[#c2cccf]">
          تشفير PBKDF2-SHA256 و AES-256-GCM متوافق مع صيغة AMAN القياسية (2.0.0)
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Export Backup */}
        <div className="steel-plate rounded-2xl p-1.5">
          <div className="flex items-center gap-2.5 px-4 py-3">
            <div className="steel-recess flex h-9 w-9 items-center justify-center rounded-xl text-[#76e5ff]">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#161e21]">تصدير نسخة مشفرة</h3>
              <p className="text-xs font-semibold text-[#2d3a3f]">
                تحتوي على {items.length} عنصر و {categories.length} تصنيف
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => void handleExportBackup(e)}
            className="steel-modal-body space-y-4 rounded-xl p-5"
          >
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#c2cccf]">
                كلمة مرور حماية النسخة *
              </label>
              <input
                type="password"
                required
                value={backupPass}
                onChange={(e) => setBackupPass(e.target.value)}
                placeholder="6 خانات أو أكثر"
                className="steel-input w-full rounded-xl px-3.5 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#c2cccf]">
                تأكيد كلمة المرور *
              </label>
              <input
                type="password"
                required
                value={backupPassConfirm}
                onChange={(e) => setBackupPassConfirm(e.target.value)}
                placeholder="أعد إدخال كلمة المرور"
                className="steel-input w-full rounded-xl px-3.5 py-2.5 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={exporting}
              className="steel-btn-primary w-full rounded-xl py-2.5 text-sm font-extrabold"
            >
              {exporting ? 'جاري التشفير والتنزيل...' : 'تنزيل ملف النسخة (.aman)'}
            </button>
          </form>
        </div>

        {/* Restore Backup */}
        <div className="steel-plate rounded-2xl p-1.5">
          <div className="flex items-center gap-2.5 px-4 py-3">
            <div className="steel-recess flex h-9 w-9 items-center justify-center rounded-xl text-[#36e5a4]">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#161e21]">استعادة من ملف .aman</h3>
              <p className="text-xs font-semibold text-[#2d3a3f]">معاينة وفحص قبل التنفيذ الذري الكامل</p>
            </div>
          </div>

          <div className="steel-modal-body space-y-4 rounded-xl p-5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".aman,application/json"
              onChange={(e) => void handleFileSelected(e)}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="steel-recess-deep w-full rounded-xl border border-dashed border-[#c2cccf]/35 py-4 text-sm font-semibold text-[#f2f5f5] transition hover:border-[#58d9ff]/70 hover:text-[#76e5ff]"
            >
              {stagedFileName ? `الملف المختار: ${stagedFileName}` : 'اختيار ملف .aman للاستعادة'}
            </button>

            {stagedEnvelope && !decryptedPreview ? (
              <form onSubmit={(e) => void handleDecryptPreview(e)} className="space-y-3 pt-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#36e5a4]">
                  <ShieldCheck className="h-4 w-4" />
                  <span>تم التحقق من صيغة {stagedEnvelope.format} (الإصدار {stagedEnvelope.version})</span>
                </div>
                <input
                  type="password"
                  required
                  value={restorePass}
                  onChange={(e) => setRestorePass(e.target.value)}
                  placeholder="أدخل كلمة مرور فك التشفير..."
                  className="steel-input w-full rounded-xl px-3.5 py-2.5 text-sm"
                />
                <button
                  type="submit"
                  className="steel-btn-secondary w-full rounded-xl py-2.5 text-sm font-bold text-[#76e5ff]"
                >
                  فك التشفير ومعاينة المحتوى
                </button>
              </form>
            ) : null}

            {decryptedPreview ? (
              <div className="steel-recess space-y-3 rounded-xl border-[#36e5a4]/40 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-[#36e5a4]">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>جاهز للاستعادة</span>
                </div>
                <p className="text-xs text-[#f2f5f5]">
                  العناصر: {decryptedPreview.items.length} · التصنيفات: {decryptedPreview.categories.length}
                </p>

                <label className="flex cursor-pointer items-center gap-2 text-xs text-[#c2cccf]">
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={(e) => setReplaceExisting(e.target.checked)}
                    className="accent-[#58d9ff]"
                  />
                  <span>استبدال محتويات الخزنة الحالية بالكامل (يتم ضمن معاملة ذرية)</span>
                </label>

                {replaceExisting ? (
                  <div className="steel-recess-deep flex items-start gap-2 rounded-lg border-[#d7aa45]/45 p-2.5 text-[11px] text-[#f0c761]">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>في حال فشل أي خطوة أثناء الحفظ سيتم التراجع التلقائي دون فقدان البيانات.</span>
                  </div>
                ) : null}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDecryptedPreview(null);
                      setStagedEnvelope(null);
                      setStagedFileName('');
                    }}
                    className="steel-btn-secondary flex-1 rounded-xl py-2 text-xs font-bold"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    disabled={restoring}
                    onClick={() => void handleConfirmRestore()}
                    className="steel-btn-emerald flex-1 rounded-xl py-2 text-xs font-bold"
                  >
                    {restoring ? 'جاري التنفيذ...' : 'تأكيد الاستعادة'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
