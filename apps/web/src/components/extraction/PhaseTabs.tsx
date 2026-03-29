'use client';

import { useExtractionUIStore, type ExtractionPhase, type ViewTab } from '@/store/extractionUIStore';
import { cn } from '@/lib/utils';

const TABS: { key: ViewTab; label: string }[] = [
  { key: 'yops', label: 'YOps' },
  { key: 'triage', label: 'Triage' },
  { key: 'review', label: 'Review' },
];

const TAB_ORDER: Record<ViewTab, number> = {
  yops: 1,
  triage: 2,
  review: 3,
};

const PHASE_ORDER: Record<ExtractionPhase, number> = {
  idle: 0,
  yops: 1,
  triage: 2,
  review: 3,
};

export function PhaseTabs() {
  const phase = useExtractionUIStore((s) => s.phase);
  const viewTab = useExtractionUIStore((s) => s.viewTab);
  const setViewTab = useExtractionUIStore((s) => s.setViewTab);

  if (phase === 'idle') return null;

  const phaseIndex = PHASE_ORDER[phase];

  return (
    <div className="flex" style={{ borderBottom: '1px solid var(--stroke-default)' }}>
      {TABS.map((tab) => {
        const tabIndex = TAB_ORDER[tab.key];
        const isViewing = tab.key === viewTab;
        // A tab is "reachable" if the phase has progressed past it or is at it
        const isDone = tabIndex < phaseIndex;
        const isCurrentPhase = tabIndex === phaseIndex;
        const isFuture = tabIndex > phaseIndex;
        // Can click any tab that's done or is the current phase
        const canClick = isDone || isCurrentPhase;

        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => { if (canClick) setViewTab(tab.key); }}
            disabled={isFuture}
            className={cn(
              'relative flex-1 py-2 text-center text-[10px] font-semibold transition-colors duration-150',
              'bg-transparent border-none cursor-pointer',
              isViewing && 'text-[var(--accent-extract)]',
              !isViewing && isDone && 'text-[#4ade80]',
              !isViewing && isCurrentPhase && 'text-[var(--text-secondary)]',
              isFuture && 'text-[var(--text-tertiary)] cursor-default',
            )}
          >
            {/* Dot indicator */}
            {(isDone || isViewing) && (
              <span
                className="inline-block rounded-full mr-1 align-middle"
                style={{
                  width: 5,
                  height: 5,
                  background: isViewing ? 'var(--accent-extract)' : '#4ade80',
                }}
              />
            )}
            {tab.label}
            {/* Underline */}
            {(isDone || isViewing) && (
              <span
                className="absolute bottom-[-1px] left-[15%] right-[15%] rounded-[1px]"
                style={{
                  height: 2,
                  background: isViewing ? 'var(--accent-extract)' : '#4ade80',
                  opacity: !isViewing && isDone ? 0.3 : 1,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
