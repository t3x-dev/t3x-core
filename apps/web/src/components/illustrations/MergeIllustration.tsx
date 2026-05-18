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
        stroke="var(--accent-commit)"
        strokeWidth="1.5"
        strokeDasharray="5 3"
        strokeOpacity="0.5"
      />
      {/* Source branch bottom */}
      <path
        d="M30 70 Q60 70 80 50"
        stroke="var(--accent-pending)"
        strokeWidth="1.5"
        strokeDasharray="5 3"
        strokeOpacity="0.5"
      />
      {/* Output line */}
      <path
        d="M80 50 L135 50"
        stroke="var(--text-tertiary)"
        strokeWidth="1.5"
        strokeDasharray="5 3"
        strokeOpacity="0.4"
      />

      {/* Source node top */}
      <circle
        cx="30"
        cy="30"
        r="8"
        fill="var(--surface-card)"
        fillOpacity="0.6"
        stroke="var(--accent-commit)"
        strokeWidth="1.2"
      />
      <text
        x="30"
        y="33"
        textAnchor="middle"
        fontSize="9"
        fill="var(--accent-commit)"
        fontWeight="600"
      >
        A
      </text>

      {/* Source node bottom */}
      <circle
        cx="30"
        cy="70"
        r="8"
        fill="var(--surface-card)"
        fillOpacity="0.6"
        stroke="var(--accent-pending)"
        strokeWidth="1.2"
      />
      <text
        x="30"
        y="73"
        textAnchor="middle"
        fontSize="9"
        fill="var(--accent-pending)"
        fontWeight="600"
      >
        B
      </text>

      {/* Merge diamond */}
      <circle
        cx="80"
        cy="50"
        r="18"
        fill="none"
        stroke="var(--accent-extract)"
        strokeWidth="3"
        strokeOpacity="0.1"
      />
      <rect
        x="68"
        y="38"
        width="24"
        height="24"
        rx="4"
        fill="var(--surface-card)"
        fillOpacity="0.7"
        stroke="var(--accent-extract)"
        strokeWidth="1.5"
        transform="rotate(45 80 50)"
      />
      {/* Merge icon inside diamond */}
      <path
        d="M76 47 L80 53 L84 47"
        stroke="var(--accent-extract)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Result node */}
      <circle
        cx="135"
        cy="50"
        r="8"
        fill="var(--surface-card)"
        fillOpacity="0.6"
        stroke="var(--text-tertiary)"
        strokeWidth="1.2"
      />
      <path
        d="M131 50 L134 53 L139 47"
        stroke="var(--text-secondary)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
