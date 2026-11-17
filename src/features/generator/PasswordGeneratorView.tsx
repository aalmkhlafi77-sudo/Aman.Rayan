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
        <h2 className="text-xl font-extrabold text-[#f2f5f5]">مولّد كلمات المرور التشفيري</h2>
        <p className="mt-1 text-sm text-[#c2cccf]">
          يعتمد على مولّد الأرقام العشوائية الآمن في المتصفح (Web Crypto CSPRNG)
        </p>
      </div>

      <div className="steel-plate rounded-2xl p-1.5">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-xs font-extrabold tracking-wide text-[#161e21]">
            وحدة التوليد التشفيري
          </span>
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#161e21]">
            <ShieldCheck className="h-4 w-4 text-[#0b5c42]" />
            <span>مستوى القوة: {strengthLabel}</span>
          </div>
        </div>

        <div className="steel-module-dark space-y-5 rounded-xl p-5 sm:p-6">
          <div className="steel-recess-deep flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between">
            <p
              dir="ltr"
              className="font-mono-tabular break-all text-left text-lg font-bold tracking-wide text-[#76e5ff]"
            >
              {generated}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => regenerate()}
                className="steel-btn-secondary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold"
              >
                <RefreshCw className="h-4 w-4" />
                توليد جديد
              </button>
              <button
                type="button"
                onClick={() => onCopy(generated, 'كلمة المرور المولّدة', true)}
                className="steel-btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-extrabold"
              >
                <Copy className="h-4 w-4" />
                نسخ
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-[#36e5a4]">
            <span className="h-2 w-2 rounded-full bg-[#36e5a4] shadow-[0_0_8px_rgba(54,229,164,0.75)]" />
            <span>مفتاح عشوائي جاهز للنسخ المباشر</span>
          </div>

          <div className="space-y-4 border-t border-white/10 pt-4">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-[#f2f5f5]">طول كلمة المرور</span>
                <span className="font-mono-tabular font-bold text-[#76e5ff]">{length} خانة</span>
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
                className="w-full accent-[#58d9ff]"
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
                  className={`steel-recess flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
                    opt.checked
                      ? 'border-[#58d9ff]/50 text-[#f2f5f5]'
                      : 'text-[#94a4a9] hover:text-[#f2f5f5]'
                  }`}
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
                    className="accent-[#58d9ff]"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
