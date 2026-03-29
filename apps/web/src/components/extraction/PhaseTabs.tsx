'use client';

import { useExtractionUIStore, type ExtractionPhase } from '@/store/extractionUIStore';
import { useExtractionStore } from '@/store/extractionStore';
import { cn } from '@/lib/utils';

const PHASES: { key: ExtractionPhase; label: string }[] = [
  { key: 'yops', label: 'YOps' },
  { key: 'triage', label: 'Triage' },
  { key: 'review', label: 'Review' },
];

const PHASE_ORDER: Record<ExtractionPhase, number> = {
  idle: 0,
  yops: 1,
  triage: 2,
  review: 3,
};

export function PhaseTabs() {
  const phase = useExtractionUIStore((s) => s.phase);
  const setPhase = useExtractionUIStore((s) => s.setPhase);
  const isExtracting = useExtractionStore((s) => s.isExtracting);

  if (phase === 'idle') return null;

  const currentIndex = PHASE_ORDER[phase];

  return (
    <div className="flex" style={{ borderBottom: '1px solid var(--stroke-default)' }}>
      {PHASES.map((tab) => {
        const tabIndex = PHASE_ORDER[tab.key];
        const isActive = tab.key === phase;
        const isDone = tabIndex < currentIndex;
        const isFuture = tabIndex > currentIndex;
        // Allow clicking next phase (one step ahead) when not extracting
        const isNextStep = tabIndex === currentIndex + 1 && !isExtracting;
        const canClick = isDone || isNextStep;

        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              if (canClick) setPhase(tab.key);
            }}
            disabled={isFuture && !isNextStep}
            className={cn(
              'relative flex-1 py-2 text-center text-[10px] font-semibold transition-colors duration-150',
              'bg-transparent border-none cursor-pointer',
              isActive && 'text-[var(--accent-extract)]',
              isDone && 'text-[#4ade80]',
              isNextStep && 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              isFuture && !isNextStep && 'text-[var(--text-tertiary)] cursor-default',
            )}
          >
            {/* Dot indicator */}
            {(isActive || isDone) && (
              <span
                className="inline-block rounded-full mr-1 align-middle"
                style={{
                  width: 5,
                  height: 5,
                  background: isActive ? 'var(--accent-extract)' : '#4ade80',
                }}
              />
            )}
            {tab.label}
            {/* Underline */}
            {(isActive || isDone) && (
              <span
                className="absolute bottom-[-1px] left-[15%] right-[15%] rounded-[1px]"
                style={{
                  height: 2,
                  background: isActive ? 'var(--accent-extract)' : '#4ade80',
                  opacity: isDone ? 0.3 : 1,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
