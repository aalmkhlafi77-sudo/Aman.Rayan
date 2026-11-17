import React from 'react';

interface MechanicalPadlockProps {
  status: 'locked' | 'unlocking' | 'unlocked' | 'error';
}

export const MechanicalPadlock: React.FC<MechanicalPadlockProps> = ({ status }) => {
  const isUnlocked = status === 'unlocked' || status === 'unlocking';
  const isError = status === 'error';

  const dialAccent = isUnlocked
    ? '#4bffb3'
    : isError
      ? '#ef4444'
      : '#e5b440';

  const ambientBg = isUnlocked
    ? 'radial-gradient(circle, rgba(75,255,179,0.28) 0%, transparent 70%)'
    : isError
      ? 'radial-gradient(circle, rgba(239,68,68,0.24) 0%, transparent 70%)'
      : 'radial-gradient(circle, rgba(21,105,76,0.20) 0%, transparent 70%)';

  return (
    <div
      className={`aman-lock-shell ${isUnlocked ? 'aman-lock--unlocked' : ''}`}
      aria-hidden="true"
    >
      {/* Ambient Radial Aura */}
      <div
        className="pointer-events-none absolute -inset-7 rounded-full transition-all duration-500"
        style={{ background: ambientBg }}
      />

      {/* Two Staggered Emerald Energy Rings */}
      <div className="aman-success-ring" />
      <div className="aman-success-ring aman-success-ring--delayed" />

      <svg
        width="96"
        height="104"
        viewBox="0 0 96 104"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 select-none"
      >
        <defs>
          <linearGradient id="amanShackleChrome" x1="22" y1="8" x2="74" y2="54" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#eef2f3" />
            <stop offset="28%" stopColor="#9aa5a8" />
            <stop offset="55%" stopColor="#f8fafb" />
            <stop offset="82%" stopColor="#5a6568" />
            <stop offset="100%" stopColor="#cfd7d8" />
          </linearGradient>

          <linearGradient id="amanBodyMetal" x1="16" y1="40" x2="80" y2="96" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2a3335" />
            <stop offset="35%" stopColor="#161d1e" />
            <stop offset="100%" stopColor="#080b0c" />
          </linearGradient>

          <linearGradient id="amanBodySheen" x1="16" y1="40" x2="80" y2="62" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>

          <linearGradient id="amanDialGold" x1="34" y1="53" x2="62" y2="83" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={isUnlocked ? '#6bffc2' : isError ? '#f87171' : '#ffe08a'} />
            <stop offset="50%" stopColor={dialAccent} />
            <stop offset="100%" stopColor={isUnlocked ? '#059669' : isError ? '#991b1b' : '#9c6e18'} />
          </linearGradient>

          <radialGradient id="amanDialFace" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#273031" />
            <stop offset="70%" stopColor="#101516" />
            <stop offset="100%" stopColor="#050708" />
          </radialGradient>

          <radialGradient id="amanSpindle" cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#f1f5f4" />
            <stop offset="55%" stopColor="#899698" />
            <stop offset="100%" stopColor="#353d3f" />
          </radialGradient>
        </defs>

        {/* Chrome Shackle */}
        <g className="aman-lock-shackle">
          <path
            d="M31 46V30C31 18.402 38.611 10 48 10C57.389 10 65 18.402 65 30V46"
            stroke="url(#amanShackleChrome)"
            strokeWidth="8.5"
            strokeLinecap="round"
          />
          <path
            d="M31 44V30C31 19 38.6 11 48 11C57.4 11 65 19 65 30V44"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </g>

        {/* Left shackle socket shadow when opened */}
        <ellipse cx="31" cy="46" rx="5" ry="2.2" fill="#030505" />
        <ellipse cx="65" cy="46" rx="5" ry="2.2" fill="#030505" />

        {/* Metallic Safe Padlock Body */}
        <rect
          x="15"
          y="42"
          width="66"
          height="54"
          rx="14"
          fill="url(#amanBodyMetal)"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="1.2"
        />
        <rect
          x="16.5"
          y="43.5"
          width="63"
          height="24"
          rx="12.5"
          fill="url(#amanBodySheen)"
        />

        {/* Top Indicator Triangle */}
        <path
          d="M48 51L44.5 46.5H51.5L48 51Z"
          fill={dialAccent}
          style={{ transition: 'fill 260ms ease' }}
        />

        {/* Combination Dial */}
        <g className={!isUnlocked && !isError ? 'aman-lock-dial-idle' : ''}>
          <circle
            cx="48"
            cy="69"
            r="17"
            fill="url(#amanDialFace)"
            stroke="url(#amanDialGold)"
            strokeWidth="2.6"
          />
          <circle
            cx="48"
            cy="69"
            r="13.2"
            stroke="rgba(255,255,255,0.16)"
            strokeWidth="1"
            strokeDasharray="2 3.2"
          />
          {/* Safe Dial Markings */}
          <line x1="48" y1="54.5" x2="48" y2="57.5" stroke="#d5dedd" strokeWidth="1.4" strokeLinecap="round" />
          <line x1="62.5" y1="69" x2="59.5" y2="69" stroke="#d5dedd" strokeWidth="1.4" strokeLinecap="round" />
          <line x1="48" y1="83.5" x2="48" y2="80.5" stroke="#d5dedd" strokeWidth="1.4" strokeLinecap="round" />
          <line x1="33.5" y1="69" x2="36.5" y2="69" stroke="#d5dedd" strokeWidth="1.4" strokeLinecap="round" />
          {/* Center Brushed Steel Spindle */}
          <circle cx="48" cy="69" r="5.6" fill="url(#amanSpindle)" stroke="rgba(0,0,0,0.6)" strokeWidth="0.8" />
        </g>
      </svg>
    </div>
  );
};
