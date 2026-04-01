'use client';

import type { Phase } from '@/types/goldStepContracts';

/** Compat alias — ExtractionPanel still passes 'committing' from old store */
type ExtractionPhase = Phase | 'committing';

interface PhaseTabsProps {
  currentPhase: ExtractionPhase;
  onTabClick?: (phase: 'yops' | 'triage' | 'review') => void;
}

const TABS: Array<{ key: 'yops' | 'triage' | 'review'; label: string }> = [
  { key: 'yops', label: 'YOps' },
  { key: 'triage', label: 'Triage' },
  { key: 'review', label: 'Review' },
];

const PHASE_ORDER: Record<string, number> = { yops: 0, triage: 1, review: 2, committing: 2 };

export function PhaseTabs({ currentPhase, onTabClick }: PhaseTabsProps) {
  if (currentPhase === 'idle') return null;

  const currentIdx = PHASE_ORDER[currentPhase] ?? 0;

  return (
    <div className="flex border-b border-[var(--stroke-default)]">
      {TABS.map((tab) => {
        const tabIdx = PHASE_ORDER[tab.key];
        const isActive =
          tab.key === currentPhase || (currentPhase === 'committing' && tab.key === 'review');
        const isDone = tabIdx < currentIdx;

        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabClick?.(tab.key)}
            disabled={!isDone && !isActive}
            className={`
              flex-1 py-2 text-center text-[10px] font-semibold relative transition-colors
              ${isActive ? 'text-[var(--accent)]' : ''}
              ${isDone ? 'text-[var(--status-success)]' : ''}
              ${!isActive && !isDone ? 'text-[var(--text-tertiary)] cursor-default' : ''}
            `}
          >
            <span
              className={`inline-block w-[5px] h-[5px] rounded-full mr-1 align-middle ${
                isActive
                  ? 'bg-[var(--accent)]'
                  : isDone
                    ? 'bg-[var(--status-success)]'
                    : 'bg-transparent'
              }`}
            />
            {tab.label}
            {isActive && (
              <span className="absolute bottom-[-1px] left-[15%] right-[15%] h-[2px] bg-[var(--accent)] rounded-sm" />
            )}
            {isDone && (
              <span className="absolute bottom-[-1px] left-[15%] right-[15%] h-[2px] bg-[var(--status-success)] rounded-sm opacity-30" />
            )}
          </button>
        );
      })}
    </div>
  );
}
