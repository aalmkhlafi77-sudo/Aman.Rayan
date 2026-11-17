import React, { useEffect, useRef, useState } from 'react';
import { playWheelSettle } from '../services/mechanicalAudio';

const RAIL_DIGITS = ['9', '•', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;
const DRAG_STEP_PX = 28;
const WHEEL_ACCUM_THRESHOLD = 26;

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
  const [cellHeight, setCellHeight] = useState<number>(() => {
    if (typeof window === 'undefined') return 38;
    if (window.innerWidth <= 480) return 32;
    if (window.innerWidth <= 640) return 35;
    return 40;
  });

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
      const w = window.innerWidth;
      if (w <= 480) {
        setCellHeight(32);
      } else if (w <= 640) {
        setCellHeight(35);
      } else {
        setCellHeight(40);
      }
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

      if (Math.abs(event.deltaY) >= 36) {
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
      {/* Precision Recessed Socket Cavity */}
      <div className={housingClasses}>
        {/* Recessed Corner Precision Milled Notches */}
        <div className="wheel-housing-rivet wheel-housing-rivet--tl" aria-hidden="true" />
        <div className="wheel-housing-rivet wheel-housing-rivet--tr" aria-hidden="true" />
        <div className="wheel-housing-rivet wheel-housing-rivet--bl" aria-hidden="true" />
        <div className="wheel-housing-rivet wheel-housing-rivet--br" aria-hidden="true" />

        {/* Tactile 3D Cylindrical Mechanical Drum */}
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
          {/* Subtle Lateral Mechanical Grooves (Left & Right Flange) */}
          <div className="wheel-drum-flange wheel-drum-flange--left" aria-hidden="true" />
          <div className="wheel-drum-flange wheel-drum-flange--right" aria-hidden="true" />

          {/* Perspective Rail Track for Digits */}
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
                  <div
                    key={`${index}-${railPos}`}
                    className={digitClass}
                    style={{ height: `${cellHeight}px` }}
                  >
                    {isPlaceholder ? (
                      <span className="wheel-placeholder-pip" aria-hidden="true" />
                    ) : (
                      digit
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Curved Cylinder Top & Bottom Roll-off Shadows */}
          <div className="wheel-drum-vignette" aria-hidden="true" />

          {/* Center Precision Alignment Band / Laser Sight Window */}
          <div className="wheel-center-band" aria-hidden="true">
            <span className="wheel-center-marker wheel-center-marker--left" />
            <span className="wheel-center-marker wheel-center-marker--right" />
          </div>

          {/* Specular Glint & Convex Metallic Reflection */}
          <div className="wheel-specular" aria-hidden="true" />
        </div>
      </div>

      {/* Embedded Physical Jewel LED Indicator */}
      <div className="aman-led-socket" title={`مؤشر الخانة ${index + 1}`}>
        <div className="aman-led-socket-rim" aria-hidden="true" />
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
