import React, { useEffect, useRef, useState } from 'react';

const RAIL_DIGITS = ['9', '•', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '•'] as const;

export type LedState = 'empty' | 'entered' | 'gold-flash' | 'emerald' | 'error';

interface DigitWheelProps {
  index: number;
  value: string;
  isActive: boolean;
  ledState: LedState;
  pulseNonce: number;
  status: 'idle' | 'error' | 'unlocked';
  onSelectWheel: (index: number) => void;
}

export const DigitWheel: React.FC<DigitWheelProps> = ({
  index,
  value,
  isActive,
  ledState,
  pulseNonce,
  status,
  onSelectWheel,
}) => {
  const [isSpinning, setIsSpinning] = useState(false);
  const [cellHeight, setCellHeight] = useState<number>(() =>
    typeof window !== 'undefined' && window.innerWidth <= 580 ? 30 : 38
  );
  const prevValueRef = useRef(value);

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
      const timer = window.setTimeout(() => setIsSpinning(false), 290);
      return () => window.clearTimeout(timer);
    }
  }, [value]);

  // Empty state centers index 1 ('•' with '9' above and '0' below)
  // Digit '0'..'9' centers index 2..11
  const railIndex = value === '' ? 1 : Number(value) + 2;
  const offsetY = -(railIndex - 1) * cellHeight;

  const wheelClasses = [
    'aman-wheel',
    isActive && status === 'idle' ? 'aman-wheel--active' : '',
    isSpinning ? 'aman-wheel--spinning' : '',
    status === 'error' ? 'aman-wheel--error' : '',
    status === 'unlocked' ? 'aman-wheel--unlocked' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const ledColorClass =
    ledState === 'gold-flash'
      ? 'aman-wheel-led--gold-flash'
      : ledState === 'emerald'
        ? 'aman-wheel-led--emerald'
        : ledState === 'error'
          ? 'aman-wheel-led--error'
          : ledState === 'entered'
            ? 'aman-wheel-led--entered'
            : 'aman-wheel-led--empty';

  return (
    <div className="aman-wheel-column">
      <button
        type="button"
        onClick={() => onSelectWheel(index)}
        aria-label={`الخانة ${index + 1}${value ? ` القيمة ${value}` : ' فارغة'}`}
        className={wheelClasses}
      >
        <div className="aman-wheel-band" />
        <div className="aman-wheel-viewport">
          <div
            className="aman-wheel-rail"
            style={{
              transform: `translate3d(0, ${offsetY}px, 0)`,
            }}
          >
            {RAIL_DIGITS.map((digit, railPos) => {
              const isCenter = railPos === railIndex;
              const isPlaceholder = isCenter && digit === '•';
              const digitClass = isCenter
                ? isPlaceholder
                  ? 'aman-wheel-digit aman-wheel-digit--placeholder'
                  : 'aman-wheel-digit aman-wheel-digit--center'
                : 'aman-wheel-digit aman-wheel-digit--side';

              return (
                <div key={`${index}-${railPos}`} className={digitClass}>
                  {digit}
                </div>
              );
            })}
          </div>
        </div>
        <div className="aman-wheel-flash" />
      </button>

      {/* Re-keyed LED bloom wrapper restarts light bloom cleanly on every entry */}
      <div
        key={`${index}-${pulseNonce}-${ledState}`}
        className={`aman-wheel-led ${ledColorClass} ${
          pulseNonce > 0 && ledState !== 'empty' ? 'aman-wheel-led--pulse' : ''
        }`}
      />
    </div>
  );
};
