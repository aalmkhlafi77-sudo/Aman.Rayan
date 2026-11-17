import React from 'react';

interface MechanicalPadlockProps {
  status: 'locked' | 'unlocking' | 'unlocked' | 'error';
}

const DIAL_TICKS = Array.from({ length: 24 }, (_, idx) => idx * 15);

export const MechanicalPadlock: React.FC<MechanicalPadlockProps> = ({ status }) => {
  const isUnlocked = status === 'unlocked' || status === 'unlocking';
  const isError = status === 'error';

  const statusClass = isUnlocked
    ? 'aman-lock--unlocked'
    : isError
      ? 'aman-lock--error'
      : 'aman-lock--locked';

  return (
    <div
      className={`aman-lock-shell ${statusClass}`}
      aria-hidden="true"
    >
      {/* Localized Atmospheric Reflection Behind Lock */}
      <div className="aman-lock-aura" />

      {/* Two Staggered Emerald Energy Rings on Unlock */}
      <div className="aman-success-ring" />
      <div className="aman-success-ring aman-success-ring--delayed" />

      <div className="aman-lock-assembly">
        {/* Cylindrical Layered Chrome Shackle */}
        <div className="aman-lock-shackle-wrap">
          <svg
            width="92"
            height="60"
            viewBox="0 0 92 60"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="aman-lock-shackle-svg"
          >
            <defs>
              <linearGradient id="amanChromeSide" x1="21" y1="0" x2="31" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#545d5d" />
                <stop offset="20%" stopColor="#d7dddd" />
                <stop offset="40%" stopColor="#ffffff" />
                <stop offset="62%" stopColor="#8f9999" />
                <stop offset="80%" stopColor="#f0f3f3" />
                <stop offset="100%" stopColor="#4e5757" />
              </linearGradient>

              <linearGradient id="amanChromeRight" x1="61" y1="0" x2="71" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#545d5d" />
                <stop offset="20%" stopColor="#d7dddd" />
                <stop offset="40%" stopColor="#ffffff" />
                <stop offset="62%" stopColor="#8f9999" />
                <stop offset="80%" stopColor="#f0f3f3" />
                <stop offset="100%" stopColor="#4e5757" />
              </linearGradient>

              <linearGradient id="amanChromeArch" x1="22" y1="8" x2="70" y2="38" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#eef2f3" />
                <stop offset="22%" stopColor="#ffffff" />
                <stop offset="46%" stopColor="#9aa5a6" />
                <stop offset="72%" stopColor="#e5ebeb" />
                <stop offset="100%" stopColor="#4f5858" />
              </linearGradient>
            </defs>

            {/* Outer shadow rim */}
            <path
              d="M26 56V30C26 17.85 34.95 9 46 9C57.05 9 66 17.85 66 30V56"
              stroke="#121718"
              strokeWidth="12"
              strokeLinecap="round"
              opacity="0.72"
            />

            {/* Primary curved cylindrical core */}
            <path
              d="M26 56V30C26 17.85 34.95 9 46 9C57.05 9 66 17.85 66 30V56"
              stroke="url(#amanChromeArch)"
              strokeWidth="9.5"
              strokeLinecap="round"
            />

            {/* Vertical cylindrical leg shading */}
            <line x1="26" y1="30" x2="26" y2="56" stroke="url(#amanChromeSide)" strokeWidth="9.5" />
            <line x1="66" y1="30" x2="66" y2="56" stroke="url(#amanChromeRight)" strokeWidth="9.5" />

            {/* Top-left bright chrome specular ridge */}
            <path
              d="M24.7 54V30C24.7 17.1 34.2 7.8 46 7.8C54.6 7.8 61.9 12.6 64.9 20.1"
              stroke="rgba(255,255,255,0.88)"
              strokeWidth="1.9"
              strokeLinecap="round"
            />

            {/* Secondary warm metallic reflection */}
            <path
              d="M27.6 54V30.5C27.6 19.6 35.8 11.4 46 11.4C56.2 11.4 64.4 19.6 64.4 30.5V54"
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="1.2"
              strokeLinecap="round"
            />

            {/* Bottom-right cylindrical dark edge */}
            <path
              d="M29.6 54V31C29.6 21.3 36.9 13.8 46 13.8C55.1 13.8 68.8 20.2 69.2 31V54"
              stroke="rgba(10,14,15,0.52)"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Physical Beveled Graphite & Steel Padlock Body */}
        <div className="aman-lock-body">
          {/* Shackle Entry Collar Sockets */}
          <span className="aman-lock-collar aman-lock-collar--left" />
          <span className="aman-lock-collar aman-lock-collar--right" />

          {/* Top-Left Bevel Specular Edge */}
          <span className="aman-lock-bevel-sheen" />

          {/* Top Indicator Notch */}
          <span className="aman-lock-index" />

          {/* Recessed Multi-Layer Combination Safe Dial */}
          <div className="aman-lock-dial-recess">
            <div className="aman-lock-dial-ring">
              <div className="aman-lock-dial-face">
                {/* Engraved Radial Tick Markings */}
                {DIAL_TICKS.map((deg) => (
                  <span
                    key={deg}
                    className={`aman-lock-tick ${deg % 90 === 0 ? 'aman-lock-tick--major' : ''}`}
                    style={{ transform: `rotate(${deg}deg)` }}
                  />
                ))}
                <div className="aman-lock-spindle" />
              </div>
            </div>
          </div>

          {/* Unlocked Emerald Rim Reflection Inside Lock Bottom */}
          <span className="aman-lock-bottom-glint" />
        </div>

        {/* Cast Ground Shadow Under Suspended Lock */}
        <div className="aman-lock-cast-shadow" />
      </div>
    </div>
  );
};
