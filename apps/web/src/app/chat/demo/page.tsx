'use client';

import { DEMO_WORKSPACE_FIXTURE } from '@t3x-dev/core';
import { dump } from 'js-yaml';
import { ArrowRight, FileCode2, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useFixtureReplay } from '@/hooks/drafts/useFixtureReplay';
import { cn } from '@/utils/cn';

function fixtureYaml(): string {
  return dump({ yops: DEMO_WORKSPACE_FIXTURE.replay.yops }, { lineWidth: 88, noRefs: true });
}

export default function DemoFixtureReplayPage() {
  const router = useRouter();
  const replay = useFixtureReplay();
  const yops = useMemo(() => fixtureYaml(), []);
  const previewNodes = DEMO_WORKSPACE_FIXTURE.replay.draft_nodes.slice(0, 3);

  const startReplay = async () => {
    try {
      const result = await replay.start();
      router.push(result.href);
    } catch {
      // useFixtureReplay owns the user-visible error state.
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--background)]">
      <div className="border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-[var(--source)]/25 bg-[var(--source-dim)] px-2 py-1 text-xs font-medium text-[var(--source)]">
              <FileCode2 className="h-3.5 w-3.5" />
              {DEMO_WORKSPACE_FIXTURE.replay.label}
            </div>
            <h1 className="text-xl font-semibold tracking-[0] text-[var(--text-primary)]">
              Prompt Review demo replay
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-normal text-[var(--text-secondary)]">
              A seeded workspace is already available. This starts an editable workbench draft from
              recorded source points, constraints, and YOps without calling a model provider.
            </p>
          </div>
          <Button
            type="button"
            variant="commit"
            className="w-full sm:w-auto"
            disabled={replay.loading}
            onClick={startReplay}
          >
            {replay.loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
            Start fixture replay
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 overflow-auto px-6 py-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="space-y-4">
          <div className="rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-card)] p-4">
            <div className="text-xs font-medium uppercase tracking-[0] text-[var(--text-tertiary)]">
              Source
            </div>
            <h2 className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
              {DEMO_WORKSPACE_FIXTURE.source.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
              {DEMO_WORKSPACE_FIXTURE.source.text}
            </p>
          </div>

          <div className="rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-card)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-[0] text-[var(--text-tertiary)]">
                  Draft Points
                </div>
                <h2 className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                  Included in the editable draft
                </h2>
              </div>
              <span className="rounded-md border border-[var(--accent-pending)]/25 bg-[var(--accent-pending-soft)] px-2 py-1 text-xs font-medium text-[var(--accent-pending)]">
                {DEMO_WORKSPACE_FIXTURE.replay.draft_nodes.length} points
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {previewNodes.map((node) => (
                <div
                  key={node.id}
                  className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 py-2"
                >
                  <div className="font-mono text-[11px] text-[var(--text-tertiary)]">{node.id}</div>
                  <div className="mt-1 text-sm text-[var(--text-secondary)]">{node.text}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex min-h-[420px] flex-col rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-card)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-4 py-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0] text-[var(--text-tertiary)]">
                Recorded YOps
              </div>
              <h2 className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                Deterministic replay payload
              </h2>
            </div>
            <span className="rounded-md border border-[var(--accent-commit)]/25 bg-[var(--accent-commit-soft)] px-2 py-1 text-xs font-medium text-[var(--accent-commit)]">
              no provider
            </span>
          </div>
          <pre
            className={cn(
              'min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed',
              'text-[var(--text-secondary)]'
            )}
          >
            {yops}
          </pre>
        </section>
      </main>

      {replay.error ? (
        <div className="mx-auto w-full max-w-6xl px-6 pb-5">
          <div className="rounded-lg border border-[var(--status-error)]/30 bg-[var(--status-error-muted)] px-3 py-2 text-sm text-[var(--status-error)]">
            {replay.error}
          </div>
        </div>
      ) : null}
    </div>
  );
}
