import React, { useEffect, useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Wand2,
  Star,
  Globe,
  KeyRound,
  Shield,
} from 'lucide-react';
import type { Category, SecretEntry, VaultItem, VaultItemInput } from '../../types/aman';
import { generateSecurePassword, normalizeUrl } from '../../utils/normalize';

interface VaultItemModalProps {
  open: boolean;
  editingItem: VaultItem | null;
  categories: Category[];
  isSaving: boolean;
  onClose: () => void;
  onSave: (input: VaultItemInput, existingId?: string) => Promise<void>;
}

type SecretGroupKey =
  | 'apiKeys'
  | 'tokens'
  | 'secretKeys'
  | 'licenseKeys'
  | 'certificates';

const SECRET_GROUPS: { key: SecretGroupKey; label: string; placeholder: string }[] = [
  { key: 'apiKeys', label: 'مفاتيح API', placeholder: 'مثال: Production API Key' },
  { key: 'tokens', label: 'الرموز (Tokens)', placeholder: 'مثال: Access Token' },
  { key: 'secretKeys', label: 'المفاتيح السرية', placeholder: 'مثال: Signing Secret' },
  { key: 'licenseKeys', label: 'مفاتيح الترخيص', placeholder: 'مثال: License Serial' },
  { key: 'certificates', label: 'الشهادات', placeholder: 'مثال: Root Fingerprint' },
];

export const VaultItemModal: React.FC<VaultItemModalProps> = ({
  open,
  editingItem,
  categories,
  isSaving,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [urls, setUrls] = useState<string[]>(['']);
  const [notes, setNotes] = useState('');
  const [activeSecretTab, setActiveSecretTab] = useState<SecretGroupKey>('apiKeys');
  const [secrets, setSecrets] = useState<Record<SecretGroupKey, SecretEntry[]>>({
    apiKeys: [],
    tokens: [],
    secretKeys: [],
    licenseKeys: [],
    certificates: [],
  });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setFormError('');
    setShowPassword(false);
    if (editingItem) {
      setTitle(editingItem.title);
      setUsername(editingItem.username || '');
      setEmail(editingItem.email || '');
      setPassword(editingItem.password || '');
      setCategoryId(editingItem.categoryId || '');
      setIsFavorite(editingItem.isFavorite);
      setUrls(editingItem.urls.length > 0 ? [...editingItem.urls] : ['']);
      setNotes(editingItem.notes || '');
      setSecrets({
        apiKeys: editingItem.apiKeys.map((s) => ({ ...s })),
        tokens: editingItem.tokens.map((s) => ({ ...s })),
        secretKeys: editingItem.secretKeys.map((s) => ({ ...s })),
        licenseKeys: editingItem.licenseKeys.map((s) => ({ ...s })),
        certificates: editingItem.certificates.map((s) => ({ ...s })),
      });
    } else {
      setTitle('');
      setUsername('');
      setEmail('');
      setPassword('');
      setCategoryId('');
      setIsFavorite(false);
      setUrls(['']);
      setNotes('');
      setSecrets({
        apiKeys: [],
        tokens: [],
        secretKeys: [],
        licenseKeys: [],
        certificates: [],
      });
    }
  }, [editingItem, open]);

  if (!open) return null;

  const addSecretRow = (group: SecretGroupKey) => {
    setSecrets((prev) => ({
      ...prev,
      [group]: [...prev[group], { id: crypto.randomUUID(), label: '', value: '' }],
    }));
  };

  const updateSecretRow = (
    group: SecretGroupKey,
    id: string,
    field: 'label' | 'value',
    value: string
  ) => {
    setSecrets((prev) => ({
      ...prev,
      [group]: prev[group].map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    }));
  };

  const removeSecretRow = (group: SecretGroupKey, id: string) => {
    setSecrets((prev) => ({
      ...prev,
      [group]: prev[group].filter((row) => row.id !== id),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!title.trim()) {
      setFormError('عنوان العنصر مطلوب');
      return;
    }

    const cleanedUrls: string[] = [];
    for (const rawUrl of urls) {
      const trimmed = rawUrl.trim();
      if (!trimmed) continue;
      const safe = normalizeUrl(trimmed);
      if (!safe) {
        setFormError(`الرابط غير آمن أو غير صالح: ${trimmed}`);
        return;
      }
      cleanedUrls.push(safe);
    }

    const input: VaultItemInput = {
      title: title.trim(),
      username: username.trim() || undefined,
      email: email.trim() || undefined,
      password: password || undefined,
      urls: cleanedUrls,
      notes: notes.trim() || undefined,
      categoryId: categoryId || undefined,
      isFavorite,
      apiKeys: secrets.apiKeys.filter((s) => s.label.trim() || s.value.trim()),
      tokens: secrets.tokens.filter((s) => s.label.trim() || s.value.trim()),
      secretKeys: secrets.secretKeys.filter((s) => s.label.trim() || s.value.trim()),
      licenseKeys: secrets.licenseKeys.filter((s) => s.label.trim() || s.value.trim()),
      certificates: secrets.certificates.filter((s) => s.label.trim() || s.value.trim()),
    };

    try {
      await onSave(input, editingItem?.id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'تعذر الحفظ');
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
    >
      <div className="steel-modal-shell flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl p-1.5 shadow-2xl">
        {/* Raised Steel Title Bar */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="steel-recess flex h-9 w-9 items-center justify-center rounded-xl text-[#58d9ff]">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#161e21] sm:text-lg">
                {editingItem ? 'تعديل عنصر الخزنة' : 'إضافة عنصر جديد إلى الخزنة'}
              </h2>
              <p className="text-xs font-semibold text-[#2d3a3f]">
                تُشفّر الحقول الحساسة محلياً بتشفير AES-256-GCM قبل الحفظ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-lg p-2 text-[#2d3a3f] transition hover:bg-black/10 hover:text-[#161e21]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Recessed Form Body */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="steel-modal-body flex-1 space-y-5 overflow-y-auto rounded-xl p-5 sm:p-6"
        >
          {formError ? (
            <div className="steel-recess rounded-xl border-[#d95c5c]/65 px-4 py-3 text-sm font-semibold text-[#f8c4c4]">
              {formError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-[#c2cccf]">
                عنوان العنصر *
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: لوحة تحكم الخادم أو حساب البريد"
                  className="steel-input w-full rounded-xl px-3.5 py-2.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setIsFavorite((f) => !f)}
                  title={isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                  className={`steel-recess flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
                    isFavorite
                      ? 'border-[#d7aa45]/65 text-[#f0c761]'
                      : 'text-[#94a4a9] hover:text-[#f2f5f5]'
                  }`}
                >
                  <Star className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#c2cccf]">التصنيف</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="steel-input w-full rounded-xl px-3.5 py-2.5 text-sm"
              >
                <option value="">بدون تصنيف</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#c2cccf]">
                اسم المستخدم
              </label>
              <input
                type="text"
                dir="ltr"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                className="steel-input w-full rounded-xl px-3.5 py-2.5 text-left text-sm"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#c2cccf]">
                البريد الإلكتروني
              </label>
              <input
                type="email"
                dir="ltr"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="steel-input w-full rounded-xl px-3.5 py-2.5 text-left text-sm"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#c2cccf]">
                كلمة المرور
              </label>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    dir="ltr"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="steel-input font-mono-tabular w-full rounded-xl py-2.5 pl-10 pr-3.5 text-left text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94a4a9] hover:text-[#f2f5f5]"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPassword(generateSecurePassword(20));
                    setShowPassword(true);
                  }}
                  title="توليد كلمة مرور قوية"
                  className="steel-btn-secondary flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold"
                >
                  <Wand2 className="h-3.5 w-3.5 text-[#58d9ff]" />
                  توليد
                </button>
              </div>
            </div>
          </div>

          {/* Multiple URLs */}
          <div className="space-y-2 border-t border-white/10 pt-4">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-[#c2cccf]">
                <Globe className="h-3.5 w-3.5 text-[#58d9ff]" />
                الروابط المرتبطة
              </label>
              <button
                type="button"
                onClick={() => setUrls((prev) => [...prev, ''])}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#76e5ff] hover:text-[#f2f5f5]"
              >
                <Plus className="h-3.5 w-3.5" />
                إضافة رابط
              </button>
            </div>
            <div className="space-y-2">
              {urls.map((urlVal, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    dir="ltr"
                    value={urlVal}
                    onChange={(e) =>
                      setUrls((prev) => prev.map((u, i) => (i === idx ? e.target.value : u)))
                    }
                    placeholder="https://example.com"
                    className="steel-input w-full rounded-xl px-3.5 py-2 text-left text-sm"
                  />
                  {urls.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setUrls((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="حذف الرابط"
                      className="rounded-lg p-2 text-[#94a4a9] hover:bg-[#d95c5c]/15 hover:text-[#f29b9b]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* Structured Secrets Tabs */}
          <div className="space-y-3 border-t border-white/10 pt-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#c2cccf]">
              <KeyRound className="h-3.5 w-3.5 text-[#58d9ff]" />
              البيانات والمفاتيح السرية المشفرة
            </div>
            <div className="steel-switch-slot flex flex-wrap gap-1.5 rounded-xl p-1">
              {SECRET_GROUPS.map((group) => {
                const count = secrets[group.key].length;
                const active = activeSecretTab === group.key;
                return (
                  <button
                    key={group.key}
                    type="button"
                    onClick={() => setActiveSecretTab(group.key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition ${
                      active ? 'steel-switch-lever' : 'text-[#c2cccf] hover:text-white'
                    }`}
                  >
                    {group.label}
                    {count > 0 ? ` (${count})` : ''}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2.5">
              {secrets[activeSecretTab].map((entry) => (
                <div key={entry.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                  <input
                    type="text"
                    value={entry.label}
                    onChange={(e) =>
                      updateSecretRow(activeSecretTab, entry.id, 'label', e.target.value)
                    }
                    placeholder={
                      SECRET_GROUPS.find((g) => g.key === activeSecretTab)?.placeholder
                    }
                    className="steel-input rounded-xl px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    dir="ltr"
                    value={entry.value}
                    onChange={(e) =>
                      updateSecretRow(activeSecretTab, entry.id, 'value', e.target.value)
                    }
                    placeholder="القيمة السرية..."
                    className="steel-input font-mono-tabular rounded-xl px-3 py-2 text-left text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeSecretRow(activeSecretTab, entry.id)}
                    aria-label="إزالة"
                    className="steel-btn-danger rounded-xl px-3 py-2"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => addSecretRow(activeSecretTab)}
                className="steel-btn-secondary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold"
              >
                <Plus className="h-3.5 w-3.5 text-[#58d9ff]" />
                إضافة {SECRET_GROUPS.find((g) => g.key === activeSecretTab)?.label}
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="border-t border-white/10 pt-4">
            <label className="mb-1.5 block text-xs font-semibold text-[#c2cccf]">
              ملاحظات حساسة (مشفرة)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي تعليمات وصول أو رموز استرداد إضافية..."
              className="steel-input w-full rounded-xl p-3.5 text-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="steel-btn-secondary rounded-xl px-4 py-2.5 text-sm font-bold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="steel-btn-primary rounded-xl px-6 py-2.5 text-sm font-extrabold"
            >
              {isSaving ? 'جاري التشفير والحفظ...' : editingItem ? 'حفظ التعديلات' : 'حفظ في الخزنة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
