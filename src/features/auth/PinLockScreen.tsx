import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DigitWheel, type LedState } from '../../components/DigitWheel';
import { MechanicalPadlock } from '../../components/MechanicalPadlock';
import { APP_SIGNATURE } from '../../version';

export type PinScreenMode = 'setup' | 'locked';

interface PinLockScreenProps {
  mode: PinScreenMode;
  onSetupComplete: (pin: string) => Promise<void>;
  onUnlockAttempt: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  onUnlockAnimationFinished: () => void;
}

export const PinLockScreen: React.FC<PinLockScreenProps> = ({
  mode,
  onSetupComplete,
  onUnlockAttempt,
  onUnlockAnimationFinished,
}) => {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [pulseNonces, setPulseNonces] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [setupStage, setSetupStage] = useState<'create' | 'confirm'>('create');
  const [firstPin, setFirstPin] = useState<string>('');
  const [statusPhase, setStatusPhase] = useState<
    'idle' | 'submitting' | 'error' | 'unlock-gold' | 'unlock-emerald'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const mobileInputRef = useRef<HTMLInputElement | null>(null);
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  // Reset local wheel state when switching between setup and locked
  useEffect(() => {
    setDigits(['', '', '', '', '', '']);
    setActiveIndex(0);
    setPulseNonces([0, 0, 0, 0, 0, 0]);
    setSetupStage('create');
    setFirstPin('');
    setStatusPhase('idle');
    setErrorMessage('');
  }, [mode]);

  const resetWheelsWithError = useCallback((message: string) => {
    setStatusPhase('error');
    setErrorMessage(message);
    const t = window.setTimeout(() => {
      setDigits(['', '', '', '', '', '']);
      setActiveIndex(0);
      setStatusPhase('idle');
      if (mobileInputRef.current) {
        mobileInputRef.current.value = '';
      }
    }, 680);
    timersRef.current.push(t);
  }, []);

  const inputDigit = useCallback(
    (digit: string) => {
      if (statusPhase === 'submitting' || statusPhase === 'unlock-gold' || statusPhase === 'unlock-emerald') {
        return;
      }
      if (statusPhase === 'error') {
        setStatusPhase('idle');
        setErrorMessage('');
      } else if (errorMessage) {
        setErrorMessage('');
      }

      setDigits((prev) => {
        const next = [...prev];
        let target = activeIndex;
        if (target >= 6) target = 5;
        next[target] = digit;

        setPulseNonces((nonces) => {
          const updated = [...nonces];
          updated[target] = updated[target] + 1;
          return updated;
        });

        const nextEmpty = next.findIndex((d, idx) => idx > target && d === '');
        if (nextEmpty !== -1) {
          setActiveIndex(nextEmpty);
        } else {
          const anyEmpty = next.findIndex((d) => d === '');
          setActiveIndex(anyEmpty !== -1 ? anyEmpty : 5);
        }
        return next;
      });
    },
    [activeIndex, errorMessage, statusPhase]
  );

  const removeLastDigit = useCallback(() => {
    if (statusPhase === 'submitting' || statusPhase === 'unlock-gold' || statusPhase === 'unlock-emerald') {
      return;
    }
    setErrorMessage('');
    setDigits((prev) => {
      const next = [...prev];
      if (next[activeIndex] !== '') {
        next[activeIndex] = '';
        return next;
      }
      for (let i = Math.min(activeIndex - 1, 5); i >= 0; i--) {
        if (next[i] !== '') {
          next[i] = '';
          setActiveIndex(i);
          return next;
        }
      }
      for (let i = 5; i >= 0; i--) {
        if (next[i] !== '') {
          next[i] = '';
          setActiveIndex(i);
          return next;
        }
      }
      return next;
    });
  }, [activeIndex, statusPhase]);

  const submitPin = useCallback(async () => {
    if (digits.some((d) => !d) || statusPhase !== 'idle') return;
    const pin = digits.join('');

    if (mode === 'setup') {
      if (setupStage === 'create') {
        setFirstPin(pin);
        setSetupStage('confirm');
        setDigits(['', '', '', '', '', '']);
        setActiveIndex(0);
        setPulseNonces([0, 0, 0, 0, 0, 0]);
        setErrorMessage('');
        if (mobileInputRef.current) mobileInputRef.current.value = '';
        return;
      }

      if (pin !== firstPin) {
        setSetupStage('create');
        setFirstPin('');
        resetWheelsWithError('رمزا الأمان غير متطابقين، أعد المحاولة');
        return;
      }

      setStatusPhase('submitting');
      try {
        await onSetupComplete(pin);
      } catch (err) {
        setStatusPhase('idle');
        resetWheelsWithError(
          err instanceof Error ? err.message : 'تعذر تهيئة الخزنة'
        );
      }
      return;
    }

    // Locked mode: verify PIN and run exact mechanical unlock timeline
    setStatusPhase('submitting');
    const result = await onUnlockAttempt(pin);
    if (!result.ok) {
      resetWheelsWithError(result.error || 'رمز أمان غير صحيح');
      return;
    }

    // 0-150ms: all six LEDs flash bright gold together
    setStatusPhase('unlock-gold');
    setPulseNonces((prev) => prev.map((n) => n + 1));

    // 150ms+: gold transitions to emerald, rings emit, shackle lifts, card sweeps
    const tEmerald = window.setTimeout(() => {
      setStatusPhase('unlock-emerald');
      setPulseNonces((prev) => prev.map((n) => n + 1));
    }, 150);

    // 980ms: enter vault after "مفتوح" + shackle + sweep settle
    const tEnter = window.setTimeout(() => {
      onUnlockAnimationFinished();
    }, 980);

    timersRef.current.push(tEmerald, tEnter);
  }, [
    digits,
    firstPin,
    mode,
    onSetupComplete,
    onUnlockAnimationFinished,
    onUnlockAttempt,
    resetWheelsWithError,
    setupStage,
    statusPhase,
  ]);

  // Mandatory global keyboard-first listener (works immediately without clicking any field)
  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (statusPhase === 'unlock-gold' || statusPhase === 'unlock-emerald' || statusPhase === 'submitting') {
        return;
      }
      // Ignore if focus is inside mobile invisible input (handled via onInput/onChange)
      if (document.activeElement === mobileInputRef.current) {
        if (event.key === 'Enter' && digits.every(Boolean)) {
          event.preventDefault();
          void submitPin();
        }
        return;
      }

      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        inputDigit(event.key);
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        removeLastDigit();
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setActiveIndex((prev) => Math.max(0, prev - 1));
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setActiveIndex((prev) => Math.min(5, prev + 1));
        return;
      }

      if (event.key === 'Enter' && digits.every(Boolean)) {
        event.preventDefault();
        void submitPin();
      }
    };

    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [digits, inputDigit, removeLastDigit, statusPhase, submitPin]);

  const handleMobileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 6);
    const nextDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < raw.length; i++) {
      nextDigits[i] = raw[i];
    }
    setDigits(nextDigits);
    setActiveIndex(Math.min(raw.length, 5));
    setPulseNonces((prev) =>
      prev.map((n, idx) => (nextDigits[idx] && nextDigits[idx] !== digits[idx] ? n + 1 : n))
    );
    setErrorMessage('');
  };

  const handleWheelClick = (index: number) => {
    setActiveIndex(index);
    // On touch/coarse pointers, open native mobile numeric keyboard invisibly
    if (window.matchMedia('(pointer: coarse)').matches) {
      mobileInputRef.current?.focus();
    }
  };

  const isComplete = digits.every((d) => /^\d$/.test(d));
  const isUnlocking = statusPhase === 'unlock-gold' || statusPhase === 'unlock-emerald';
  const isUnlockedVisual = statusPhase === 'unlock-emerald';
  const isError = statusPhase === 'error';

  const padlockStatus = isUnlockedVisual
    ? 'unlocked'
    : statusPhase === 'unlock-gold'
      ? 'unlocking'
      : isError
        ? 'error'
        : 'locked';

  const titleText = isUnlockedVisual
    ? 'مفتوح'
    : mode === 'setup'
      ? setupStage === 'create'
        ? 'إنشاء رمز أمان الخاص بك'
        : 'تأكيد رمز أمان الخاص بك'
      : 'أدخل رمز أمان الخاص بك';

  const subtitleText = isUnlockedVisual
    ? 'تم فتح خزنة أمان بنجاح'
    : mode === 'setup'
      ? setupStage === 'create'
        ? 'أنشئ رمز أمان مكوّن من 6 أرقام'
        : 'أعد إدخال رمز PIN المكوّن من 6 أرقام للتأكيد'
      : 'أدخل رمز PIN المكوّن من 6 أرقام';

  const buttonLabel = isUnlockedVisual
    ? 'مفتوح'
    : statusPhase === 'submitting'
      ? 'جاري التحقق...'
      : mode === 'setup'
        ? setupStage === 'create'
          ? 'متابعة'
          : 'حفظ رمز الأمان'
        : 'فتح أمان';

  const resolveLedState = (idx: number): LedState => {
    if (statusPhase === 'unlock-gold') return 'gold-flash';
    if (statusPhase === 'unlock-emerald') return 'emerald';
    if (statusPhase === 'error') return 'error';
    return digits[idx] ? 'entered' : 'empty';
  };

  return (
    <main
      dir="rtl"
      className="aman-safe-bg flex min-h-screen w-full items-center justify-center p-3.5"
    >
      <div className="aman-ambient-glow" />

      <section
        aria-label="بوابة الأمان الميكانيكية"
        className={`aman-pin-card relative z-10 flex flex-col items-center justify-between px-5 py-6 sm:px-8 sm:py-7 ${
          isError ? 'aman-pin-card--error' : ''
        } ${isUnlockedVisual ? 'aman-pin-card--unlocked' : ''}`}
      >
        {/* Invisible mobile numeric input (invokes phone keyboard on touch tap) */}
        <input
          ref={mobileInputRef}
          className="aman-mobile-pin-input"
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={digits.join('')}
          onChange={handleMobileInputChange}
          aria-label="رمز أمان"
        />

        {/* 1. AMAN Mechanical Padlock */}
        <div className="mb-3">
          <MechanicalPadlock status={padlockStatus} />
        </div>

        {/* 2 & 3. Title & Subtitle */}
        <div className="mb-5 text-center">
          <h1
            className={`text-xl font-extrabold tracking-tight transition-colors duration-300 sm:text-2xl ${
              isUnlockedVisual ? 'text-[#4bffb3]' : 'text-[#f5f7f6]'
            }`}
          >
            {titleText}
          </h1>
          <p className="mt-1.5 text-xs text-[#95a4a2] sm:text-sm">{subtitleText}</p>
        </div>

        {/* 4 & 5. Six Mechanical Digit Wheels + Six Physical LEDs */}
        <div
          className={`aman-wheels-row ${isError ? 'aman-wheels-row--shake' : ''}`}
          onClick={() => {
            if (window.matchMedia('(pointer: coarse)').matches) {
              mobileInputRef.current?.focus();
            }
          }}
        >
          {digits.map((digit, idx) => (
            <DigitWheel
              key={idx}
              index={idx}
              value={digit}
              isActive={!isUnlocking && idx === activeIndex}
              ledState={resolveLedState(idx)}
              pulseNonce={pulseNonces[idx]}
              status={isError ? 'error' : isUnlockedVisual ? 'unlocked' : 'idle'}
              onSelectWheel={handleWheelClick}
            />
          ))}
        </div>

        {/* 6. Short Status / Error Area */}
        <div className="mt-4 flex h-6 items-center justify-center text-center">
          {errorMessage ? (
            <p role="alert" className="text-xs font-semibold text-red-400 sm:text-sm">
              {errorMessage}
            </p>
          ) : mode === 'setup' && setupStage === 'confirm' ? (
            <button
              type="button"
              onClick={() => {
                setSetupStage('create');
                setFirstPin('');
                setDigits(['', '', '', '', '', '']);
                setActiveIndex(0);
              }}
              className="text-xs font-medium text-[#93a19f] underline-offset-4 transition hover:text-[#e5b440] hover:underline"
            >
              تعديل الرمز الأول
            </button>
          ) : (
            <p className="text-[11px] text-[#6d7c7a]">
              اكتب الأرقام مباشرة من لوحة المفاتيح أو اضغط Enter للفتح
            </p>
          )}
        </div>

        {/* 7. Compact Primary Button */}
        <div className="mt-3">
          <button
            type="button"
            disabled={!isComplete || statusPhase === 'submitting' || isUnlocking}
            onClick={() => void submitPin()}
            className={`aman-unlock-btn inline-flex items-center justify-center ${
              isUnlockedVisual
                ? 'aman-unlock-btn--unlocked'
                : isComplete && statusPhase === 'idle'
                  ? 'aman-unlock-btn--ready'
                  : 'aman-unlock-btn--disabled'
            }`}
          >
            {buttonLabel}
          </button>
        </div>

        {/* 8. Designer Signature */}
        <footer className="mt-5 text-center text-[11px] font-medium text-[#7b8987]">
          {APP_SIGNATURE}
        </footer>
      </section>
    </main>
  );
};
