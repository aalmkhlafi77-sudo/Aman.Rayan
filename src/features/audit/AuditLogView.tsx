import React, { useMemo, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import type { AuditAction, AuditEvent } from '../../types/aman';
import { formatArabicDate } from '../../utils/normalize';

interface AuditLogViewProps {
  events: AuditEvent[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}

const ACTION_LABELS: Record<AuditAction, string> = {
  login_success: 'دخول ناجح',
  login_failed: 'محاولة فاشلة',
  lock: 'قفل الخزنة',
  logout: 'تسجيل خروج',
  pin_changed: 'تحديث الرمز',
  create: 'إضافة عنصر',
  update: 'تعديل عنصر',
  delete: 'حذف عنصر',
  backup: 'نسخ احتياطي',
  restore: 'استعادة نسخة',
  excel_export: 'تصدير Excel',
  excel_import: 'استيراد Excel',
  wipe: 'مسح الخزنة',
};

export const AuditLogView: React.FC<AuditLogViewProps> = ({
  events,
  loading,
  onRefresh,
}) => {
  const [filterAction, setFilterAction] = useState<'all' | AuditAction>('all');

  const filtered = useMemo(() => {
    if (filterAction === 'all') return events;
    return events.filter((e) => e.action === filterAction);
  }, [events, filterAction]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-[#f2f5f5]">سجل التدقيق الأمني</h2>
          <p className="mt-1 text-sm text-[#c2cccf]">
            يسجّل الأحداث الأمنية والإدارية فقط دون تسجيل أي كلمات مرور أو مفاتيح أو رمز PIN
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value as 'all' | AuditAction)}
            className="steel-input rounded-xl px-3 py-2 text-xs font-semibold"
          >
            <option value="all">جميع الأحداث</option>
            {Object.entries(ACTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={loading}
            className="steel-btn-secondary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </button>
        </div>
      </div>

      <div className="steel-plate rounded-2xl p-1.5">
        <div className="steel-module-dark overflow-hidden rounded-xl">
          {filtered.length === 0 ? (
            <div className="steel-recess flex flex-col items-center justify-center rounded-xl py-14 text-center">
              <History className="mb-3 h-8 w-8 text-[#94a4a9]" />
              <p className="text-sm font-semibold text-[#c2cccf]">لا توجد أحداث مسجلة</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] border-collapse text-right text-sm">
                <thead className="steel-table-head text-xs">
                  <tr>
                    <th className="px-4 py-3 font-extrabold">الحدث</th>
                    <th className="px-4 py-3 font-extrabold">التفاصيل</th>
                    <th className="px-4 py-3 font-extrabold">التاريخ والوقت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/8">
                  {filtered.map((ev) => (
                    <tr key={ev.id} className="steel-table-row">
                      <td
                        className={`px-4 py-3 text-xs font-bold ${
                          ev.action === 'login_failed' || ev.action === 'wipe'
                            ? 'text-[#d95c5c]'
                            : ev.action === 'login_success' || ev.action === 'restore'
                              ? 'text-[#36e5a4]'
                              : 'text-[#76e5ff]'
                        }`}
                      >
                        {ACTION_LABELS[ev.action] || ev.action}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#f2f5f5]">{ev.summary}</td>
                      <td className="font-mono-tabular px-4 py-3 text-xs text-[#94a4a9]">
                        {formatArabicDate(ev.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
