'use client';

/**
 * BookIllustration — open book with knowledge bubbles
 * Used for: Project list empty state
 */
export function BookIllustration({ className }: { className?: string }) {
  return (
    <svg
      width="160"
      height="120"
      viewBox="0 0 160 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Book spine */}
      <path
        d="M80 40 L80 95"
        stroke="var(--text-tertiary)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Left page */}
      <path
        d="M80 40 Q60 38 35 42 L35 92 Q60 88 80 95"
        stroke="var(--text-tertiary)"
        strokeWidth="1.5"
        fill="var(--surface-card)"
        fillOpacity="0.5"
      />
      {/* Right page */}
      <path
        d="M80 40 Q100 38 125 42 L125 92 Q100 88 80 95"
        stroke="var(--text-tertiary)"
        strokeWidth="1.5"
        fill="var(--surface-card)"
        fillOpacity="0.5"
      />
      {/* Page lines left */}
      <line
        x1="48"
        y1="52"
        x2="72"
        y2="50"
        stroke="var(--text-tertiary)"
        strokeWidth="0.8"
        strokeOpacity="0.4"
      />
      <line
        x1="48"
        y1="60"
        x2="72"
        y2="58"
        stroke="var(--text-tertiary)"
        strokeWidth="0.8"
        strokeOpacity="0.4"
      />
      <line
        x1="48"
        y1="68"
        x2="72"
        y2="66"
        stroke="var(--text-tertiary)"
        strokeWidth="0.8"
        strokeOpacity="0.4"
      />
      {/* Page lines right */}
      <line
        x1="88"
        y1="50"
        x2="112"
        y2="52"
        stroke="var(--text-tertiary)"
        strokeWidth="0.8"
        strokeOpacity="0.4"
      />
      <line
        x1="88"
        y1="58"
        x2="112"
        y2="60"
        stroke="var(--text-tertiary)"
        strokeWidth="0.8"
        strokeOpacity="0.4"
      />
      <line
        x1="88"
        y1="66"
        x2="112"
        y2="68"
        stroke="var(--text-tertiary)"
        strokeWidth="0.8"
        strokeOpacity="0.4"
      />

      {/* Static bubbles */}
      <circle
        cx="45"
        cy="24"
        r="6"
        fill="#f97316"
        fillOpacity="0.15"
        stroke="#f97316"
        strokeWidth="0.8"
        strokeOpacity="0.4"
      />
      <circle cx="45" cy="24" r="2" fill="#f97316" fillOpacity="0.3" />

      <circle
        cx="80"
        cy="16"
        r="8"
        fill="#3b82f6"
        fillOpacity="0.12"
        stroke="#3b82f6"
        strokeWidth="0.8"
        strokeOpacity="0.4"
      />
      <circle cx="80" cy="16" r="3" fill="#3b82f6" fillOpacity="0.25" />

      <circle
        cx="115"
        cy="22"
        r="5"
        fill="#f97316"
        fillOpacity="0.12"
        stroke="#f97316"
        strokeWidth="0.8"
        strokeOpacity="0.4"
      />
      <circle cx="115" cy="22" r="1.8" fill="#f97316" fillOpacity="0.25" />
    </svg>
  );
}
