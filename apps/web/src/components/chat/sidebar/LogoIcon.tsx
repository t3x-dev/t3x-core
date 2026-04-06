'use client';

export function LogoIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="T3X Logo"
    >
      <defs>
        <radialGradient id="chatLogoGradient" cx="32" cy="32" r="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="12%" stopColor="#2563EB" />
          <stop offset="40%" stopColor="#FB923C" />
          <stop offset="100%" stopColor="#FFE2C6" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#020617" />
      <g
        fill="none"
        stroke="url(#chatLogoGradient)"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16 18 L32 28 L48 18" />
        <path d="M16 46 L32 36 L48 46" />
      </g>
    </svg>
  );
}
