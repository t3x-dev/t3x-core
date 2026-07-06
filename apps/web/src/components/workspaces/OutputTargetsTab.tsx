import {
  ArrowRight,
  FileText,
  GitCommitHorizontal,
  Leaf,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatUserFacingError } from '@/domain/format/errors';
import { dispatchLeafChanged } from '@/hooks/leaves/leafEvents';
import { useCreateLeaf } from '@/hooks/leaves/useCreateLeaf';
import type { LeafType } from '@/types/api';
import type { WorkspaceCandidate, WorkspaceOutputTarget } from '@/types/workspaces';
import { cn } from '@/utils/cn';

export function OutputTargetsTab({ candidate }: { candidate: WorkspaceCandidate }) {
  const targets = candidate.outputTargets;
  const committedHash = candidate.lastCommitHash ?? null;
  const { create: createLeaf } = useCreateLeaf();
  const [selectedTargetId, setSelectedTargetId] = useState(() => targets[0]?.id ?? '');
  const [creatingTargetId, setCreatingTargetId] = useState<string | null>(null);
  const [createdLeafByTargetId, setCreatedLeafByTargetId] = useState<Record<string, string>>({});
  const [leafError, setLeafError] = useState<string | null>(null);
  const selectedTarget = targets.find((target) => target.id === selectedTargetId) ?? targets[0];
  const createdLeafId = selectedTarget ? createdLeafByTargetId[selectedTarget.id] : undefined;
  const creating = creatingTargetId === selectedTarget?.id;
  const createLeafTitle = getCreateLeafTitle({
    committedHash,
    createdLeafId,
    creating,
  });

  const handleCreateLeaf = async () => {
    if (!selectedTarget || !committedHash || creating || createdLeafId) return;

    setCreatingTargetId(selectedTarget.id);
    setLeafError(null);
    try {
      const leaf = await createLeaf({
        commit_hash: committedHash,
        config: {
          format: selectedTarget.format,
          instruction: selectedTarget.instruction,
          source_scope: selectedTarget.sourceScope,
          workspace_id: candidate.id,
        },
        constraints: (selectedTarget.constraints ?? []).map((constraint, index) => ({
          id: `constraint_${selectedTarget.id}_${index + 1}`,
          match_mode: 'semantic' as const,
          type: 'require' as const,
          value: constraint,
        })),
        project_id: candidate.projectId,
        source: { type: 'user' },
        title: selectedTarget.title,
        type: outputTargetToLeafType(selectedTarget),
      });
      setCreatedLeafByTargetId((current) => ({ ...current, [selectedTarget.id]: leaf.id }));
      dispatchLeafChanged({
        commitHash: committedHash,
        leafId: leaf.id,
        projectId: candidate.projectId,
        reason: 'created',
      });
    } catch (error) {
      setLeafError(formatUserFacingError(error, 'Could not create leaf.'));
    } finally {
      setCreatingTargetId(null);
    }
  };

  if (!selectedTarget) {
    return (
      <div className="rounded-md border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-subtle)] p-6 text-center text-sm text-[var(--text-secondary)]">
        No leaf config yet.
      </div>
    );
  }

  return (
    <div className="grid min-h-[520px] gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside
        aria-label="Leaf draft configs"
        className="flex min-h-0 flex-col rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-subtle)]"
      >
        <div className="border-b border-[var(--stroke-divider)] px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Leaf drafts</h3>
            <Badge variant="leaf">{targets.length} config</Badge>
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Prepared now, created after commit.
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
          {targets.map((target) => {
            const selected = target.id === selectedTarget.id;
            return (
              <button
                aria-current={selected ? 'true' : undefined}
                className={cn(
                  'grid grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-md border px-3 py-3 text-left transition-colors',
                  selected
                    ? 'border-[var(--accent-leaf)]/40 bg-[var(--accent-leaf-soft)]'
                    : 'border-transparent bg-transparent hover:border-[var(--stroke-divider)] hover:bg-[var(--surface-card)]'
                )}
                key={target.id}
                onClick={() => setSelectedTargetId(target.id)}
                type="button"
              >
                <span className="mt-0.5 flex size-8 items-center justify-center rounded-md border border-[var(--accent-leaf)]/25 bg-[var(--surface-card)] text-[var(--accent-leaf)]">
                  <Leaf className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                    {target.title}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                    <span>{target.leafType ?? target.type}</span>
                    <span aria-hidden="true">/</span>
                    <span>{target.format}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <section
        aria-label="Leaf config detail"
        className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]"
      >
        <div className="flex min-h-0 flex-col rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--stroke-divider)] px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold text-[var(--text-primary)]">
                  {selectedTarget.title}
                </h3>
                <Badge variant="pending">Pre-commit config</Badge>
              </div>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Define the Leaf that will be created from the committed YOps result.
              </p>
            </div>
            <Button
              disabled={!committedHash || creating || Boolean(createdLeafId)}
              onClick={handleCreateLeaf}
              size="sm"
              title={createLeafTitle}
              type="button"
              variant="leaf"
            >
              <Leaf className="size-4" />
              {createdLeafId
                ? 'Leaf created'
                : creating
                  ? 'Creating leaf'
                  : committedHash
                    ? 'Create Leaf'
                    : 'Create after commit'}
            </Button>
          </div>
          {leafError ? (
            <div
              className="border-t border-[var(--stroke-divider)] bg-[var(--status-error-muted)] px-4 py-2 text-sm text-[var(--status-error)]"
              role="alert"
            >
              {leafError}
            </div>
          ) : null}
          {createdLeafId ? (
            <output className="block border-t border-[var(--stroke-divider)] bg-[var(--accent-leaf-soft)] px-4 py-2 text-sm font-medium text-[var(--accent-leaf)]">
              Created leaf {createdLeafId}
            </output>
          ) : null}

          <div className="grid gap-3 p-4">
            <ConfigRow
              icon={<GitCommitHorizontal className="size-4" />}
              label="Commit gate"
              value={
                candidate.lastCommitHash
                  ? `Ready from ${candidate.lastCommitHash}`
                  : 'Waiting for workspace commit'
              }
            />
            <ConfigRow
              icon={<FileText className="size-4" />}
              label="Leaf type"
              value={`${selectedTarget.leafType ?? selectedTarget.type} / ${selectedTarget.format}`}
            />
            <ConfigRow
              icon={<Settings2 className="size-4" />}
              label="Source scope"
              value={selectedTarget.sourceScope ?? 'Committed candidate tree and source refs.'}
            />

            <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-subtle)] p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                <Settings2 className="size-3.5" />
                Generation instruction
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">
                {selectedTarget.instruction ??
                  'Generate the configured Leaf from the committed state.'}
              </p>
            </div>

            <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-subtle)] p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                <ShieldCheck className="size-3.5" />
                Constraints
              </div>
              <ul className="mt-2 grid gap-2">
                {(selectedTarget.constraints ?? ['Use committed state only.']).map((constraint) => (
                  <li className="flex gap-2 text-sm text-[var(--text-primary)]" key={constraint}>
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--accent-leaf)]" />
                    <span>{constraint}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <LeafPreview target={selectedTarget} candidate={candidate} committedHash={committedHash} />
      </section>
    </div>
  );
}

function getCreateLeafTitle({
  committedHash,
  createdLeafId,
  creating,
}: {
  committedHash: string | null;
  createdLeafId?: string;
  creating: boolean;
}): string {
  if (createdLeafId) return `Leaf ${createdLeafId} has already been created.`;
  if (creating) return 'Creating a Leaf from the committed workspace state.';
  if (!committedHash) return 'Commit this workspace before creating a Leaf.';
  return 'Create a Leaf from the committed workspace state.';
}

function outputTargetToLeafType(target: WorkspaceOutputTarget): LeafType {
  if (target.leafType === 'api') return 'deploy_agent';
  return 'article';
}

function ConfigRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-subtle)] px-3 py-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
        {icon}
        {label}
      </div>
      <p className="text-sm font-medium text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function LeafPreview({
  candidate,
  committedHash,
  target,
}: {
  candidate: WorkspaceCandidate;
  committedHash: string | null;
  target: WorkspaceOutputTarget;
}) {
  return (
    <aside
      aria-label="Leaf output preview"
      className="flex min-h-0 flex-col rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-subtle)]"
    >
      <div className="border-b border-[var(--stroke-divider)] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Leaf preview</h3>
          <Badge variant="leaf">Draft</Badge>
        </div>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Mirrors the Chat Leaf workspace.
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="rounded-md border border-[var(--accent-leaf)]/30 bg-[var(--surface-panel)] p-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md border border-[var(--accent-leaf)]/25 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]">
              <Leaf className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {target.previewTitle ?? target.title}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                {target.leafType ?? target.type} artifact
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            {target.previewBody ??
              'Leaf output will be generated from the committed workspace state.'}
          </p>
        </div>

        <div className="grid gap-2 text-sm">
          <PreviewStep label="YOps result" value={candidate.title} />
          <PreviewStep label="Branch" value={candidate.targetBranch} />
          <PreviewStep label="Format" value={target.format.toUpperCase()} />
        </div>

        <div className="mt-auto rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <GitCommitHorizontal className="size-4 text-[var(--accent-commit)]" />
            {committedHash ? 'Commit ready' : 'Commit first'}
            <ArrowRight className="size-4 text-[var(--text-tertiary)]" />
            <Leaf className="size-4 text-[var(--accent-leaf)]" />
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
            {committedHash
              ? `Leaf creation can cite ${committedHash}.`
              : 'Leaf creation stays after commit so output can cite a stable state hash.'}
          </p>
        </div>
      </div>
    </aside>
  );
}

function PreviewStep({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 py-2">
      <span className="text-xs text-[var(--text-tertiary)]">{label}</span>
      <span className="truncate text-sm font-medium text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
