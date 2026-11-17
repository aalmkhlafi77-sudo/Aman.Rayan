import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Fingerprint, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { AmanRayanEmblem } from '../../components/AmanRayanEmblem';
import { DigitWheel, type LedState } from '../../components/DigitWheel';
import { MechanicalPadlock } from '../../components/MechanicalPadlock';
import { VaultBackground } from '../../components/VaultBackground';
import { getBiometricButtonLabel } from '../../services/biometricAuth';
import {
  playBiometricActivate,
  playBiometricConfirmLatch,
  playKeyboardEngage,
  playRejectMechanism,
  playReverseDetent,
  playUnlockMechanism,
  playWheelDetent,
  playWheelSettle,
} from '../../services/mechanicalAudio';
import type { BiometricCapability, BiometricStatus } from '../../types/aman';
import { APP_DESIGNER_URL, APP_NAME, APP_NAME_AR, APP_SIGNATURE, APP_VERSION, IS_PREVIEW_MODE } from '../../version';

export type PinScreenMode = 'setup' | 'locked';

interface PinLockScreenProps {
  mode: PinScreenMode;
  biometricStatus?: BiometricStatus | null;
  biometricCapability?: BiometricCapability | null;
  onSetupComplete: (pin: string, bootstrapToken?: string) => Promise<void>;
  onUnlockAttempt: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  onBiometricUnlockAttempt?: () => Promise<{ ok: boolean; cancelled?: boolean; error?: string }>;
  onUnlockAnimationFinished: () => void;
}

export const PinLockScreen: React.FC<PinLockScreenProps> = ({
  mode,
  biometricStatus,
  biometricCapability,
  onSetupComplete,
  onUnlockAttempt,
  onBiometricUnlockAttempt,
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
  const [biometricPhase, setBiometricPhase] = useState<
    'idle' | 'prompting' | 'success' | 'error'
  >('idle');
  const [biometricError, setBiometricError] = useState<string>('');
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
    setBiometricPhase('idle');
    setBiometricError('');
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
      if (
        statusPhase === 'submitting' ||
        statusPhase === 'unlock-gold' ||
        statusPhase === 'unlock-emerald'
      ) {
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
        nextEmpty !== -1
          ? nextEmpty
          : (() => {
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
    if (
      statusPhase === 'submitting' ||
      statusPhase === 'unlock-gold' ||
      statusPhase === 'unlock-emerald'
    ) {
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

  const triggerBiometricUnlock = useCallback(async () => {
    if (
      mode !== 'locked' ||
      !onBiometricUnlockAttempt ||
      biometricPhase === 'prompting' ||
      statusPhase === 'submitting' ||
      statusPhase === 'unlock-gold' ||
      statusPhase === 'unlock-emerald'
    ) {
      return;
    }

    setErrorMessage('');
    setBiometricError('');
    setBiometricPhase('prompting');
    playBiometricActivate();

    const result = await onBiometricUnlockAttempt();
    if (!result.ok) {
      if (result.cancelled) {
        setBiometricPhase('idle');
        setBiometricError(result.error || 'يمكنك المحاولة مرة أخرى أو استخدام رمز PIN.');
        return;
      }

      setBiometricPhase('error');
      setBiometricError(result.error || 'يمكنك المحاولة مرة أخرى أو استخدام رمز PIN.');
      playRejectMechanism();
      const tReset = window.setTimeout(() => {
        setBiometricPhase('idle');
      }, 1400);
      timersRef.current.push(tReset);
      return;
    }

    setBiometricPhase('success');
    playBiometricConfirmLatch();
    setStatusPhase('unlock-gold');
    setPulseNonces((prev) => prev.map((n) => n + 1));
    playUnlockMechanism();

    const tEmerald = window.setTimeout(() => {
      setStatusPhase('unlock-emerald');
      setPulseNonces((prev) => prev.map((n) => n + 1));
    }, 150);

    const tEnter = window.setTimeout(() => {
      onUnlockAnimationFinished();
    }, 980);

    timersRef.current.push(tEmerald, tEnter);
  }, [biometricPhase, mode, onBiometricUnlockAttempt, onUnlockAnimationFinished, statusPhase]);

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
      if (
        statusPhase === 'submitting' ||
        statusPhase === 'unlock-gold' ||
        statusPhase === 'unlock-emerald'
      ) {
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
      if (
        statusPhase === 'unlock-gold' ||
        statusPhase === 'unlock-emerald' ||
        statusPhase === 'submitting'
      ) {
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
    ? 'تم فتح الخزنة'
    : mode === 'setup'
      ? setupStage === 'create'
        ? 'تعيين رمز الأمان الرئيسي'
        : 'تأكيد رمز الأمان'
      : 'فتح خزنة أمان ريان';

  const subtitleText = isUnlockedVisual
    ? 'تم التحقق من المفتاح وفك تشفير الجلسة بنجاح'
    : mode === 'setup'
      ? setupStage === 'create'
        ? 'عيّن رمز PIN سداسي الأرقام لحماية جميع بياناتك الحساسة'
        : 'أعد إدخال الرمز المكوّن من 6 أرقام لتثبيت التشفير'
      : 'أدخل رمز PIN المكوّن من 6 أرقام لإلغاء قفل الخزنة';

  const buttonLabel = isUnlockedVisual
    ? 'مفتوح'
    : statusPhase === 'submitting'
      ? 'جاري فك التشفير والتحقق...'
      : mode === 'setup'
        ? setupStage === 'create'
          ? 'متابعة الخطوة التالية'
          : 'حفظ وتشفير الخزنة'
        : 'فتح الخزنة الرقمية';

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
      className="aman-safe-bg aman-safe-bg--login relative flex min-h-screen w-full items-center justify-center p-3 sm:p-5"
    >
      {/* 1. Dynamic Interactive Animated Background System */}
      <VaultBackground status={padlockStatus} />

      {/* 2. Precision Brushed-Steel Vault Control Panel */}
      <section
        aria-label="بوابة أمان ريان الميكانيكية"
        onClick={handleCardTap}
        className={`aman-pin-card aman-pin-card--cinematic relative z-10 flex flex-col items-center justify-between ${
          isError ? 'aman-pin-card--error' : ''
        } ${isUnlockedVisual ? 'aman-pin-card--unlocked' : ''}`}
      >
        {/* Top Specular Rim + Ambient Cyan Glints */}
        <div className="aman-card-top-reflection" aria-hidden="true" />
        <div className="aman-card-lock-backdrop" aria-hidden="true" />
        <div className="aman-card-bottom-reflection" aria-hidden="true" />

        {/* Precision Metal Frame Rivets */}
        <div className="aman-panel-rivet aman-panel-rivet--tl" aria-hidden="true" />
        <div className="aman-panel-rivet aman-panel-rivet--tr" aria-hidden="true" />
        <div className="aman-panel-rivet aman-panel-rivet--bl" aria-hidden="true" />
        <div className="aman-panel-rivet aman-panel-rivet--br" aria-hidden="true" />

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

        {/* Top Security Status Bar */}
        <div className="aman-panel-status-bar relative z-10 flex w-full items-center justify-between border-b border-white/10 pb-2.5 text-[11px] text-[#9fb0b5]">
          <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-[#7ce2f7]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#38bdf8] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#38bdf8]" />
            </span>
            <span className="uppercase">AES-256 ZERO-KNOWLEDGE</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-[#d3e0e2] border border-white/10">
              <ShieldCheck className="h-3 w-3 text-[#5eead4]" />
              <span>{IS_PREVIEW_MODE ? 'وضع المعاينة الآمن' : 'محمي محلياً'}</span>
            </span>
            <span className="font-mono text-[10px] text-white/40">v{APP_VERSION}</span>
          </div>
        </div>

        {/* Official Aman Rayan Brand Identity Header */}
        <header className="aman-brand-header relative z-10 mt-3 flex flex-col items-center text-center">
          <div className="aman-brand-emblem-wrap">
            <div className="aman-brand-halo" aria-hidden="true" />
            <AmanRayanEmblem className="aman-brand-emblem-img" />
          </div>

          <div className="aman-brand-titles mt-1">
            <span dir="ltr" className="aman-brand-title-en">
              {APP_NAME}
            </span>
            <span className="aman-brand-title-divider" aria-hidden="true" />
            <span className="aman-brand-title-ar">{APP_NAME_AR}</span>
          </div>

          <div className="aman-brand-descriptor mt-1">
            <span className="aman-brand-line" aria-hidden="true" />
            <span className="text-[11px] font-medium tracking-wide text-[#b4c3c7]">
              خزنة رقمية خاصة وعالية الأمان
            </span>
            <span className="aman-brand-line aman-brand-line--flip" aria-hidden="true" />
          </div>
        </header>

        {/* Mechanical Padlock Visual Stage */}
        <div className="aman-lock-stage relative z-10 my-1">
          <MechanicalPadlock status={padlockStatus} />
        </div>

        {/* High-Contrast Heading & Contextual Subtitle */}
        <div className="aman-pin-heading relative z-10 text-center">
          <h1
            className={`aman-safe-title text-xl font-extrabold tracking-tight transition-colors duration-300 sm:text-2xl ${
              isUnlockedVisual ? 'aman-safe-title--unlocked' : ''
            }`}
          >
            {titleText}
          </h1>
          <p className="aman-safe-subtitle mt-1 text-xs text-[#9bb0b5] sm:text-sm">
            {subtitleText}
          </p>
        </div>

        {/* 3D Mechanical Vault Input Drums Stage */}
        <div className="aman-wheels-stage relative z-10 mt-3">
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

        {/* Production-only bootstrap token during initial owner setup */}
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

        {/* Short Status / Feedback / Keyboard Hints */}
        <div className="aman-pin-status relative z-10 mt-3 flex min-h-[30px] items-center justify-center text-center">
          {errorMessage ? (
            <p
              role="alert"
              className="steel-recess inline-flex items-center gap-1.5 rounded-xl border-[#d95c5c]/60 bg-[#2d1214]/85 px-3.5 py-1 text-xs font-semibold text-[#fecaca] shadow-lg animate-fadeIn"
            >
              <Lock className="h-3.5 w-3.5 text-[#f87171]" />
              <span>{errorMessage}</span>
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
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#76e5ff] underline-offset-4 transition hover:text-white hover:underline"
            >
              <span>← العودة لتعديل الرمز الأول</span>
            </button>
          ) : (
            <div className="aman-safe-helper flex items-center justify-center gap-2 text-[11px] text-[#93a7ad] sm:text-xs">
              <span className="hidden sm:inline">أدخل الأرقام مباشرة من لوحة المفاتيح</span>
              <span className="hidden text-white/20 sm:inline">•</span>
              <span>اسحب العجلات للأعلى والأسفل</span>
              <span className="hidden text-white/20 sm:inline">•</span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/80">Enter</kbd>
                <span>للفتح</span>
              </span>
            </div>
          )}
        </div>

        {/* Primary Action Button: Heavy Machined Metallic Capsule */}
        <div className="aman-pin-action relative z-10 mt-3.5 w-full max-w-[340px]">
          <button
            type="button"
            disabled={!isComplete || statusPhase === 'submitting' || isUnlocking || biometricPhase === 'prompting'}
            onClick={() => void submitPin()}
            className={`aman-unlock-btn w-full inline-flex items-center justify-center gap-2 ${
              isUnlockedVisual
                ? 'aman-unlock-btn--unlocked'
                : isComplete && statusPhase === 'idle'
                  ? 'aman-unlock-btn--ready'
                  : 'aman-unlock-btn--disabled'
            }`}
          >
            {isUnlockedVisual ? (
              <Sparkles className="h-4 w-4" />
            ) : (
              <Lock className="h-4 w-4 opacity-80" />
            )}
            <span>{buttonLabel}</span>
          </button>
        </div>

        {/* Secondary Biometric / Windows Hello Action (when enrolled) */}
        {mode === 'locked' && biometricStatus?.enrolled ? (
          <div className="aman-biometric-row relative z-10 mt-3 flex w-full max-w-[340px] flex-col items-center gap-2">
            <div className="aman-biometric-divider" aria-hidden="true">
              <span className="aman-biometric-divider-line" />
              <span className="text-[11px] font-medium text-[#7a8c91]">أو عبر المصادقة الحيوية</span>
              <span className="aman-biometric-divider-line" />
            </div>

            {biometricCapability?.canEnableVaultUnlock && biometricStatus.serverConfigured ? (
              <>
                <button
                  type="button"
                  disabled={isUnlocking || statusPhase === 'submitting' || biometricPhase === 'prompting'}
                  onClick={() => void triggerBiometricUnlock()}
                  className={`aman-biometric-btn w-full ${
                    biometricPhase === 'prompting'
                      ? 'aman-biometric-btn--prompting'
                      : biometricPhase === 'success' || isUnlockedVisual
                        ? 'aman-biometric-btn--success'
                        : biometricPhase === 'error'
                          ? 'aman-biometric-btn--error'
                          : ''
                  }`}
                >
                  <span className="aman-biometric-icon-socket" aria-hidden="true">
                    <Fingerprint className="aman-biometric-icon h-4 w-4" />
                  </span>
                  <span>
                    {biometricPhase === 'prompting'
                      ? biometricCapability.isWindows
                        ? 'بانتظار مصادقة Windows Hello...'
                        : 'بانتظار مسح البصمة الحيوية...'
                      : getBiometricButtonLabel(biometricCapability.isWindows)}
                  </span>
                </button>

                {biometricError ? (
                  <div className="steel-recess flex w-full flex-col items-center gap-1 rounded-xl border-[#58d9ff]/25 px-3 py-1.5 text-center">
                    <p className="text-[11px] font-bold text-[#f2f5f5]">تعذر التحقق البيومتري</p>
                    <p className="text-[10.5px] text-[#c2cccf]">{biometricError}</p>
                    <div className="mt-0.5 flex items-center gap-3 text-[10.5px] font-bold">
                      <button
                        type="button"
                        onClick={() => void triggerBiometricUnlock()}
                        className="text-[#76e5ff] transition hover:underline"
                      >
                        إعادة المحاولة
                      </button>
                      <span className="text-white/25">·</span>
                      <button
                        type="button"
                        onClick={() => {
                          setBiometricError('');
                          setBiometricPhase('idle');
                          restorePinInputFocus(false);
                        }}
                        className="text-[#dce2e3] transition hover:text-white hover:underline"
                      >
                        استخدام PIN
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="steel-recess rounded-xl px-3 py-1.5 text-center text-[11px] font-medium text-[#c2cccf]">
                الدخول البيومتري غير متاح على هذا الجهاز. استخدم رمز PIN.
              </p>
            )}
          </div>
        ) : null}

        {/* Refined Designer Signature Footer */}
        <footer className="aman-safe-signature relative z-10 mt-4 border-t border-white/5 pt-2.5 text-center text-[11px] text-[#788a8f]">
          <a
            href={APP_DESIGNER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="aman-designer-link"
            aria-label="فتح الصفحة الشخصية للمصمم عبدالله المخلافي"
          >
            <span className="tracking-wide">{APP_SIGNATURE}</span>
          </a>
        </footer>
      </section>
    </main>
  );
};
