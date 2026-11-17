import React, { useState } from 'react';
import { Copy, RefreshCw, ShieldCheck } from 'lucide-react';
import { generateSecurePassword } from '../../utils/normalize';

interface PasswordGeneratorViewProps {
  onCopy: (value: string, label: string, sensitive?: boolean) => void;
}

export const PasswordGeneratorView: React.FC<PasswordGeneratorViewProps> = ({ onCopy }) => {
  const [length, setLength] = useState(20);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [generated, setGenerated] = useState(() =>
    generateSecurePassword({ length: 20, uppercase: true, lowercase: true, numbers: true, symbols: true })
  );

  const regenerate = (nextOpts?: Partial<{
    length: number;
    uppercase: boolean;
    lowercase: boolean;
    numbers: boolean;
    symbols: boolean;
  }>) => {
    const opts = {
      length: nextOpts?.length ?? length,
      uppercase: nextOpts?.uppercase ?? uppercase,
      lowercase: nextOpts?.lowercase ?? lowercase,
      numbers: nextOpts?.numbers ?? numbers,
      symbols: nextOpts?.symbols ?? symbols,
    };
    setGenerated(generateSecurePassword(opts));
  };

  const strengthLabel =
    length >= 20 && uppercase && lowercase && numbers && symbols
      ? 'قوية جداً (موصى بها للمفاتيح)'
      : length >= 14
        ? 'قوية'
        : 'متوسطة';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#f3f6f5]">مولّد كلمات المرور التشفيري</h2>
        <p className="mt-1 text-sm text-[#8b9997]">
          يعتمد على مولّد الأرقام العشوائية الآمن في المتصفح (Web Crypto CSPRNG)
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#101616] p-6 space-y-5">
        <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#080c0c] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p
            dir="ltr"
            className="font-mono-tabular break-all text-left text-lg font-bold tracking-wide text-[#ffd365]"
          >
            {generated}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => regenerate()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3.5 py-2 text-xs font-bold text-[#dce3e1] transition hover:bg-white/5"
            >
              <RefreshCw className="h-4 w-4" />
              توليد جديد
            </button>
            <button
              type="button"
              onClick={() => onCopy(generated, 'كلمة المرور المولّدة', true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#e5b440] px-4 py-2 text-xs font-bold text-[#0b0e0e] transition hover:bg-[#ffd365]"
            >
              <Copy className="h-4 w-4" />
              نسخ
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
          <ShieldCheck className="h-4 w-4" />
          <span>مستوى القوة: {strengthLabel}</span>
        </div>

        <div className="space-y-4 border-t border-white/8 pt-4">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold text-[#dce3e1]">طول كلمة المرور</span>
              <span className="font-mono-tabular font-bold text-[#ffd365]">{length} خانة</span>
            </div>
            <input
              type="range"
              min={8}
              max={64}
              value={length}
              onChange={(e) => {
                const val = Number(e.target.value);
                setLength(val);
                regenerate({ length: val });
              }}
              className="w-full accent-[#e5b440]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'أحرف كبيرة (A-Z)', checked: uppercase, key: 'uppercase' as const },
              { label: 'أحرف صغيرة (a-z)', checked: lowercase, key: 'lowercase' as const },
              { label: 'أرقام (2-9)', checked: numbers, key: 'numbers' as const },
              { label: 'رموز (!@#$)', checked: symbols, key: 'symbols' as const },
            ].map((opt) => (
              <label
                key={opt.key}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/8 bg-[#0a0e0e] px-3 py-2.5 text-xs font-semibold text-[#dce3e1] transition hover:border-white/20"
              >
                <input
                  type="checkbox"
                  checked={opt.checked}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    if (opt.key === 'uppercase') setUppercase(checked);
                    if (opt.key === 'lowercase') setLowercase(checked);
                    if (opt.key === 'numbers') setNumbers(checked);
                    if (opt.key === 'symbols') setSymbols(checked);
                    regenerate({ [opt.key]: checked });
                  }}
                  className="accent-[#e5b440]"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
