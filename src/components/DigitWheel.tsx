import React, { useEffect, useRef, useState } from 'react';
import { playWheelSettle } from '../services/mechanicalAudio';

const RAIL_DIGITS = ['9', '•', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;
const DRAG_STEP_PX = 30;
const WHEEL_ACCUM_THRESHOLD = 28;

export type LedState = 'empty' | 'entered' | 'gold-flash' | 'emerald' | 'error';

interface DigitWheelProps {
  index: number;
  value: string;
  isActive: boolean;
  ledState: LedState;
  pulseNonce: number;
  status: 'idle' | 'error' | 'unlocked';
  disabled?: boolean;
  onSelectWheel: (index: number) => void;
  onRotateDigit: (index: number, direction: 1 | -1) => void;
  onRestoreFocus?: (wasDrag: boolean) => void;
}

export const DigitWheel: React.FC<DigitWheelProps> = ({
  index,
  value,
  isActive,
  ledState,
  pulseNonce,
  status,
  disabled = false,
  onSelectWheel,
  onRotateDigit,
  onRestoreFocus,
}) => {
  const [isSpinning, setIsSpinning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [cellHeight, setCellHeight] = useState<number>(() =>
    typeof window !== 'undefined' && window.innerWidth <= 580 ? 30 : 38
  );

  const prevValueRef = useRef(value);
  const drumRef = useRef<HTMLDivElement | null>(null);
  const dragStartYRef = useRef<number | null>(null);
  const lastStepRef = useRef(0);
  const didDragRef = useRef(false);
  const dragStepsMovedRef = useRef(0);
  const wheelAccumRef = useRef(0);

  const onRotateRef = useRef(onRotateDigit);
  const onSelectRef = useRef(onSelectWheel);
  const onRestoreFocusRef = useRef(onRestoreFocus);
  onRotateRef.current = onRotateDigit;
  onSelectRef.current = onSelectWheel;
  onRestoreFocusRef.current = onRestoreFocus;

  useEffect(() => {
    const updateCellHeight = () => {
      setCellHeight(window.innerWidth <= 580 ? 30 : 38);
    };
    window.addEventListener('resize', updateCellHeight);
    return () => window.removeEventListener('resize', updateCellHeight);
  }, []);

  useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      setIsSpinning(true);
      const timer = window.setTimeout(() => setIsSpinning(false), 300);
      return () => window.clearTimeout(timer);
    }
  }, [value]);

  // Scoped non-passive mouse wheel listener ONLY on this drum element
  useEffect(() => {
    const drumEl = drumRef.current;
    if (!drumEl) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (disabled) return;

      // Discrete mouse wheel notch (usually >= 40) fires 1 crisp step immediately;
      // high-resolution trackpads accumulate until threshold.
      if (Math.abs(event.deltaY) >= 40) {
        wheelAccumRef.current = 0;
        const dir: 1 | -1 = event.deltaY < 0 ? 1 : -1;
        onRotateRef.current(index, dir);
        onRestoreFocusRef.current?.(true);
        return;
      }

      wheelAccumRef.current += event.deltaY;
      if (Math.abs(wheelAccumRef.current) >= WHEEL_ACCUM_THRESHOLD) {
        const dir: 1 | -1 = wheelAccumRef.current < 0 ? 1 : -1;
        wheelAccumRef.current = 0;
        onRotateRef.current(index, dir);
        onRestoreFocusRef.current?.(true);
      }
    };

    drumEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      drumEl.removeEventListener('wheel', handleWheel);
    };
  }, [disabled, index]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable
    }

    dragStartYRef.current = event.clientY;
    lastStepRef.current = 0;
    didDragRef.current = false;
    dragStepsMovedRef.current = 0;
    setIsDragging(true);
    onSelectWheel(index);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || dragStartYRef.current === null) return;

    const delta = event.clientY - dragStartYRef.current;
    const step = Math.trunc(delta / DRAG_STEP_PX);
    if (step === lastStepRef.current) return;

    didDragRef.current = true;
    const difference = step - lastStepRef.current;
    const dir: 1 | -1 = difference < 0 ? 1 : -1;
    const stepsCount = Math.min(Math.abs(difference), 3);
    dragStepsMovedRef.current += stepsCount;

    for (let i = 0; i < stepsCount; i++) {
      onRotateDigit(index, dir);
    }

    lastStepRef.current = step;
  };

  const finishPointerInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
    const wasDrag = didDragRef.current;
    const stepsMoved = dragStepsMovedRef.current;
    dragStartYRef.current = null;
    lastStepRef.current = 0;
    didDragRef.current = false;
    dragStepsMovedRef.current = 0;
    setIsDragging(false);

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Safe no-op
    }

    if (wasDrag && stepsMoved >= 2) {
      playWheelSettle(index, 0.11);
    }

    onRestoreFocus?.(wasDrag);
  };

  const handleDrumKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      onRotateDigit(index, 1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      onRotateDigit(index, -1);
    }
  };

  // Empty state centers index 1 ('•' with '9' above and '0' below)
  // Digit '0'..'9' centers index 2..11
  const railIndex = value === '' ? 1 : Number(value) + 2;
  const offsetY = -(railIndex - 1) * cellHeight;

  const housingClasses = [
    'wheel-housing',
    isActive && status === 'idle' ? 'wheel-housing--active' : '',
    status === 'error' ? 'wheel-housing--error' : '',
    status === 'unlocked' ? 'wheel-housing--unlocked' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const drumClasses = [
    'wheel-drum',
    isActive && status === 'idle' ? 'wheel-drum--active' : '',
    isSpinning ? 'wheel-drum--spinning' : '',
    isDragging ? 'wheel-drum--dragging' : '',
    status === 'error' ? 'wheel-drum--error' : '',
    status === 'unlocked' ? 'wheel-drum--unlocked' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const ledColorClass =
    ledState === 'gold-flash'
      ? 'wheel-led--gold-flash'
      : ledState === 'emerald'
        ? 'wheel-led--emerald'
        : ledState === 'error'
          ? 'wheel-led--error'
          : ledState === 'entered'
            ? 'wheel-led--entered'
            : 'wheel-led--empty';

  return (
    <div className="aman-wheel-column">
      {/* Recessed Safe Socket Cavity */}
      <div className={housingClasses}>
        {/* Raised Cylindrical Mechanical Drum */}
        <div
          ref={drumRef}
          role="spinbutton"
          tabIndex={0}
          aria-label={`الخانة ${index + 1}${value ? ` القيمة ${value}` : ' فارغة'}`}
          aria-valuemin={0}
          aria-valuemax={9}
          aria-valuenow={value === '' ? undefined : Number(value)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointerInteraction}
          onPointerCancel={finishPointerInteraction}
          onKeyDown={handleDrumKeyDown}
          className={drumClasses}
        >
          <div className="wheel-perspective">
            <div
              className="wheel-rail"
              style={{
                transform: `translate3d(0, ${offsetY}px, 0)`,
              }}
            >
              {RAIL_DIGITS.map((digit, railPos) => {
                const isCenter = railPos === railIndex;
                const isAbove = railPos < railIndex;
                const isPlaceholder = isCenter && digit === '•';
                const digitClass = isCenter
                  ? isPlaceholder
                    ? 'wheel-digit wheel-digit--placeholder'
                    : 'wheel-digit wheel-digit--active'
                  : isAbove
                    ? 'wheel-digit wheel-digit--side wheel-digit--prev'
                    : 'wheel-digit wheel-digit--side wheel-digit--next';

                return (
                  <div key={`${index}-${railPos}`} className={digitClass}>
                    {digit}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="wheel-drum-vignette" />
          <div className="wheel-center-band" />
          <div className="wheel-specular" />
        </div>
      </div>

      {/* Embedded Physical LED Indicator */}
      <div className="aman-led-socket">
        <div
          key={`${index}-${pulseNonce}-${ledState}`}
          className={`wheel-led ${ledColorClass} ${
            pulseNonce > 0 && ledState !== 'empty' ? 'wheel-led--pulse' : ''
          }`}
        />
      </div>
    </div>
  );
};
