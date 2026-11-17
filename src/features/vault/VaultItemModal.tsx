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
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101616] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e5b440]/12 text-[#e5b440]">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#f3f6f5]">
                {editingItem ? 'تعديل عنصر الخزنة' : 'إضافة عنصر جديد إلى الخزنة'}
              </h2>
              <p className="text-xs text-[#8b9997]">
                تُشفّر الحقول الحساسة محلياً بتشفير AES-256-GCM قبل الحفظ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-lg p-2 text-[#93a19f] transition hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={(e) => void handleSubmit(e)} className="flex-1 space-y-5 overflow-y-auto p-6">
          {formError ? (
            <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300">
              {formError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-[#b9c4c2]">
                عنوان العنصر *
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: لوحة تحكم الخادم أو حساب البريد"
                  className="w-full rounded-xl border border-white/10 bg-[#0a0e0e] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-[#e5b440]/70"
                />
                <button
                  type="button"
                  onClick={() => setIsFavorite((f) => !f)}
                  title={isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition ${
                    isFavorite
                      ? 'border-[#e5b440]/60 bg-[#e5b440]/15 text-[#ffd365]'
                      : 'border-white/10 bg-[#0a0e0e] text-[#7c8a88] hover:text-white'
                  }`}
                >
                  <Star className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#b9c4c2]">التصنيف</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0a0e0e] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-[#e5b440]/70"
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
              <label className="mb-1.5 block text-xs font-semibold text-[#b9c4c2]">
                اسم المستخدم
              </label>
              <input
                type="text"
                dir="ltr"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                className="w-full rounded-xl border border-white/10 bg-[#0a0e0e] px-3.5 py-2.5 text-left text-sm text-white outline-none transition focus:border-[#e5b440]/70"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#b9c4c2]">
                البريد الإلكتروني
              </label>
              <input
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-xl border border-white/10 bg-[#0a0e0e] px-3.5 py-2.5 text-left text-sm text-white outline-none transition focus:border-[#e5b440]/70"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#b9c4c2]">
                كلمة المرور
              </label>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="font-mono-tabular w-full rounded-xl border border-white/10 bg-[#0a0e0e] py-2.5 pl-10 pr-3.5 text-left text-sm text-white outline-none transition focus:border-[#e5b440]/70"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8b9997] hover:text-white"
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
                  className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-[#e5b440]/30 bg-[#e5b440]/10 px-3 text-xs font-semibold text-[#ffd365] transition hover:bg-[#e5b440]/20"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  توليد
                </button>
              </div>
            </div>
          </div>

          {/* Multiple URLs */}
          <div className="space-y-2 border-t border-white/8 pt-4">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-[#b9c4c2]">
                <Globe className="h-3.5 w-3.5 text-[#e5b440]" />
                الروابط المرتبطة
              </label>
              <button
                type="button"
                onClick={() => setUrls((prev) => [...prev, ''])}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#e5b440] hover:text-[#ffd365]"
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
                    className="w-full rounded-xl border border-white/10 bg-[#0a0e0e] px-3.5 py-2 text-left text-sm text-white outline-none transition focus:border-[#e5b440]/70"
                  />
                  {urls.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setUrls((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="حذف الرابط"
                      className="rounded-lg p-2 text-[#8b9997] hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* Structured Secrets Tabs */}
          <div className="space-y-3 border-t border-white/8 pt-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#b9c4c2]">
              <KeyRound className="h-3.5 w-3.5 text-[#e5b440]" />
              البيانات والمفاتيح السرية المشفرة
            </div>
            <div className="flex flex-wrap gap-1.5 rounded-xl bg-[#0a0e0e] p-1">
              {SECRET_GROUPS.map((group) => {
                const count = secrets[group.key].length;
                const active = activeSecretTab === group.key;
                return (
                  <button
                    key={group.key}
                    type="button"
                    onClick={() => setActiveSecretTab(group.key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                      active
                        ? 'bg-[#1b2424] text-[#ffd365]'
                        : 'text-[#8b9997] hover:text-white'
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
                    className="rounded-xl border border-white/10 bg-[#0a0e0e] px-3 py-2 text-sm text-white outline-none focus:border-[#e5b440]/70"
                  />
                  <input
                    type="text"
                    dir="ltr"
                    value={entry.value}
                    onChange={(e) =>
                      updateSecretRow(activeSecretTab, entry.id, 'value', e.target.value)
                    }
                    placeholder="القيمة السرية..."
                    className="font-mono-tabular rounded-xl border border-white/10 bg-[#0a0e0e] px-3 py-2 text-left text-sm text-white outline-none focus:border-[#e5b440]/70"
                  />
                  <button
                    type="button"
                    onClick={() => removeSecretRow(activeSecretTab, entry.id)}
                    aria-label="إزالة"
                    className="rounded-xl border border-white/10 bg-[#0a0e0e] px-3 py-2 text-[#8b9997] hover:border-red-500/40 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => addSecretRow(activeSecretTab)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-white/15 px-3.5 py-2 text-xs font-semibold text-[#b9c4c2] transition hover:border-[#e5b440]/50 hover:text-[#ffd365]"
              >
                <Plus className="h-3.5 w-3.5" />
                إضافة {SECRET_GROUPS.find((g) => g.key === activeSecretTab)?.label}
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="border-t border-white/8 pt-4">
            <label className="mb-1.5 block text-xs font-semibold text-[#b9c4c2]">
              ملاحظات حساسة (مشفرة)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي تعليمات وصول أو رموز استرداد إضافية..."
              className="w-full rounded-xl border border-white/10 bg-[#0a0e0e] p-3.5 text-sm text-white outline-none transition focus:border-[#e5b440]/70"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-white/8 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-[#b9c4c2] transition hover:bg-white/5"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-[#e5b440] px-6 py-2.5 text-sm font-bold text-[#0b0e0e] transition hover:bg-[#ffd365] disabled:opacity-50"
            >
              {isSaving ? 'جاري التشفير والحفظ...' : editingItem ? 'حفظ التعديلات' : 'حفظ في الخزنة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
