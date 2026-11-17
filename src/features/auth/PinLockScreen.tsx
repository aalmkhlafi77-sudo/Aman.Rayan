import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AmanRayanEmblem } from '../../components/AmanRayanEmblem';
import { DigitWheel, type LedState } from '../../components/DigitWheel';
import { MechanicalPadlock } from '../../components/MechanicalPadlock';
import {
  playKeyboardEngage,
  playRejectMechanism,
  playReverseDetent,
  playUnlockMechanism,
  playWheelDetent,
  playWheelSettle,
} from '../../services/mechanicalAudio';
import { APP_NAME, APP_NAME_AR, APP_SIGNATURE, IS_PREVIEW_MODE } from '../../version';

export type PinScreenMode = 'setup' | 'locked';

interface PinLockScreenProps {
  mode: PinScreenMode;
  onSetupComplete: (pin: string, bootstrapToken?: string) => Promise<void>;
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
  const [bootstrapToken, setBootstrapToken] = useState<string>('');
  const mobileInputRef = useRef<HTMLInputElement | null>(null);
  const timersRef = useRef<number[]>([]);
  const digitsRef = useRef<string[]>(digits);
  const activeIndexRef = useRef<number>(activeIndex);

  digitsRef.current = digits;
  activeIndexRef.current = activeIndex;

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
    const empty = ['', '', '', '', '', ''];
    digitsRef.current = empty;
    activeIndexRef.current = 0;
    setDigits(empty);
    setActiveIndex(0);
    setPulseNonces([0, 0, 0, 0, 0, 0]);
    setSetupStage('create');
    setFirstPin('');
    setStatusPhase('idle');
    setErrorMessage('');
    setBootstrapToken('');
  }, [mode]);

  const resetWheelsWithError = useCallback((message: string) => {
    setStatusPhase('error');
    setErrorMessage(message);
    playRejectMechanism();
    const t = window.setTimeout(() => {
      const empty = ['', '', '', '', '', ''];
      digitsRef.current = empty;
      activeIndexRef.current = 0;
      setDigits(empty);
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

      const prev = digitsRef.current;
      const next = [...prev];
      const target = Math.min(activeIndexRef.current, 5);
      next[target] = digit;
      digitsRef.current = next;

      const nextEmpty = next.findIndex((d, idx) => idx > target && d === '');
      const resolvedNextIndex =
        nextEmpty !== -1 ? nextEmpty : (() => {
          const anyEmpty = next.findIndex((d) => d === '');
          return anyEmpty !== -1 ? anyEmpty : 5;
        })();
      activeIndexRef.current = resolvedNextIndex;

      setDigits(next);
      setActiveIndex(resolvedNextIndex);
      setPulseNonces((nonces) => {
        const updated = [...nonces];
        updated[target] = updated[target] + 1;
        return updated;
      });

      playKeyboardEngage(target);
    },
    [errorMessage, statusPhase]
  );

  const removeLastDigit = useCallback(() => {
    if (statusPhase === 'submitting' || statusPhase === 'unlock-gold' || statusPhase === 'unlock-emerald') {
      return;
    }
    setErrorMessage('');
    const prev = digitsRef.current;
    const currentActive = activeIndexRef.current;
    let removedIndex = -1;

    if (prev[currentActive] !== '') {
      removedIndex = currentActive;
    } else {
      for (let i = Math.min(currentActive - 1, 5); i >= 0; i--) {
        if (prev[i] !== '') {
          removedIndex = i;
          break;
        }
      }
      if (removedIndex === -1) {
        for (let i = 5; i >= 0; i--) {
          if (prev[i] !== '') {
            removedIndex = i;
            break;
          }
        }
      }
    }

    if (removedIndex === -1) {
      return;
    }

    const next = [...prev];
    next[removedIndex] = '';
    digitsRef.current = next;
    activeIndexRef.current = removedIndex;

    setDigits(next);
    setActiveIndex(removedIndex);
    playReverseDetent(removedIndex);
  }, [statusPhase]);

  const submitPin = useCallback(async () => {
    if (digits.some((d) => !d) || statusPhase !== 'idle') return;
    const pin = digits.join('');

    if (mode === 'setup') {
      if (setupStage === 'create') {
        const empty = ['', '', '', '', '', ''];
        digitsRef.current = empty;
        activeIndexRef.current = 0;
        setFirstPin(pin);
        setSetupStage('confirm');
        setDigits(empty);
        setActiveIndex(0);
        setPulseNonces([0, 0, 0, 0, 0, 0]);
        setErrorMessage('');
        if (mobileInputRef.current) mobileInputRef.current.value = '';
        playWheelSettle();
        return;
      }

      if (pin !== firstPin) {
        setSetupStage('create');
        setFirstPin('');
        resetWheelsWithError('رمزا الأمان غير متطابقين، أعد المحاولة');
        return;
      }

      if (!IS_PREVIEW_MODE && !bootstrapToken.trim()) {
        resetWheelsWithError('أدخل رمز التأسيس الأولي (AMAN_BOOTSTRAP_TOKEN)');
        return;
      }

      setStatusPhase('submitting');
      try {
        await onSetupComplete(pin, !IS_PREVIEW_MODE ? bootstrapToken.trim() : undefined);
        playWheelSettle();
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

    // 0-150ms: all six LEDs flash bright gold together + mechanical unlock audio sequence
    setStatusPhase('unlock-gold');
    setPulseNonces((prev) => prev.map((n) => n + 1));
    playUnlockMechanism();

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
    bootstrapToken,
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

  const restorePinInputFocus = useCallback((wasDrag: boolean) => {
    const isCoarsePointer =
      typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    if (isCoarsePointer && wasDrag) {
      return;
    }
    mobileInputRef.current?.focus({ preventScroll: true });
  }, []);

  const rotateWheelDigit = useCallback(
    (index: number, direction: 1 | -1) => {
      if (statusPhase === 'submitting' || statusPhase === 'unlock-gold' || statusPhase === 'unlock-emerald') {
        return;
      }
      if (statusPhase === 'error') {
        setStatusPhase('idle');
        setErrorMessage('');
      } else if (errorMessage) {
        setErrorMessage('');
      }

      const prev = digitsRef.current;
      const current = prev[index];
      const nextDigit =
        current === ''
          ? direction > 0
            ? '0'
            : '9'
          : String((Number(current) + direction + 10) % 10);

      activeIndexRef.current = index;
      setActiveIndex(index);

      if (nextDigit === current) {
        return;
      }

      const next = [...prev];
      next[index] = nextDigit;
      digitsRef.current = next;
      setDigits(next);

      setPulseNonces((nonces) => {
        const updated = [...nonces];
        updated[index] = updated[index] + 1;
        return updated;
      });

      playWheelDetent(index);
    },
    [errorMessage, statusPhase]
  );

  // Mandatory global keyboard-first listener (works immediately without clicking any field)
  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (statusPhase === 'unlock-gold' || statusPhase === 'unlock-emerald' || statusPhase === 'submitting') {
        return;
      }

      const target = event.target;
      const isHiddenPinInput = target === mobileInputRef.current;

      // Ignore when user is typing in another input (e.g., production bootstrap token input)
      if (
        (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
        !isHiddenPinInput
      ) {
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
    const prevDigits = digitsRef.current;
    const raw = e.target.value.replace(/\D/g, '').slice(0, 6);
    const nextDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < raw.length; i++) {
      nextDigits[i] = raw[i];
    }

    let addedIdx = -1;
    let removedIdx = -1;
    for (let i = 0; i < 6; i++) {
      if (nextDigits[i] && nextDigits[i] !== prevDigits[i]) {
        addedIdx = i;
      } else if (!nextDigits[i] && prevDigits[i]) {
        removedIdx = i;
      }
    }

    const nextActive = Math.min(raw.length, 5);
    digitsRef.current = nextDigits;
    activeIndexRef.current = nextActive;

    setDigits(nextDigits);
    setActiveIndex(nextActive);
    setPulseNonces((prev) =>
      prev.map((n, idx) => (nextDigits[idx] && nextDigits[idx] !== prevDigits[idx] ? n + 1 : n))
    );
    setErrorMessage('');

    if (addedIdx !== -1) {
      playKeyboardEngage(addedIdx);
    } else if (removedIdx !== -1) {
      playReverseDetent(removedIdx);
    }
  };

  const handleWheelClick = (index: number) => {
    activeIndexRef.current = index;
    setActiveIndex(index);
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
    ? 'تم فتح خزنة أمان ريان بنجاح'
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

  const handleCardTap = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('button, input, textarea, [role="spinbutton"]')) {
      return;
    }
    restorePinInputFocus(false);
  };

  return (
    <main
      dir="rtl"
      className="aman-safe-bg flex min-h-screen w-full items-center justify-center p-2.5 sm:p-3.5"
    >
      <div className="aman-studio-light" aria-hidden="true" />
      <div className="aman-ambient-glow" aria-hidden="true" />

      <section
        aria-label="بوابة أمان ريان الميكانيكية"
        onClick={handleCardTap}
        className={`aman-pin-card relative z-10 flex flex-col items-center justify-between ${
          isError ? 'aman-pin-card--error' : ''
        } ${isUnlockedVisual ? 'aman-pin-card--unlocked' : ''}`}
      >
        {/* Top Cyan Logo Reflection + Localized Atmospheric Lock Backdrop + Bottom Edge Glint */}
        <div className="aman-card-top-reflection" aria-hidden="true" />
        <div className="aman-card-lock-backdrop" aria-hidden="true" />
        <div className="aman-card-bottom-reflection" aria-hidden="true" />

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

        {/* Official Aman Rayan Brand Identity Header */}
        <header className="aman-brand-header relative z-10 flex flex-col items-center text-center">
          <div className="aman-brand-emblem-wrap">
            <div className="aman-brand-halo" aria-hidden="true" />
            <AmanRayanEmblem className="aman-brand-emblem-img" />
          </div>

          <div className="aman-brand-titles">
            <span dir="ltr" className="aman-brand-title-en">
              {APP_NAME}
            </span>
            <span className="aman-brand-title-divider" aria-hidden="true" />
            <span className="aman-brand-title-ar">{APP_NAME_AR}</span>
          </div>

          <div className="aman-brand-descriptor">
            <span className="aman-brand-line" aria-hidden="true" />
            <span>الخزنة الرقمية الآمنة</span>
            <span className="aman-brand-line aman-brand-line--flip" aria-hidden="true" />
          </div>
        </header>

        {/* Mechanical Padlock Symbolism */}
        <div className="aman-lock-stage relative z-10">
          <MechanicalPadlock status={padlockStatus} />
        </div>

        {/* Functional PIN Title & Subtitle */}
        <div className="aman-pin-heading relative z-10 text-center">
          <h1
            className={`aman-safe-title text-lg font-extrabold tracking-tight transition-colors duration-300 sm:text-xl ${
              isUnlockedVisual ? 'aman-safe-title--unlocked' : ''
            }`}
          >
            {titleText}
          </h1>
          <p className="aman-safe-subtitle mt-0.5 text-xs sm:text-[13px]">{subtitleText}</p>
        </div>

        {/* Six Recessed Sockets + Raised Cylindrical Drums + Physical LEDs */}
        <div className="aman-wheels-stage relative z-10">
          <div className="aman-wheels-floor-glow" aria-hidden="true" />
          <div className={`aman-wheels-row ${isError ? 'aman-wheels-row--shake' : ''}`}>
            {digits.map((digit, idx) => (
              <DigitWheel
                key={idx}
                index={idx}
                value={digit}
                isActive={!isUnlocking && idx === activeIndex}
                ledState={resolveLedState(idx)}
                pulseNonce={pulseNonces[idx]}
                status={isError ? 'error' : isUnlockedVisual ? 'unlocked' : 'idle'}
                disabled={isUnlocking || statusPhase === 'submitting'}
                onSelectWheel={handleWheelClick}
                onRotateDigit={rotateWheelDigit}
                onRestoreFocus={restorePinInputFocus}
              />
            ))}
          </div>
        </div>

        {/* Production-only one-time bootstrap token input during initial owner setup */}
        {mode === 'setup' && !IS_PREVIEW_MODE ? (
          <div className="relative z-10 mt-4 w-full max-w-[440px]">
            <input
              type="password"
              dir="ltr"
              autoComplete="off"
              value={bootstrapToken}
              onChange={(e) => {
                setBootstrapToken(e.target.value);
                if (errorMessage) setErrorMessage('');
              }}
              placeholder="AMAN_BOOTSTRAP_TOKEN (مطلوب للتهيئة الأولى فقط)"
              aria-label="رمز التأسيس الأولي"
              className="steel-input font-mono-tabular w-full rounded-xl px-3.5 py-2 text-center text-xs"
            />
          </div>
        ) : null}

        {/* 6. Short Status / Error Area */}
        <div className="relative z-10 mt-3 flex h-7 items-center justify-center text-center">
          {errorMessage ? (
            <p
              role="alert"
              className="steel-recess rounded-lg border-[#d95c5c]/65 px-3 py-1 text-xs font-semibold text-[#f8c4c4]"
            >
              {errorMessage}
            </p>
          ) : mode === 'setup' && setupStage === 'confirm' ? (
            <button
              type="button"
              onClick={() => {
                const empty = ['', '', '', '', '', ''];
                digitsRef.current = empty;
                activeIndexRef.current = 0;
                setSetupStage('create');
                setFirstPin('');
                setDigits(empty);
                setActiveIndex(0);
                playReverseDetent(0);
                restorePinInputFocus(false);
              }}
              className="text-xs font-semibold text-[#f2f5f5] underline-offset-4 transition hover:text-[#76e5ff] hover:underline"
            >
              تعديل الرمز الأول
            </button>
          ) : (
            <p className="aman-safe-helper text-[11px] sm:text-xs">
              اكتب الأرقام مباشرة أو اسحب العجلات للأعلى والأسفل، ثم اضغط Enter للفتح
            </p>
          )}
        </div>

        {/* 7. Raised Physical Metallic Capsule Button */}
        <div className="relative z-10 mt-3">
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
        <footer className="aman-safe-signature relative z-10 mt-5 text-center text-[11px] font-medium">
          {APP_SIGNATURE}
        </footer>
      </section>
    </main>
  );
};
