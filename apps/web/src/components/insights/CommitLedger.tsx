import { GitBranch, GitCommit, GitFork, Layers3 } from 'lucide-react';
import { SemanticCard } from '@/components/SemanticCard';
import { Badge } from '@/components/ui/badge';
import {
  type InsightsLedger,
  type LedgerCommit,
  shortCommitHash,
} from '@/domain/insights/groupByBranch';
import type { SemanticEntry } from '@/types/semantic';
import { cn } from '@/utils/cn';

interface CommitLedgerProps {
  ledger: InsightsLedger;
  onSelectEntry: (entry: SemanticEntry) => void;
  selectedEntry: SemanticEntry | null;
}

function CommitRow({
  commit,
  isSelected,
  onSelect,
}: {
  commit: LedgerCommit;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const displayHash = shortCommitHash(commit.hash);

  return (
    <button
      aria-label={`Select commit ${commit.message} on ${commit.branch} ${displayHash}`}
      aria-pressed={isSelected}
      className={cn(
        'grid w-full grid-cols-[80px_minmax(160px,1fr)_76px_64px] items-center gap-3 border-t border-l-2 border-l-transparent border-t-[var(--stroke-divider)] px-3 py-2 text-left transition-colors',
        'sm:grid-cols-[88px_minmax(180px,1fr)_84px_68px] lg:grid-cols-[96px_minmax(220px,1fr)_92px_72px]',
        'hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40',
        isSelected && 'border-l-[var(--accent-commit)] bg-[var(--accent-commit-soft)]'
      )}
      onClick={onSelect}
      type="button"
    >
      <code className="font-mono text-[11px] text-[var(--text-tertiary)]">{displayHash}</code>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
          {commit.message}
        </span>
        <span className="block truncate text-[11px] text-[var(--text-tertiary)]">
          {commit.author}
        </span>
      </span>
      <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
        {commit.treeCount} trees
      </span>
      <span className="text-right text-[11px] text-[var(--text-tertiary)]">
        {commit.entry.updatedAt}
      </span>
    </button>
  );
}

export function CommitLedger({ ledger, onSelectEntry, selectedEntry }: CommitLedgerProps) {
  return (
    <div className="grid min-h-0 gap-[var(--space-section)] 2xl:grid-cols-[minmax(680px,1fr)_360px]">
      <section
        aria-label="Semantic commit ledger"
        className="min-w-0 overflow-hidden rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)]"
      >
        <div className="flex items-center justify-between gap-4 border-b border-[var(--stroke-divider)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Semantic Ledger</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1 border-[var(--accent-commit)]/25 text-[var(--accent-commit)]"
            >
              <GitCommit className="h-3 w-3" />
              {ledger.totals.commits}
            </Badge>
            <Badge
              variant="outline"
              className="gap-1 border-[var(--accent-branch)]/25 text-[var(--accent-branch)]"
            >
              <GitBranch className="h-3 w-3" />
              {ledger.totals.branches}
            </Badge>
          </div>
        </div>

        <div className="divide-y divide-[var(--stroke-divider)]">
          {ledger.projects.map((project) => (
            <section key={project.projectId} aria-label={`Project ${project.projectName}`}>
              <div className="flex items-center justify-between gap-3 bg-[var(--surface-card)] px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Layers3 className="h-4 w-4 shrink-0 text-[var(--accent-commit)]" />
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                      {project.projectName}
                    </h3>
                    <p className="text-[11px] text-[var(--text-tertiary)]">
                      {project.commitCount} commits across {project.branchCount} branches
                    </p>
                  </div>
                </div>
              </div>

              {project.branches.map((branch) => (
                <section key={branch.branch} aria-label={`Branch ${branch.branch}`}>
                  <div className="flex items-center gap-2 border-t border-[var(--stroke-divider)] bg-[var(--surface-elevated)] px-4 py-2">
                    <GitFork className="h-3.5 w-3.5 text-[var(--accent-branch)]" />
                    <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                      {branch.branch}
                    </span>
                    <span className="text-[11px] text-[var(--text-tertiary)]">
                      {branch.commitCount} commits
                    </span>
                  </div>

                  {branch.buckets.map((bucket) => (
                    <div key={bucket.id}>
                      <div className="border-t border-[var(--stroke-divider)] px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                        {bucket.label}
                      </div>
                      {bucket.commits.map((commit) => (
                        <CommitRow
                          commit={commit}
                          isSelected={selectedEntry?.id === commit.entry.id}
                          key={commit.hash}
                          onSelect={() => onSelectEntry(commit.entry)}
                        />
                      ))}
                    </div>
                  ))}
                </section>
              ))}
            </section>
          ))}
        </div>
      </section>

      <aside aria-label="Selected commit detail" className="min-w-0">
        {selectedEntry ? (
          <SemanticCard entry={selectedEntry} />
        ) : (
          <div className="rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4 text-sm text-[var(--text-tertiary)]">
            No commit selected.
          </div>
        )}
      </aside>
    </div>
  );
}
