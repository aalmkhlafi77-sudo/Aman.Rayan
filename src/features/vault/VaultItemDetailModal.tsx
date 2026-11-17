import React, { useEffect, useState } from 'react';
import {
  X,
  Copy,
  Check,
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Mandatory security rule: Reset all revealed secrets to hidden when switching items or opening/closing
  useEffect(() => {
    setRevealedKeys({});
    setCopiedKey(null);
  }, [item?.id]);

  if (!item) return null;

  const categoryName = item.categoryId
    ? categories.find((c) => c.id === item.categoryId)?.name
    : undefined;

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopy = (value: string, label: string, sensitive: boolean, key: string) => {
    setCopiedKey(key);
    onCopySecret(value, label, sensitive);
    window.setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 900);
  };

  const renderSecretGroup = (title: string, entries: SecretEntry[], groupPrefix: string) => {
    if (entries.length === 0) return null;
    return (
      <div className="space-y-2 border-t border-white/10 pt-4">
        <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#76e5ff]">
          <KeyRound className="h-3.5 w-3.5" />
          {title}
        </h4>
        <div className="space-y-2">
          {entries.map((entry, idx) => {
            const entryKey = `${groupPrefix}-${entry.id || idx}`;
            const revealed = Boolean(revealedKeys[entryKey]);
            return (
              <div
                key={entryKey}
                className="steel-recess-deep flex flex-wrap items-center justify-between gap-2.5 rounded-xl px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[#8ea0a5]">{entry.label || 'قيمة سرية'}</p>
                  <p
                    dir="ltr"
                    className="font-mono-tabular mt-0.5 truncate text-left text-sm font-medium text-[#f2f5f5]"
                  >
                    {revealed ? entry.value : '••••••••••••••••••••'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleReveal(entryKey)}
                    title={revealed ? 'إخفاء القيمة' : 'إظهار القيمة'}
                    aria-label={revealed ? 'إخفاء القيمة' : 'إظهار القيمة'}
                    className="vault-action-btn vault-action-btn--view"
                  >
                    {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(entry.value, entry.label || title, true, entryKey)}
                    title="نسخ القيمة السرية"
                    aria-label="نسخ القيمة السرية"
                    className="vault-action-btn vault-action-btn--copy"
                  >
                    {copiedKey === entryKey ? (
                      <Check className="h-4 w-4 text-[#5eead4]" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
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
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onToggleFavorite(item)}
              title={item.isFavorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
              aria-label={item.isFavorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
              className={`vault-action-btn vault-action-btn--favorite ${
                item.isFavorite ? 'vault-action-btn--favorite-active' : ''
              }`}
            >
              <Star className={`h-4 w-4 ${item.isFavorite ? 'fill-current text-[#f0c761]' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="إغلاق"
              aria-label="إغلاق"
              className="rounded-lg p-2 text-[#2d3a3f] transition hover:bg-black/10 hover:text-[#161e21]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Dark Recessed Body */}
        <div className="steel-modal-body flex-1 space-y-3.5 overflow-y-auto rounded-t-xl p-5">
          {/* Username Row */}
          {item.username ? (
            <div className="steel-recess-deep flex items-center justify-between gap-2.5 rounded-xl px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#8ea0a5]">المستخدم</p>
                <p dir="ltr" className="mt-0.5 truncate font-mono text-left text-sm font-medium text-[#f2f5f5]">
                  {item.username}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(item.username!, 'اسم المستخدم', false, 'detail-username')}
                title="نسخ اسم المستخدم"
                aria-label="نسخ اسم المستخدم"
                className="vault-action-btn vault-action-btn--copy"
              >
                {copiedKey === 'detail-username' ? (
                  <Check className="h-4 w-4 text-[#5eead4]" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          ) : null}

          {/* Email Row */}
          {item.email ? (
            <div className="steel-recess-deep flex items-center justify-between gap-2.5 rounded-xl px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#8ea0a5]">البريد الإلكتروني</p>
                <p dir="ltr" className="mt-0.5 truncate font-mono text-left text-sm font-medium text-[#f2f5f5]">
                  {item.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(item.email!, 'البريد الإلكتروني', false, 'detail-email')}
                title="نسخ البريد الإلكتروني"
                aria-label="نسخ البريد الإلكتروني"
                className="vault-action-btn vault-action-btn--copy"
              >
                {copiedKey === 'detail-email' ? (
                  <Check className="h-4 w-4 text-[#5eead4]" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          ) : null}

          {/* Password Row: Masked by default */}
          {item.password ? (
            <div className="steel-recess-deep flex items-center justify-between gap-2.5 rounded-xl px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#8ea0a5]">كلمة المرور</p>
                <p
                  dir="ltr"
                  className="font-mono-tabular mt-0.5 truncate text-left text-sm font-bold tracking-wider text-[#f2f5f5]"
                >
                  {revealedKeys['__password'] ? item.password : '••••••••••••••••••••'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleReveal('__password')}
                  title={revealedKeys['__password'] ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  aria-label={revealedKeys['__password'] ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  className="vault-action-btn vault-action-btn--view"
                >
                  {revealedKeys['__password'] ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(item.password!, 'كلمة المرور', true, 'detail-password')}
                  title="نسخ كلمة المرور"
                  aria-label="نسخ كلمة المرور"
                  className="vault-action-btn vault-action-btn--copy"
                >
                  {copiedKey === 'detail-password' ? (
                    <Check className="h-4 w-4 text-[#5eead4]" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          ) : null}

          {/* URLs Section */}
          {item.urls.length > 0 ? (
            <div className="space-y-2 border-t border-white/10 pt-4">
              <h4 className="text-xs font-bold text-[#c2cccf]">الروابط</h4>
              <div className="space-y-2">
                {item.urls.map((url, idx) => {
                  const urlKey = `detail-url-${idx}`;
                  return (
                    <div
                      key={idx}
                      className="steel-recess-deep flex flex-wrap items-center justify-between gap-2.5 rounded-xl px-4 py-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenUrl(url)}
                        dir="ltr"
                        className="vault-link-highlight min-w-0 flex-1 truncate text-left text-sm"
                        title={`فتح الرابط بأمان: ${url}`}
                      >
                        {url}
                      </button>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenUrl(url)}
                          className="vault-action-btn vault-action-btn--link"
                          title="فتح الرابط بأمان في نافذة جديدة"
                          aria-label="فتح الرابط"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(url, 'الرابط', false, urlKey)}
                          className="vault-action-btn vault-action-btn--copy"
                          title="نسخ الرابط"
                          aria-label="نسخ الرابط"
                        >
                          {copiedKey === urlKey ? (
                            <Check className="h-3.5 w-3.5 text-[#5eead4]" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Sensitive Secret Groups (Masked by default) */}
          {renderSecretGroup('مفاتيح API', item.apiKeys, 'apiKey')}
          {renderSecretGroup('الرموز (Tokens)', item.tokens, 'token')}
          {renderSecretGroup('المفاتيح السرية', item.secretKeys, 'secretKey')}
          {renderSecretGroup('مفاتيح الترخيص', item.licenseKeys, 'licenseKey')}
          {renderSecretGroup('الشهادات', item.certificates, 'cert')}

          {/* Notes */}
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
