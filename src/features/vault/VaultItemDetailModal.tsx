import React, { useState } from 'react';
import {
  X,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Star,
  Pencil,
  Files,
  Trash2,
  KeyRound,
} from 'lucide-react';
import type { Category, SecretEntry, VaultItem } from '../../types/aman';
import { formatArabicDate } from '../../utils/normalize';

interface VaultItemDetailModalProps {
  item: VaultItem | null;
  categories: Category[];
  onClose: () => void;
  onEdit: (item: VaultItem) => void;
  onDuplicate: (item: VaultItem) => void;
  onDelete: (item: VaultItem) => void;
  onToggleFavorite: (item: VaultItem) => void;
  onCopySecret: (value: string, label: string, sensitive?: boolean) => void;
  onOpenUrl: (url: string) => void;
}

export const VaultItemDetailModal: React.FC<VaultItemDetailModalProps> = ({
  item,
  categories,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleFavorite,
  onCopySecret,
  onOpenUrl,
}) => {
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});

  if (!item) return null;

  const categoryName = item.categoryId
    ? categories.find((c) => c.id === item.categoryId)?.name
    : undefined;

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderSecretGroup = (title: string, entries: SecretEntry[]) => {
    if (entries.length === 0) return null;
    return (
      <div className="space-y-2 border-t border-white/8 pt-4">
        <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#e5b440]">
          <KeyRound className="h-3.5 w-3.5" />
          {title}
        </h4>
        <div className="space-y-2">
          {entries.map((entry) => {
            const revealed = Boolean(revealedKeys[entry.id]);
            return (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/8 bg-[#0a0e0e] px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[#93a19f]">{entry.label || 'قيمة سرية'}</p>
                  <p
                    dir="ltr"
                    className="font-mono-tabular mt-0.5 truncate text-left text-sm text-[#f3f6f5]"
                  >
                    {revealed ? entry.value : '••••••••••••••••••••'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleReveal(entry.id)}
                    aria-label={revealed ? 'إخفاء' : 'إظهار'}
                    className="rounded-lg p-2 text-[#93a19f] transition hover:bg-white/5 hover:text-white"
                  >
                    {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onCopySecret(entry.value, entry.label || title, true)}
                    aria-label="نسخ"
                    className="rounded-lg p-2 text-[#93a19f] transition hover:bg-white/5 hover:text-[#ffd365]"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101616] shadow-2xl">
        {/* Top Bar */}
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold text-[#f3f6f5]">{item.title}</h2>
            <p className="mt-1 text-xs text-[#8b9997]">
              {categoryName || 'بدون تصنيف'} · آخر تحديث {formatArabicDate(item.updatedAt)}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onToggleFavorite(item)}
              aria-label="تبديل المفضلة"
              className={`rounded-lg p-2 transition ${
                item.isFavorite
                  ? 'text-[#ffd365] hover:bg-white/5'
                  : 'text-[#8b9997] hover:bg-white/5 hover:text-white'
              }`}
            >
              <Star className={`h-4 w-4 ${item.isFavorite ? 'fill-current' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="rounded-lg p-2 text-[#8b9997] transition hover:bg-white/5 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {item.username ? (
            <div className="flex items-center justify-between rounded-xl border border-white/8 bg-[#0a0e0e] px-4 py-3">
              <div>
                <p className="text-xs text-[#8b9997]">اسم المستخدم</p>
                <p dir="ltr" className="mt-0.5 text-left text-sm font-medium text-white">
                  {item.username}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onCopySecret(item.username!, 'اسم المستخدم', false)}
                className="rounded-lg p-2 text-[#93a19f] hover:bg-white/5 hover:text-[#ffd365]"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          {item.email ? (
            <div className="flex items-center justify-between rounded-xl border border-white/8 bg-[#0a0e0e] px-4 py-3">
              <div>
                <p className="text-xs text-[#8b9997]">البريد الإلكتروني</p>
                <p dir="ltr" className="mt-0.5 text-left text-sm font-medium text-white">
                  {item.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onCopySecret(item.email!, 'البريد الإلكتروني', false)}
                className="rounded-lg p-2 text-[#93a19f] hover:bg-white/5 hover:text-[#ffd365]"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          {item.password ? (
            <div className="flex items-center justify-between rounded-xl border border-white/8 bg-[#0a0e0e] px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[#8b9997]">كلمة المرور</p>
                <p dir="ltr" className="font-mono-tabular mt-0.5 truncate text-left text-sm text-white">
                  {revealedKeys['__password'] ? item.password : '••••••••••••••••••••'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleReveal('__password')}
                  className="rounded-lg p-2 text-[#93a19f] hover:bg-white/5 hover:text-white"
                >
                  {revealedKeys['__password'] ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onCopySecret(item.password!, 'كلمة المرور', true)}
                  className="rounded-lg p-2 text-[#93a19f] hover:bg-white/5 hover:text-[#ffd365]"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          {item.urls.length > 0 ? (
            <div className="space-y-2 border-t border-white/8 pt-4">
              <h4 className="text-xs font-bold text-[#93a19f]">الروابط</h4>
              <div className="space-y-2">
                {item.urls.map((url, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-[#0a0e0e] px-4 py-2.5"
                  >
                    <span dir="ltr" className="truncate text-left text-sm text-emerald-300">
                      {url}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenUrl(url)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      فتح آمن
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {renderSecretGroup('مفاتيح API', item.apiKeys)}
          {renderSecretGroup('الرموز (Tokens)', item.tokens)}
          {renderSecretGroup('المفاتيح السرية', item.secretKeys)}
          {renderSecretGroup('مفاتيح الترخيص', item.licenseKeys)}
          {renderSecretGroup('الشهادات', item.certificates)}

          {item.notes ? (
            <div className="space-y-1.5 border-t border-white/8 pt-4">
              <h4 className="text-xs font-bold text-[#93a19f]">الملاحظات</h4>
              <div className="whitespace-pre-wrap rounded-xl border border-white/8 bg-[#0a0e0e] p-3.5 text-sm text-[#dce3e1]">
                {item.notes}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 px-6 py-4">
          <button
            type="button"
            onClick={() => onDelete(item)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs font-bold text-red-300 transition hover:bg-red-500/20"
          >
            <Trash2 className="h-4 w-4" />
            حذف
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onDuplicate(item)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-[#dce3e1] transition hover:bg-white/5"
            >
              <Files className="h-4 w-4" />
              تكرار (نسخة)
            </button>
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#e5b440] px-4 py-2 text-xs font-bold text-[#0b0e0e] transition hover:bg-[#ffd365]"
            >
              <Pencil className="h-4 w-4" />
              تعديل
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
