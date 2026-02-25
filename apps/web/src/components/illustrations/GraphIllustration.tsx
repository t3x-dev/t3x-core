'use client';

/**
 * GraphIllustration — conversation → commit → leaf node graph
 * Used for: Canvas empty state, insights empty state
 */
export function GraphIllustration({ className }: { className?: string }) {
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
      {/* Animated dashed connections */}
      <path
        d="M38 50 L70 50"
        stroke="#3b82f6"
        strokeWidth="1.2"
        strokeDasharray="4 3"
        strokeOpacity="0.5"
      >
        <animate attributeName="stroke-dashoffset" values="0;-14" dur="2s" repeatCount="indefinite" />
      </path>
      <path
        d="M98 50 L125 35"
        stroke="#f97316"
        strokeWidth="1.2"
        strokeDasharray="4 3"
        strokeOpacity="0.5"
      >
        <animate attributeName="stroke-dashoffset" values="0;-14" dur="2s" repeatCount="indefinite" />
      </path>
      <path
        d="M98 50 L125 65"
        stroke="#f97316"
        strokeWidth="1.2"
        strokeDasharray="4 3"
        strokeOpacity="0.5"
      >
        <animate attributeName="stroke-dashoffset" values="0;-14" dur="2s" repeatCount="indefinite" />
      </path>

      {/* Conversation node (left) */}
      <rect
        x="16" y="38" width="24" height="24" rx="6"
        fill="var(--surface-card)" fillOpacity="0.6"
        stroke="var(--text-tertiary)" strokeWidth="1.2"
      />
      <line x1="22" y1="46" x2="34" y2="46" stroke="var(--text-tertiary)" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="22" y1="50" x2="30" y2="50" stroke="var(--text-tertiary)" strokeWidth="1" strokeOpacity="0.3" />
      <line x1="22" y1="54" x2="32" y2="54" stroke="var(--text-tertiary)" strokeWidth="1" strokeOpacity="0.3" />

      {/* Commit node (center) — with breathing glow */}
      <circle cx="84" cy="50" r="16" fill="var(--surface-card)" fillOpacity="0.5" stroke="#3b82f6" strokeWidth="1.5">
        <animate attributeName="r" values="16;17;16" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle cx="84" cy="50" r="16" fill="none" stroke="#3b82f6" strokeWidth="4" strokeOpacity="0.08">
        <animate attributeName="r" values="16;20;16" dur="3s" repeatCount="indefinite" />
        <animate attributeName="stroke-opacity" values="0.08;0.15;0.08" dur="3s" repeatCount="indefinite" />
      </circle>
      {/* Checkmark in commit */}
      <path d="M78 50 L82 54 L90 46" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {/* Leaf node top-right */}
      <rect
        x="118" y="24" width="20" height="22" rx="4"
        fill="var(--surface-card)" fillOpacity="0.6"
        stroke="#f97316" strokeWidth="1.2"
      >
        <animate attributeName="y" values="24;22;24" dur="4s" repeatCount="indefinite" />
      </rect>
      <circle cx="128" cy="33" r="3" fill="#f97316" fillOpacity="0.2" stroke="#f97316" strokeWidth="0.8">
        <animate attributeName="cy" values="33;31;33" dur="4s" repeatCount="indefinite" />
      </circle>

      {/* Leaf node bottom-right */}
      <rect
        x="118" y="54" width="20" height="22" rx="4"
        fill="var(--surface-card)" fillOpacity="0.6"
        stroke="#f97316" strokeWidth="1.2"
      >
        <animate attributeName="y" values="54;56;54" dur="3.5s" repeatCount="indefinite" />
      </rect>
      <circle cx="128" cy="63" r="3" fill="#f97316" fillOpacity="0.2" stroke="#f97316" strokeWidth="0.8">
        <animate attributeName="cy" values="63;65;63" dur="3.5s" repeatCount="indefinite" />
      </circle>

      {/* Labels */}
      <text x="28" y="78" textAnchor="middle" fontSize="8" fill="var(--text-tertiary)" fillOpacity="0.6">Chat</text>
      <text x="84" y="82" textAnchor="middle" fontSize="8" fill="var(--text-tertiary)" fillOpacity="0.6">Commit</text>
      <text x="128" y="92" textAnchor="middle" fontSize="8" fill="var(--text-tertiary)" fillOpacity="0.6">Leaf</text>
    </svg>
  );
}
