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
  const [exportWarningConfirmed, setExportWarningConfirmed] = useState(false);

  const handleExport = async () => {
    if (!exportWarningConfirmed) {
      onNotify(
        'warning',
        'يرجى تأكيد التحذير الأمني أولاً',
        'ملف Excel (.xlsx) المصدّر غير مشفر ويحتوي على كلمات المرور والمفاتيح كنص مقروء.'
      );
      return;
    }
    try {
      exportVaultToXlsx(items, categories);
      setExportWarningConfirmed(false);
      await onExported();
      onNotify('success', 'تم تصدير ملف Excel (.xlsx) محلياً بنجاح');
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
        <h2 className="text-xl font-extrabold text-[#f2f5f5]">أدوات Excel الحقيقية (.xlsx)</h2>
        <p className="mt-1 text-sm text-[#c2cccf]">
          تصدير واستيراد مصنفات .xlsx مع فحص الأعمدة والتكرار والمعاينة قبل الحفظ الذري
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* Export Card */}
        <div className="steel-plate flex flex-col rounded-2xl p-1.5">
          <div className="flex items-center gap-2.5 px-4 py-3">
            <div className="steel-recess flex h-9 w-9 items-center justify-center rounded-xl text-[#36e5a4]">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <h3 className="text-base font-extrabold text-[#161e21]">تصدير الخزنة إلى Excel (.xlsx)</h3>
          </div>

          <div className="steel-modal-body flex flex-1 flex-col justify-between gap-4 rounded-xl p-5">
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-[#c2cccf]">
                يتم توليد المصنف ({items.length} عنصر) محلياً داخل المتصفح بصيغة (.xlsx) دون رفع أي
                بيانات إلى الخادم.
              </p>
              <div className="steel-recess-deep rounded-xl border-[#d7aa45]/45 p-3 text-[11px] leading-relaxed text-[#f0c761]">
                <strong className="mb-0.5 block font-bold text-[#f0c761]">تحذير أمني هام:</strong>
                ملف Excel (.xlsx) غير مشفر ويحتوي على كلمات المرور والمفاتيح كنص مقروء. للنسخ
                الاحتياطي الآمن استخدم صيغة (.aman) المشفرة.
              </div>
              <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs font-semibold text-[#f2f5f5]">
                <input
                  type="checkbox"
                  checked={exportWarningConfirmed}
                  onChange={(e) => setExportWarningConfirmed(e.target.checked)}
                  className="accent-[#58d9ff]"
                />
                <span>أفهم أن ملف Excel غير مشفر وسأحفظه في مكان آمن</span>
              </label>
            </div>

            <button
              type="button"
              disabled={!exportWarningConfirmed}
              onClick={() => void handleExport()}
              className="steel-btn-primary inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-extrabold"
            >
              <Download className="h-4 w-4" />
              تصدير ملف .xlsx
            </button>
          </div>
        </div>

        {/* Import Picker Card */}
        <div className="steel-plate flex flex-col rounded-2xl p-1.5">
          <div className="flex items-center gap-2.5 px-4 py-3">
            <div className="steel-recess flex h-9 w-9 items-center justify-center rounded-xl text-[#76e5ff]">
              <Upload className="h-5 w-5" />
            </div>
            <h3 className="text-base font-extrabold text-[#161e21]">استيراد من ملف Excel (.xlsx)</h3>
          </div>

          <div className="steel-modal-body flex flex-1 flex-col justify-between gap-4 rounded-xl p-5">
            <p className="text-xs leading-relaxed text-[#c2cccf]">
              لن يتم حفظ أي سجل في قاعدة البيانات قبل فحص الملف ومعاينة النتائج وتأكيدك الصريح.
            </p>

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
              className="steel-btn-secondary inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-[#f2f5f5]"
            >
              <Upload className="h-4 w-4 text-[#76e5ff]" />
              اختيار ملف .xlsx للفحص
            </button>
          </div>
        </div>
      </div>

      {/* Validation & Preview Stage */}
      {preview ? (
        <div className="steel-plate rounded-2xl p-1.5">
          <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
            <div>
              <h3 className="text-base font-extrabold text-[#161e21]">
                معاينة وفحص الملف: {preview.fileName}
              </h3>
              <p className="mt-0.5 text-xs font-semibold text-[#2d3a3f]">
                إجمالي الصفوف: {preview.totalRows} · صالح: {preview.validCount} · مكرر:{' '}
                {preview.duplicateCount} · مرفوض/غير صالح: {preview.invalidCount}
              </p>
            </div>
            <label className="steel-recess flex cursor-pointer items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold text-[#f2f5f5]">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                className="accent-[#58d9ff]"
              />
              <span>تجاهل العناصر المكررة تلقائياً</span>
            </label>
          </div>

          <div className="steel-modal-body space-y-4 rounded-xl p-4 sm:p-5">
            {preview.missingColumns.length > 0 ? (
              <div className="steel-recess-deep flex items-center gap-2 rounded-xl border-[#d95c5c]/55 p-3 text-xs font-semibold text-[#f4b8b8]">
                <XCircle className="h-4 w-4 shrink-0 text-[#d95c5c]" />
                <span>أعمدة مطلوبة مفقودة: {preview.missingColumns.join('، ')}</span>
              </div>
            ) : null}

            <div className="steel-plate rounded-xl p-1">
              <div className="steel-module-dark max-h-80 overflow-x-auto overflow-y-auto rounded-lg">
                <table className="w-full min-w-[640px] border-collapse text-right text-xs">
                  <thead className="steel-table-head sticky top-0 z-10 font-bold">
                    <tr>
                      <th className="px-3 py-2.5 font-extrabold">الصف</th>
                      <th className="px-3 py-2.5 font-extrabold">الحالة</th>
                      <th className="px-3 py-2.5 font-extrabold">العنوان</th>
                      <th className="px-3 py-2.5 font-extrabold">التصنيف</th>
                      <th className="px-3 py-2.5 font-extrabold">بيانات حساسة</th>
                      <th className="px-3 py-2.5 font-extrabold">ملاحظة الفحص</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/8">
                    {preview.rows.map((row) => (
                      <tr key={row.rowNumber} className="steel-table-row">
                        <td className="font-mono-tabular px-3 py-2.5 text-[#94a4a9]">
                          {row.rowNumber}
                        </td>
                        <td className="px-3 py-2.5">
                          {row.status === 'valid' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-[#36e5a4]">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              صالح
                            </span>
                          ) : row.status === 'duplicate' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-[#f0c761]">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              مكرر
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-semibold text-[#d95c5c]">
                              <XCircle className="h-3.5 w-3.5" />
                              غير صالح
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-[#f2f5f5]">{row.title}</td>
                        <td className="px-3 py-2.5 text-[#c2cccf]">{row.categoryName || '—'}</td>
                        <td className="px-3 py-2.5 text-[#94a4a9]">
                          {row.hasPassword || row.secretsCount > 0
                            ? `محمية (••••••••${row.secretsCount > 0 ? ` + ${row.secretsCount} سر` : ''})`
                            : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-[#c2cccf]">
                          {row.reason || 'جاهز للتشفير والحفظ'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setPreview(null)}
                disabled={committing}
                className="steel-btn-secondary rounded-xl px-4 py-2 text-xs font-bold"
              >
                إلغاء المعاينة
              </button>
              <button
                type="button"
                disabled={committing || importableCount === 0}
                onClick={() => void handleConfirmImport()}
                className="steel-btn-emerald rounded-xl px-5 py-2.5 text-xs font-bold"
              >
                {committing
                  ? 'جاري التشفير والحفظ الذري...'
                  : `تأكيد واستيراد (${importableCount} عنصر)`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
