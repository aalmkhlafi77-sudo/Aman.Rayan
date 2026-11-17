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
          <h2 className="text-xl font-bold text-[#f3f6f5]">سجل التدقيق الأمني</h2>
          <p className="mt-1 text-sm text-[#8b9997]">
            يسجّل الأحداث الأمنية والإدارية فقط دون تسجيل أي كلمات مرور أو مفاتيح أو رمز PIN
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value as 'all' | AuditAction)}
            className="rounded-xl border border-white/10 bg-[#101616] px-3 py-2 text-xs font-semibold text-white outline-none"
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
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#101616] px-3.5 py-2 text-xs font-bold text-[#dce3e1] transition hover:bg-white/5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#101616]">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <History className="mb-3 h-8 w-8 text-[#5d6b69]" />
            <p className="text-sm font-semibold text-[#b9c4c2]">لا توجد أحداث مسجلة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] border-collapse text-right text-sm">
              <thead className="border-b border-white/8 bg-[#0b1010] text-xs text-[#8b9997]">
                <tr>
                  <th className="px-4 py-3 font-semibold">الحدث</th>
                  <th className="px-4 py-3 font-semibold">التفاصيل</th>
                  <th className="px-4 py-3 font-semibold">التاريخ والوقت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {filtered.map((ev) => (
                  <tr key={ev.id} className="hover:bg-white/[0.02]">
                    <td
                      className={`px-4 py-3 text-xs font-bold ${
                        ev.action === 'login_failed' || ev.action === 'wipe'
                          ? 'text-red-400'
                          : ev.action === 'login_success' || ev.action === 'restore'
                            ? 'text-emerald-400'
                            : 'text-[#ffd365]'
                      }`}
                    >
                      {ACTION_LABELS[ev.action] || ev.action}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#dce3e1]">{ev.summary}</td>
                    <td className="font-mono-tabular px-4 py-3 text-xs text-[#8b9997]">
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
  );
};
