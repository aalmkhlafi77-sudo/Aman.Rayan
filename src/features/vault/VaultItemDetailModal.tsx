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
      <div className="space-y-2 border-t border-white/10 pt-4">
        <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#76e5ff]">
          <KeyRound className="h-3.5 w-3.5" />
          {title}
        </h4>
        <div className="space-y-2">
          {entries.map((entry) => {
            const revealed = Boolean(revealedKeys[entry.id]);
            return (
              <div
                key={entry.id}
                className="steel-recess-deep flex flex-wrap items-center justify-between gap-2 rounded-xl px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[#94a4a9]">{entry.label || 'قيمة سرية'}</p>
                  <p
                    dir="ltr"
                    className="font-mono-tabular mt-0.5 truncate text-left text-sm text-[#f2f5f5]"
                  >
                    {revealed ? entry.value : '••••••••••••••••••••'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleReveal(entry.id)}
                    aria-label={revealed ? 'إخفاء' : 'إظهار'}
                    className="rounded-lg p-2 text-[#c2cccf] transition hover:bg-white/10 hover:text-[#f2f5f5]"
                  >
                    {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onCopySecret(entry.value, entry.label || title, true)}
                    aria-label="نسخ"
                    className="rounded-lg p-2 text-[#c2cccf] transition hover:bg-white/10 hover:text-[#76e5ff]"
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
      <div className="steel-modal-shell flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl p-1.5 shadow-2xl">
        {/* Raised Steel Title Strip */}
        <div className="flex items-start justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-extrabold text-[#161e21]">{item.title}</h2>
            <p className="mt-0.5 text-xs font-semibold text-[#2d3a3f]">
              {categoryName || 'بدون تصنيف'} · آخر تحديث {formatArabicDate(item.updatedAt)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onToggleFavorite(item)}
              aria-label="تبديل المفضلة"
              className={`rounded-lg p-2 transition ${
                item.isFavorite
                  ? 'text-[#d7aa45] drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]'
                  : 'text-[#2d3a3f] hover:bg-black/10 hover:text-[#161e21]'
              }`}
            >
              <Star className={`h-4 w-4 ${item.isFavorite ? 'fill-current' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="rounded-lg p-2 text-[#2d3a3f] transition hover:bg-black/10 hover:text-[#161e21]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Dark Recessed Body */}
        <div className="steel-modal-body flex-1 space-y-4 overflow-y-auto rounded-t-xl p-5">
          {item.username ? (
            <div className="steel-recess-deep flex items-center justify-between rounded-xl px-4 py-3">
              <div>
                <p className="text-xs text-[#94a4a9]">اسم المستخدم</p>
                <p dir="ltr" className="mt-0.5 text-left text-sm font-medium text-[#f2f5f5]">
                  {item.username}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onCopySecret(item.username!, 'اسم المستخدم', false)}
                className="rounded-lg p-2 text-[#c2cccf] transition hover:bg-white/10 hover:text-[#76e5ff]"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          {item.email ? (
            <div className="steel-recess-deep flex items-center justify-between rounded-xl px-4 py-3">
              <div>
                <p className="text-xs text-[#94a4a9]">البريد الإلكتروني</p>
                <p dir="ltr" className="mt-0.5 text-left text-sm font-medium text-[#f2f5f5]">
                  {item.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onCopySecret(item.email!, 'البريد الإلكتروني', false)}
                className="rounded-lg p-2 text-[#c2cccf] transition hover:bg-white/10 hover:text-[#76e5ff]"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          {item.password ? (
            <div className="steel-recess-deep flex items-center justify-between rounded-xl px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[#94a4a9]">كلمة المرور</p>
                <p dir="ltr" className="font-mono-tabular mt-0.5 truncate text-left text-sm text-[#f2f5f5]">
                  {revealedKeys['__password'] ? item.password : '••••••••••••••••••••'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleReveal('__password')}
                  className="rounded-lg p-2 text-[#c2cccf] transition hover:bg-white/10 hover:text-[#f2f5f5]"
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
                  className="rounded-lg p-2 text-[#c2cccf] transition hover:bg-white/10 hover:text-[#76e5ff]"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          {item.urls.length > 0 ? (
            <div className="space-y-2 border-t border-white/10 pt-4">
              <h4 className="text-xs font-bold text-[#c2cccf]">الروابط</h4>
              <div className="space-y-2">
                {item.urls.map((url, idx) => (
                  <div
                    key={idx}
                    className="steel-recess-deep flex items-center justify-between gap-2 rounded-xl px-4 py-2.5"
                  >
                    <span dir="ltr" className="truncate text-left text-sm text-[#76e5ff]">
                      {url}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenUrl(url)}
                      className="steel-btn-secondary inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-[#58d9ff]" />
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
            <div className="space-y-1.5 border-t border-white/10 pt-4">
              <h4 className="text-xs font-bold text-[#c2cccf]">الملاحظات</h4>
              <div className="steel-recess-deep whitespace-pre-wrap rounded-xl p-3.5 text-sm text-[#dce2e3]">
                {item.notes}
              </div>
            </div>
          ) : null}
        </div>

        {/* Machined Button Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => onDelete(item)}
            className="steel-btn-danger inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold"
          >
            <Trash2 className="h-4 w-4" />
            حذف
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onDuplicate(item)}
              className="steel-btn-secondary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold"
            >
              <Files className="h-4 w-4" />
              تكرار (نسخة)
            </button>
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="steel-btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-extrabold"
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
