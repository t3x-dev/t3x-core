'use client';

import { useTerminology } from '@/hooks/shared/useTerminology';

/**
 * GraphIllustration — conversation → commit → leaf node graph
 * Used for: Canvas empty state, insights empty state
 */
export function GraphIllustration({ className }: { className?: string }) {
  const { t } = useTerminology();
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
      {/* Dashed connections */}
      <path
        d="M38 50 L70 50"
        stroke="var(--accent-commit)"
        strokeWidth="1.2"
        strokeDasharray="4 3"
        strokeOpacity="0.5"
      />
      <path
        d="M98 50 L125 35"
        stroke="var(--accent-pending)"
        strokeWidth="1.2"
        strokeDasharray="4 3"
        strokeOpacity="0.5"
      />
      <path
        d="M98 50 L125 65"
        stroke="var(--accent-pending)"
        strokeWidth="1.2"
        strokeDasharray="4 3"
        strokeOpacity="0.5"
      />

      {/* Conversation node (left) */}
      <rect
        x="16"
        y="38"
        width="24"
        height="24"
        rx="6"
        fill="var(--surface-card)"
        fillOpacity="0.6"
        stroke="var(--text-tertiary)"
        strokeWidth="1.2"
      />
      <line
        x1="22"
        y1="46"
        x2="34"
        y2="46"
        stroke="var(--text-tertiary)"
        strokeWidth="1"
        strokeOpacity="0.5"
      />
      <line
        x1="22"
        y1="50"
        x2="30"
        y2="50"
        stroke="var(--text-tertiary)"
        strokeWidth="1"
        strokeOpacity="0.3"
      />
      <line
        x1="22"
        y1="54"
        x2="32"
        y2="54"
        stroke="var(--text-tertiary)"
        strokeWidth="1"
        strokeOpacity="0.3"
      />

      {/* Commit node (center) */}
      <circle
        cx="84"
        cy="50"
        r="16"
        fill="var(--surface-card)"
        fillOpacity="0.5"
        stroke="var(--accent-commit)"
        strokeWidth="1.5"
      />
      <circle
        cx="84"
        cy="50"
        r="16"
        fill="none"
        stroke="var(--accent-commit)"
        strokeWidth="4"
        strokeOpacity="0.08"
      />
      {/* Checkmark in commit */}
      <path
        d="M78 50 L82 54 L90 46"
        stroke="var(--accent-commit)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Leaf node top-right */}
      <rect
        x="118"
        y="24"
        width="20"
        height="22"
        rx="4"
        fill="var(--surface-card)"
        fillOpacity="0.6"
        stroke="var(--accent-pending)"
        strokeWidth="1.2"
      />
      <circle
        cx="128"
        cy="33"
        r="3"
        fill="var(--accent-pending)"
        fillOpacity="0.2"
        stroke="var(--accent-pending)"
        strokeWidth="0.8"
      />

      {/* Leaf node bottom-right */}
      <rect
        x="118"
        y="54"
        width="20"
        height="22"
        rx="4"
        fill="var(--surface-card)"
        fillOpacity="0.6"
        stroke="var(--accent-pending)"
        strokeWidth="1.2"
      />
      <circle
        cx="128"
        cy="63"
        r="3"
        fill="var(--accent-pending)"
        fillOpacity="0.2"
        stroke="var(--accent-pending)"
        strokeWidth="0.8"
      />

      {/* Labels */}
      <text
        x="28"
        y="78"
        textAnchor="middle"
        fontSize="8"
        fill="var(--text-tertiary)"
        fillOpacity="0.6"
      >
        Chat
      </text>
      <text
        x="84"
        y="82"
        textAnchor="middle"
        fontSize="8"
        fill="var(--text-tertiary)"
        fillOpacity="0.6"
      >
        {t('commit')}
      </text>
      <text
        x="128"
        y="92"
        textAnchor="middle"
        fontSize="8"
        fill="var(--text-tertiary)"
        fillOpacity="0.6"
      >
        Leaf
      </text>
    </svg>
  );
}
