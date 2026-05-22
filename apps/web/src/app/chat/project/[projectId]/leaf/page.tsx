'use client';

import { FileText, Leaf as LeafIcon } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { ErrorMessage, LoadingSpinner } from '@/components/layout/ApiStatus';
import { useProjectLeaves } from '@/hooks/leaves/useProjectLeaves';
import { cn } from '@/utils/cn';

export default function ChatProjectLeafIndexPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { leaves, loading, error, refresh } = useProjectLeaves(projectId, true);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <LoadingSpinner message="Loading leaves..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col">
        <ErrorMessage error={new Error(error)} onRetry={() => void refresh()} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-app)]">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] bg-[color-mix(in_srgb,var(--surface-panel)_90%,transparent)] px-5">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-[var(--text-primary)]">Leaf</h1>
          <p className="truncate text-[11px] text-[var(--text-tertiary)]">
            Project output artifacts
          </p>
        </div>
        <span className="inline-flex h-7 items-center rounded-full border border-[var(--accent-leaf)]/25 bg-[var(--accent-leaf-soft)] px-2.5 text-[11px] font-medium text-[var(--accent-leaf)]">
          {leaves.length} {leaves.length === 1 ? 'leaf' : 'leaves'}
        </span>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-5">
        {leaves.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-panel)] p-6 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--accent-leaf)]/20 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]">
                <LeafIcon className="h-5 w-5" />
              </div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                No leaves in this project yet
              </h2>
              <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">
                Leaf is the output layer for committed meaning. Create a leaf from committed canvas
                work, then it will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto grid w-full max-w-4xl gap-2">
            {leaves.map((leaf) => {
              const assertionCount = leaf.runner_assertions?.length ?? leaf.assertions?.length ?? 0;
              const passedCount =
                leaf.runner_assertions?.filter((assertion) => assertion.passed).length ??
                leaf.assertions?.filter((assertion) => assertion.passed).length ??
                0;
              const hasOutput = Boolean(leaf.output);

              return (
                <button
                  key={leaf.id}
                  type="button"
                  onClick={() =>
                    router.push(
                      `/chat/project/${encodeURIComponent(projectId)}/leaf/${encodeURIComponent(
                        leaf.id
                      )}`
                    )
                  }
                  className="grid min-h-[72px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-panel)] px-3 py-3 text-left transition-colors hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg)]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--accent-leaf)]/20 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]">
                    <FileText className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                      {leaf.title?.trim() || `${leaf.type} leaf`}
                    </span>
                    <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
                      <span>{leaf.type}</span>
                      <span aria-hidden="true">·</span>
                      <span>{hasOutput ? 'generated' : 'draft'}</span>
                      {assertionCount > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {passedCount}/{assertionCount} assertions
                          </span>
                        </>
                      )}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'inline-flex h-6 items-center rounded-full border px-2 text-[10px] font-semibold',
                      hasOutput
                        ? 'border-[var(--accent-leaf)]/25 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]'
                        : 'border-[var(--accent-pending)]/25 bg-[var(--accent-pending-soft)] text-[var(--accent-pending)]'
                    )}
                  >
                    {hasOutput ? 'leaf' : 'draft'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
