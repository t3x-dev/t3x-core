'use client';

/**
 * MergeIllustration — two branches converging to a merge diamond
 * Used for: Merge workspace empty state, diff empty state
 */
export function MergeIllustration({ className }: { className?: string }) {
  return (
    <svg
      width="160"
      height="100"
      viewBox="0 0 160 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Source branch top */}
      <path
        d="M30 30 Q60 30 80 50"
        stroke="#3b82f6"
        strokeWidth="1.5"
        strokeDasharray="5 3"
        strokeOpacity="0.5"
      >
        <animate attributeName="stroke-dashoffset" values="0;-16" dur="2s" repeatCount="indefinite" />
      </path>
      {/* Source branch bottom */}
      <path
        d="M30 70 Q60 70 80 50"
        stroke="#f97316"
        strokeWidth="1.5"
        strokeDasharray="5 3"
        strokeOpacity="0.5"
      >
        <animate attributeName="stroke-dashoffset" values="0;-16" dur="2s" repeatCount="indefinite" />
      </path>
      {/* Output line */}
      <path
        d="M80 50 L135 50"
        stroke="var(--text-tertiary)"
        strokeWidth="1.5"
        strokeDasharray="5 3"
        strokeOpacity="0.4"
      >
        <animate attributeName="stroke-dashoffset" values="0;-16" dur="2s" repeatCount="indefinite" />
      </path>

      {/* Source node top */}
      <circle cx="30" cy="30" r="8" fill="var(--surface-card)" fillOpacity="0.6" stroke="#3b82f6" strokeWidth="1.2" />
      <text x="30" y="33" textAnchor="middle" fontSize="9" fill="#3b82f6" fontWeight="600">A</text>

      {/* Source node bottom */}
      <circle cx="30" cy="70" r="8" fill="var(--surface-card)" fillOpacity="0.6" stroke="#f97316" strokeWidth="1.2" />
      <text x="30" y="73" textAnchor="middle" fontSize="9" fill="#f97316" fontWeight="600">B</text>

      {/* Merge diamond — with pulsing halo */}
      <circle cx="80" cy="50" r="18" fill="none" stroke="#8b5cf6" strokeWidth="3" strokeOpacity="0.06">
        <animate attributeName="r" values="18;24;18" dur="2.5s" repeatCount="indefinite" />
        <animate attributeName="stroke-opacity" values="0.06;0.18;0.06" dur="2.5s" repeatCount="indefinite" />
      </circle>
      <rect
        x="68" y="38" width="24" height="24" rx="4"
        fill="var(--surface-card)" fillOpacity="0.7"
        stroke="#8b5cf6" strokeWidth="1.5"
        transform="rotate(45 80 50)"
      />
      {/* Merge icon inside diamond */}
      <path
        d="M76 47 L80 53 L84 47"
        stroke="#8b5cf6"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Result node */}
      <circle cx="135" cy="50" r="8" fill="var(--surface-card)" fillOpacity="0.6" stroke="var(--text-tertiary)" strokeWidth="1.2">
        <animate attributeName="r" values="8;9;8" dur="3s" repeatCount="indefinite" />
      </circle>
      <path d="M131 50 L134 53 L139 47" stroke="var(--text-secondary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
