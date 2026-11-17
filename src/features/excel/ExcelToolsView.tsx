import React, { useRef, useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { encryptVaultItemInput } from '../../services/crypto';
import {
  exportVaultToXlsx,
  parseAndValidateXlsx,
  type ExcelImportPreview,
} from '../../services/excel';
import type { Category, EncryptedVaultItemInput, VaultItem } from '../../types/aman';
import { normalizeArabic } from '../../utils/normalize';
import type { BatchImportRequest } from '../../adapters/AmanDataAdapter';

interface ExcelToolsViewProps {
  items: VaultItem[];
  categories: Category[];
  masterKey: CryptoKey;
  onExported: () => Promise<void>;
  onCommitImport: (payload: BatchImportRequest) => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'warning', title: string, description?: string) => void;
}

export const ExcelToolsView: React.FC<ExcelToolsViewProps> = ({
  items,
  categories,
  masterKey,
  onExported,
  onCommitImport,
  onNotify,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<ExcelImportPreview | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [committing, setCommitting] = useState(false);

  const handleExport = async () => {
    try {
      exportVaultToXlsx(items, categories);
      await onExported();
      onNotify('success', 'تم تصدير ملف Excel (.xlsx) بنجاح');
    } catch (err) {
      onNotify(
        'error',
        'تعذر تصدير ملف Excel',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const handleSelectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseAndValidateXlsx(file, items, categories);
      setPreview(parsed);
    } catch (err) {
      setPreview(null);
      onNotify(
        'error',
        'تعذر قراءة ملف Excel',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      e.target.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!preview) return;
    const rowsToImport = preview.rows.filter(
      (r) =>
        r.itemInput &&
        (r.status === 'valid' || (!skipDuplicates && r.status === 'duplicate'))
    );

    if (rowsToImport.length === 0) {
      onNotify('warning', 'لا توجد صفوف صالحة للاستيراد');
      return;
    }

    setCommitting(true);
    try {
      // Prepare new category IDs deterministically before atomic commit
      const newCategoryEntries = preview.newCategories.map((name) => ({
        id: crypto.randomUUID(),
        name,
      }));
      const newCatMap = new Map(
        newCategoryEntries.map((c) => [normalizeArabic(c.name), c.id])
      );

      const encryptedItems: EncryptedVaultItemInput[] = [];
      for (const row of rowsToImport) {
        const input = { ...row.itemInput! };
        if (!input.categoryId && row.categoryName) {
          input.categoryId = newCatMap.get(normalizeArabic(row.categoryName));
        }
        encryptedItems.push(await encryptVaultItemInput(masterKey, input));
      }

      await onCommitImport({
        items: encryptedItems,
        categories: newCategoryEntries,
        replaceExisting: false,
        source: 'excel',
      });

      setPreview(null);
      onNotify('success', `تم استيراد ${encryptedItems.length} عنصر من Excel بنجاح`);
    } catch (err) {
      onNotify(
        'error',
        'فشل الاستيراد وتم التراجع لحماية البيانات',
        err instanceof Error ? err.message : 'تعذر الحفظ على الخادم'
      );
    } finally {
      setCommitting(false);
    }
  };

  const importableCount = preview
    ? preview.rows.filter(
        (r) => r.status === 'valid' || (!skipDuplicates && r.status === 'duplicate')
      ).length
    : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#f3f6f5]">أدوات Excel الحقيقية (.xlsx)</h2>
        <p className="mt-1 text-sm text-[#8b9997]">
          تصدير واستيراد مصنفات .xlsx مع فحص الأعمدة والتكرار والمعاينة قبل الحفظ الذري
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* Export Card */}
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-[#101616] p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-400">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-white">تصدير الخزنة إلى Excel (.xlsx)</h3>
            </div>
            <p className="text-xs leading-relaxed text-[#93a19f]">
              يتم تصدير جميع العناصر ({items.length}) والتصنيفات بصيغة مصنف Excel قياسي (.xlsx)
              متوافق مع إعادة الاستيراد.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleExport()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#e5b440] px-5 py-2.5 text-sm font-bold text-[#0b0e0e] transition hover:bg-[#ffd365]"
          >
            <Download className="h-4 w-4" />
            تصدير ملف .xlsx
          </button>
        </div>

        {/* Import Picker Card */}
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-[#101616] p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e5b440]/12 text-[#e5b440]">
                <Upload className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-white">استيراد من ملف Excel (.xlsx)</h3>
            </div>
            <p className="text-xs leading-relaxed text-[#93a19f]">
              لن يتم حفظ أي سجل في قاعدة البيانات قبل فحص الملف ومعاينة النتائج وتأكيدك الصريح.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => void handleSelectFile(e)}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#0a0e0e] px-5 py-2.5 text-sm font-bold text-[#f3f6f5] transition hover:border-[#e5b440]/60 hover:text-[#ffd365]"
          >
            <Upload className="h-4 w-4" />
            اختيار ملف .xlsx للفحص
          </button>
        </div>
      </div>

      {/* Validation & Preview Stage */}
      {preview ? (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-[#101616] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 pb-4">
            <div>
              <h3 className="text-base font-bold text-white">
                معاينة وفحص الملف: {preview.fileName}
              </h3>
              <p className="mt-1 text-xs text-[#93a19f]">
                إجمالي الصفوف: {preview.totalRows} · صالح: {preview.validCount} · مكرر:{' '}
                {preview.duplicateCount} · مرفوض/غير صالح: {preview.invalidCount}
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#dce3e1]">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                className="accent-[#e5b440]"
              />
              <span>تجاهل العناصر المكررة تلقائياً</span>
            </label>
          </div>

          {preview.missingColumns.length > 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/35 bg-red-500/10 p-3 text-xs font-semibold text-red-300">
              <XCircle className="h-4 w-4 shrink-0" />
              <span>أعمدة مطلوبة مفقودة: {preview.missingColumns.join('، ')}</span>
            </div>
          ) : null}

          <div className="max-h-80 overflow-x-auto overflow-y-auto rounded-xl border border-white/8">
            <table className="w-full min-w-[640px] border-collapse text-right text-xs">
              <thead className="sticky top-0 bg-[#0a0e0e] text-[#93a19f]">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">الصف</th>
                  <th className="px-3 py-2.5 font-semibold">الحالة</th>
                  <th className="px-3 py-2.5 font-semibold">العنوان</th>
                  <th className="px-3 py-2.5 font-semibold">التصنيف</th>
                  <th className="px-3 py-2.5 font-semibold">بيانات حساسة</th>
                  <th className="px-3 py-2.5 font-semibold">ملاحظة الفحص</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {preview.rows.map((row) => (
                  <tr key={row.rowNumber} className="hover:bg-white/[0.02]">
                    <td className="font-mono-tabular px-3 py-2.5 text-[#93a19f]">
                      {row.rowNumber}
                    </td>
                    <td className="px-3 py-2.5">
                      {row.status === 'valid' ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          صالح
                        </span>
                      ) : row.status === 'duplicate' ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          مكرر
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-red-400">
                          <XCircle className="h-3.5 w-3.5" />
                          غير صالح
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-[#f3f6f5]">{row.title}</td>
                    <td className="px-3 py-2.5 text-[#b9c4c2]">{row.categoryName || '—'}</td>
                    <td className="px-3 py-2.5 text-[#8b9997]">
                      {row.hasPassword || row.secretsCount > 0
                        ? `محمية (••••••••${row.secretsCount > 0 ? ` + ${row.secretsCount} سر` : ''})`
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-[#93a19f]">
                      {row.reason || 'جاهز للتشفير والحفظ'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPreview(null)}
              disabled={committing}
              className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-[#b9c4c2] hover:bg-white/5"
            >
              إلغاء المعاينة
            </button>
            <button
              type="button"
              disabled={committing || importableCount === 0}
              onClick={() => void handleConfirmImport()}
              className="rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-bold text-[#05140e] transition hover:bg-emerald-400 disabled:opacity-45"
            >
              {committing
                ? 'جاري التشفير والحفظ الذري...'
                : `تأكيد واستيراد (${importableCount} عنصر)`}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
