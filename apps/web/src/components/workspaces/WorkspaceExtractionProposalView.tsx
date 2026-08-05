'use client';

import { Bot, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buildOpCardModel } from '@/domain/yops/opCardModel';
import { useWorkspaceExtractionTransition } from '@/hooks/workspaces/useWorkspaceExtractionTransition';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { TransitionReviewPanel } from './TransitionReviewPanel';

export function WorkspaceExtractionProposalView({ candidate }: { candidate: WorkspaceCandidate }) {
  const proposal = candidate.extractionProposal;
  const transition = useWorkspaceExtractionTransition(
    candidate.projectId,
    candidate.id,
    candidate.backendCandidateId
  );
  if (!proposal) return null;
  const cards = proposal.operations.map(buildOpCardModel);

  return (
    <section aria-label="Repository extraction proposal" className="min-h-0 flex-1 overflow-auto">
      <header className="flex min-h-[72px] flex-wrap items-center gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">
            Repository extraction proposal
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
            Canonical SourcedYOps from immutable Source turns. Review cards are derived and
            read-only.
          </p>
        </div>
        <Badge variant="secondary">{cards.length} operations</Badge>
        <Badge variant="outline">{proposal.mode}</Badge>
        <Badge variant={transition.transitionId ? 'pending-subtle' : 'outline'}>
          {transition.transitionId ? 'Transition proposed' : 'Workspace proposal'}
        </Badge>
      </header>

      <div className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
        <section aria-label="Extraction operations" className="grid content-start gap-2">
          {cards.map((card, index) => (
            <details
              className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)]"
              key={`${card.key}-${index}`}
            >
              <summary className="flex cursor-pointer list-none items-start gap-3 px-3 py-3">
                <span className="pt-0.5 font-mono text-xs text-[var(--text-tertiary)]">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{card.verb.toUpperCase()}</Badge>
                    <strong className="text-sm text-[var(--text-primary)]">{card.summary}</strong>
                  </span>
                  {card.path ? (
                    <span className="mt-1 block break-all font-mono text-[10px] text-[var(--text-tertiary)]">
                      {card.path}
                    </span>
                  ) : null}
                  {card.provenance?.quote ? (
                    <blockquote className="mt-2 line-clamp-2 text-xs italic leading-5 text-[var(--text-secondary)]">
                      “{card.provenance.quote}”
                    </blockquote>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                  <Bot aria-hidden="true" className="size-3" />
                  {card.source.attribution ?? 'agent'}
                  <ChevronDown aria-hidden="true" className="size-3" />
                </span>
              </summary>
              <div className="border-t border-[var(--stroke-divider)] px-3 py-3">
                <pre className="overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--surface-panel)] p-3 font-mono text-xs text-[var(--text-secondary)]">
                  {card.rawYaml}
                </pre>
                {card.provenance ? (
                  <p className="mt-2 break-all font-mono text-[10px] text-[var(--text-tertiary)]">
                    Source turn: {card.provenance.turnHash}
                  </p>
                ) : null}
              </div>
            </details>
          ))}
        </section>

        <div className="grid content-start gap-3">
          <TransitionReviewPanel
            error={transition.error}
            loading={transition.loading}
            view={transition.view}
          />
          {!transition.loading && !transition.error && !transition.view ? (
            <section className="rounded-md border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4 text-xs leading-5 text-[var(--text-secondary)]">
              This candidate is persisted in the Workspace. An authenticated MCP or API proposer can
              promote it to a durable Transition; Decision and Commit remain human-controlled.
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}
