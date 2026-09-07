import { type ReactNode, useMemo, useState } from 'react';
import { T3XDiff } from '@/components/shared/T3XDiff';
import { Badge } from '@/components/ui/badge';
import { buildStructuredStateDiff } from '@/domain/diff/structuredStateDiff';
import { buildStatePointRows } from '@/domain/project/stateViewModel';
import { getWorkspaceYOpsRootKey, normalizeYOpsPath } from '@/domain/workspaces/yopsPaths';
import type { SourceBundleItem, WorkspaceCandidate } from '@/types/workspaces';
import type { WorkspaceYOpsTreeNode } from '@/types/workspaceYops';
import { cn } from '@/utils/cn';

type PreviewTab = 'changes' | 'evidence' | 'yaml';
interface WorkspacePreviewViewProps {
  appliedCount: number;
  baselineTrees: WorkspaceYOpsTreeNode[] | null;
  candidate: WorkspaceCandidate;
  operationCount: number;
  previewReady: boolean;
  previewTrees: WorkspaceYOpsTreeNode[] | null;
  schemaGapCount: number;
  validationPassed: boolean;
  yamlView: ReactNode;
}
const TABS: Array<{ id: PreviewTab; label: string }> = [
  { id: 'changes', label: 'Changes' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'yaml', label: 'Rendered YAML' },
];

export function WorkspacePreviewView(props: WorkspacePreviewViewProps) {
  const {
    baselineTrees,
    candidate,
    previewTrees,
    previewReady,
    schemaGapCount,
    validationPassed,
    yamlView,
  } = props;
  const [activeTab, setActiveTab] = useState<PreviewTab>('changes');
  const [selectedChangeId, setSelectedChangeId] = useState('');
  const comparison = useMemo(() => {
    if (!baselineTrees || !previewTrees) return null;
    const head = { trees: previewTrees, relations: [] };
    const rootKey = getWorkspaceYOpsRootKey(candidate.schemaBindings);
    const normalizedCandidate = {
      ...candidate,
      yopsDraft: {
        ...candidate.yopsDraft,
        operations: candidate.yopsDraft.operations.map((operation) => ({
          ...operation,
          path: normalizeYOpsPath(operation.path, rootKey),
        })),
      },
    };
    return {
      changes: buildStructuredStateDiff({
        baseline: { trees: baselineTrees },
        head,
        workspace: normalizedCandidate,
      }),
      rows: buildStatePointRows(head),
    };
  }, [baselineTrees, previewTrees, candidate]);

  return (
    <section
      aria-label="Workspace preview"
      className="min-w-0 overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)]"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-3">
        <div aria-label="Preview views" className="flex" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`workspace-preview-tab-${tab.id}`}
              aria-controls={`workspace-preview-${tab.id}`}
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'border-b-2 px-3 py-3 text-xs font-semibold',
                activeTab === tab.id
                  ? 'border-[var(--accent-branch)] text-[var(--accent-branch)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 py-2 text-xs text-[var(--text-secondary)]">
          <Badge variant={validationPassed ? 'success' : 'pending-subtle'}>
            {validationPassed ? 'YOps validated' : 'Not validated'}
          </Badge>
          <Badge variant={schemaGapCount ? 'warning' : 'pending-subtle'}>
            {schemaGapCount
              ? `${schemaGapCount} schema ${schemaGapCount === 1 ? 'gap' : 'gaps'}`
              : 'No schema gaps reported'}
          </Badge>
        </div>
      </header>
      <div
        role="tabpanel"
        id="workspace-preview-changes"
        aria-labelledby="workspace-preview-tab-changes"
        hidden={activeTab !== 'changes'}
      >
        {comparison ? (
          <T3XDiff
            baselineLabel="Baseline"
            changes={comparison.changes}
            contextRows={comparison.rows}
            headerSubtitle={
              previewReady
                ? 'Materialized preview · Baseline → Result'
                : 'Validated preview · Baseline → Result'
            }
            onSelectChange={setSelectedChangeId}
            pathSubtitle="Changed state paths"
            projectedLabel="Result"
            selectedChangeId={selectedChangeId}
            secondaryStat={
              <Badge variant={validationPassed ? 'success' : 'pending-subtle'}>
                {validationPassed ? 'Replay validated' : 'Replay not validated'}
              </Badge>
            }
          />
        ) : (
          <div className="p-4">
            <p className="mb-3 text-sm text-[var(--text-secondary)]">
              Comparison unavailable: the baseline or result has not been loaded.
            </p>
            {yamlView}
          </div>
        )}
      </div>
      <div
        role="tabpanel"
        id="workspace-preview-evidence"
        aria-labelledby="workspace-preview-tab-evidence"
        hidden={activeTab !== 'evidence'}
      >
        <EvidenceView {...props} />
      </div>
      <div
        role="tabpanel"
        id="workspace-preview-yaml"
        aria-labelledby="workspace-preview-tab-yaml"
        hidden={activeTab !== 'yaml'}
      >
        {activeTab === 'yaml' ? yamlView : null}
      </div>
    </section>
  );
}

function EvidenceView({
  appliedCount,
  candidate,
  operationCount,
  previewReady,
  schemaGapCount,
  validationPassed,
}: {
  appliedCount: number;
  candidate: WorkspaceCandidate;
  operationCount: number;
  previewReady: boolean;
  schemaGapCount: number;
  validationPassed: boolean;
}) {
  return (
    <div className="grid gap-4 bg-[var(--workspace-panel)] p-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-5">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">Evidence coverage</h3>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          Sources referenced by the operations that produced this preview.
        </p>
        {candidate.sourceBundle.length > 0 ? (
          <div className="mt-4 grid gap-3">
            {candidate.sourceBundle.map((source, index) => {
              const references = candidate.yopsDraft.operations.filter((operation) =>
                operation.sourceRefs?.includes(source.id)
              );
              const excerpt = getSourceExcerpt(source);
              return (
                <article
                  className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4"
                  key={source.id}
                >
                  <div className="flex flex-wrap items-start gap-2">
                    <Badge variant="branch-subtle">S{index + 1}</Badge>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                        {source.title}
                      </h4>
                      <div className="mt-1 font-mono text-[10px] text-[var(--text-tertiary)]">
                        {source.id}
                      </div>
                    </div>
                    <Badge variant={references.length > 0 ? 'success' : 'pending-subtle'}>
                      {references.length} {references.length === 1 ? 'reference' : 'references'}
                    </Badge>
                  </div>
                  {excerpt ? (
                    <p className="mt-4 border-l-2 border-[var(--accent-branch)] pl-3 text-sm leading-6 text-[var(--text-secondary)]">
                      {excerpt}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-md border border-dashed border-[var(--stroke-divider)] p-6 text-center text-sm text-[var(--text-tertiary)]">
            No source evidence is attached.
          </div>
        )}
      </section>

      <aside className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-5">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">Validation summary</h3>
        <dl className="mt-4 grid gap-3">
          <ValidationRow label="Sources" value={String(candidate.sourceBundle.length)} />
          <ValidationRow label="Proposed changes" value={String(operationCount)} />
          <ValidationRow label="YOps validation" value={validationPassed ? 'Passed' : 'Pending'} />
          <ValidationRow
            label="Schema review"
            value={
              schemaGapCount === 0
                ? 'No gaps reported'
                : `${schemaGapCount} ${schemaGapCount === 1 ? 'gap' : 'gaps'}`
            }
          />
          <ValidationRow
            label="Preview state"
            value={previewReady ? `${appliedCount} materialized` : 'Dry-run only'}
          />
        </dl>
      </aside>
    </div>
  );
}

function ValidationRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--stroke-divider)] pb-3">
      <dt className="text-xs text-[var(--text-tertiary)]">{label}</dt>
      <dd className="text-xs font-semibold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function getSourceExcerpt(source: SourceBundleItem): string {
  if (source.previewText?.trim()) return source.previewText.trim();
  const turns = source.previewTurns ?? [];
  const userTurn = [...turns].reverse().find((turn) => turn.role === 'user' && turn.content.trim());
  if (userTurn) return userTurn.content.trim();
  const lastTurn = [...turns].reverse().find((turn) => turn.content.trim());
  if (lastTurn) return lastTurn.content.trim();
  return source.description?.trim() ?? '';
}
