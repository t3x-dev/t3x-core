'use client';

import { LANDING_DEMO_CASES, type LandingDemoCase } from '@t3x-dev/core';
import { dump } from 'js-yaml';
import { CheckCircle2, GitCommitHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/utils/cn';

interface LandingDemoPreviewProps {
  onSelectSource: (source: string) => void;
}

function toYAML(demo: LandingDemoCase): string {
  return dump({ yops: demo.yops.slice(0, 4) }, { lineWidth: 72, noRefs: true });
}

function shortTabLabel(demo: LandingDemoCase): string {
  switch (demo.id) {
    case 'prompt_review':
      return 'Review';
    case 'meeting_notes':
      return 'Notes';
    case 'prompt_diff':
      return 'Diff';
  }
}

export function LandingDemoPreview({ onSelectSource }: LandingDemoPreviewProps) {
  const [activeId, setActiveId] = useState<LandingDemoCase['id']>(LANDING_DEMO_CASES[0].id);
  const activeDemo =
    LANDING_DEMO_CASES.find((demo) => demo.id === activeId) ?? LANDING_DEMO_CASES[0];
  const yopsPreview = useMemo(() => toYAML(activeDemo), [activeDemo]);

  const selectDemo = (demo: LandingDemoCase) => {
    setActiveId(demo.id);
    onSelectSource(demo.source.text);
  };

  return (
    <section className="rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-card)] shadow-[var(--fx-shadow-sm)]">
      <div className="flex flex-col gap-2 border-b border-[var(--stroke-divider)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0] text-[var(--text-tertiary)]">
            source -&gt; YOps -&gt; commit
          </div>
          <p className="mt-1 max-h-10 overflow-hidden text-xs text-[var(--text-secondary)] sm:max-h-none sm:text-sm">
            {activeDemo.description}
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Demo cases"
          className="flex shrink-0 gap-1 overflow-x-auto rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-1"
        >
          {LANDING_DEMO_CASES.map((demo) => {
            const selected = demo.id === activeDemo.id;
            return (
              <button
                key={demo.id}
                type="button"
                role="tab"
                aria-label={demo.title}
                aria-selected={selected}
                className={cn(
                  'h-7 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors',
                  selected
                    ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-[var(--fx-shadow-sm)]'
                    : 'text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
                )}
                onClick={() => selectDemo(demo)}
              >
                <span className="sm:hidden">{shortTabLabel(demo)}</span>
                <span className="hidden sm:inline">{demo.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid min-h-0 grid-cols-1 divide-y divide-[var(--stroke-divider)] sm:min-h-[244px] lg:grid-cols-[0.9fr_1.1fr_0.82fr] lg:divide-x lg:divide-y-0">
        <div className="min-w-0 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="text-xs font-semibold text-[var(--source)]">Source</div>
          <h2 className="mt-1 text-sm font-semibold text-[var(--text-primary)] sm:mt-2">
            {activeDemo.source.title}
          </h2>
          <p className="mt-1 max-h-12 overflow-hidden text-xs leading-snug text-[var(--text-secondary)] sm:mt-2 sm:max-h-28 sm:text-sm sm:leading-relaxed">
            {activeDemo.source.text}
          </p>
        </div>

        <div className="min-w-0 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="text-xs font-semibold text-[var(--accent-extract)]">YOps</div>
          <pre className="mt-1 max-h-16 overflow-hidden whitespace-pre-wrap font-mono text-[10px] leading-snug text-[var(--text-secondary)] sm:mt-2 sm:max-h-40 sm:overflow-auto sm:text-[11px] sm:leading-relaxed">
            {yopsPreview}
          </pre>
        </div>

        <div className="min-w-0 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="text-xs font-semibold text-[var(--accent-commit)]">Commit</div>
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-[var(--accent-commit)]/25 bg-[var(--accent-commit-soft)] px-3 py-2 sm:mt-3">
            <GitCommitHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-commit)]" />
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-snug text-[var(--text-primary)]">
                {activeDemo.commit.message}
              </div>
              <div className="mt-1 font-mono text-[11px] text-[var(--accent-commit)]">
                main / sha256:fixture
              </div>
            </div>
          </div>
          <div className="mt-3 hidden items-center gap-1.5 text-xs text-[var(--text-tertiary)] sm:flex">
            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent-commit)]" />
            Ready to review before any real extraction run
          </div>
        </div>
      </div>
    </section>
  );
}
