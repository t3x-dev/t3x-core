'use client';

import { Braces, GitCommitHorizontal, MessageSquare, X } from 'lucide-react';
import type { ComponentType } from 'react';
import { useState } from 'react';
import { cn } from '@/utils/cn';
import { AfterPanel } from './AfterPanel';
import { ScriptEditor } from './ScriptEditor';

type MobileWorkspaceView = 'chat' | 'yops' | 'result';

const VIEW_META: Record<
  MobileWorkspaceView,
  {
    label: string;
    icon: ComponentType<{ className?: string }>;
  }
> = {
  chat: { label: 'Chat', icon: MessageSquare },
  yops: { label: 'YOps', icon: Braces },
  result: { label: 'Result', icon: GitCommitHorizontal },
};

function viewTitle(view: MobileWorkspaceView): string {
  return VIEW_META[view].label;
}

export function MobileWorkspaceSheet() {
  const [activeView, setActiveView] = useState<MobileWorkspaceView>('chat');
  const sheetOpen = activeView !== 'chat';

  return (
    <div className="pointer-events-none absolute inset-0 z-30 md:hidden">
      {sheetOpen && (
        <section
          role="dialog"
          aria-modal="true"
          aria-label={viewTitle(activeView)}
          data-testid="mobile-workspace-sheet"
          className="pointer-events-auto absolute inset-0 z-10 flex min-h-0 flex-col bg-[var(--panel)]"
        >
          <header className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] bg-[var(--panel)] px-3">
            <span className="text-[12px] font-semibold text-[var(--text-primary)]">
              {viewTitle(activeView)}
            </span>
            <button
              type="button"
              aria-label="Close mobile workspace"
              onClick={() => setActiveView('chat')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--stroke-default)] text-[var(--text-secondary)] transition hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-hidden pt-12">
            {activeView === 'yops' ? (
              <ScriptEditor />
            ) : (
              <AfterPanel onContinueEditing={() => setActiveView('yops')} />
            )}
          </div>
        </section>
      )}

      <div
        role="tablist"
        aria-label="Mobile workspace views"
        data-testid="mobile-workspace-switcher"
        className={cn(
          'pointer-events-auto absolute left-3 right-3 z-20 grid grid-cols-3 overflow-hidden rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-elevated)] p-1 shadow-[var(--fx-shadow-lg)]',
          sheetOpen ? 'top-12' : 'top-14'
        )}
      >
        {(Object.keys(VIEW_META) as MobileWorkspaceView[]).map((view) => {
          const meta = VIEW_META[view];
          const Icon = meta.icon;
          const selected = activeView === view;
          return (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveView(view)}
              className={cn(
                'inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold transition',
                selected
                  ? 'bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{meta.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
