import { type ReactNode, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { SourceBundleItem, WorkspaceCandidate } from '@/types/workspaces';
import type { WorkspaceYOpsTreeNode, WorkspaceYOpsValue } from '@/types/workspaceYops';
import { cn } from '@/utils/cn';

type PrdPreviewTab = 'prd' | 'evidence' | 'changes' | 'yaml';

interface PrdPreviewViewProps {
  appliedCount: number;
  candidate: WorkspaceCandidate;
  changesView: ReactNode;
  commitReady: boolean;
  operationCount: number;
  previewReady: boolean;
  previewTrees: WorkspaceYOpsTreeNode[] | null;
  schemaGapCount: number;
  validationPassed: boolean;
  yamlView: ReactNode;
}

interface PrdDocumentRequirement {
  acceptance: string[];
  key: string;
  priority: string;
  title: string;
}

interface PrdDocumentModel {
  audience: string;
  outcome: string;
  problem: string;
  requirements: PrdDocumentRequirement[];
  title: string;
}

const PREVIEW_TABS: Array<{ id: PrdPreviewTab; label: string }> = [
  { id: 'prd', label: 'PRD' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'changes', label: 'Changes' },
  { id: 'yaml', label: 'YAML' },
];

export function PrdPreviewView({
  appliedCount,
  candidate,
  changesView,
  commitReady,
  operationCount,
  previewReady,
  previewTrees,
  schemaGapCount,
  validationPassed,
  yamlView,
}: PrdPreviewViewProps) {
  const [activeTab, setActiveTab] = useState<PrdPreviewTab>('prd');
  const model = useMemo(
    () => buildPrdDocumentModel(previewTrees, candidate),
    [candidate, previewTrees]
  );

  return (
    <section
      aria-label="PRD preview"
      className="overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)]"
    >
      <header className="flex min-h-[54px] flex-wrap items-center gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4">
        <div aria-label="Preview views" className="flex self-stretch" role="tablist">
          {PREVIEW_TABS.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                aria-controls={`prd-preview-${tab.id}`}
                aria-selected={selected}
                className={cn(
                  'min-w-[92px] border-0 border-b-2 px-4 text-xs font-semibold transition-colors',
                  selected
                    ? 'border-[var(--accent-branch)] text-[var(--accent-branch)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
                )}
                id={`prd-preview-tab-${tab.id}`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <span className="ml-auto text-[11px] text-[var(--text-tertiary)]">
          Read the PRD first · inspect supporting data when needed
        </span>
      </header>

      <div
        aria-labelledby="prd-preview-tab-prd"
        hidden={activeTab !== 'prd'}
        id="prd-preview-prd"
        role="tabpanel"
      >
        <PrdReadingView
          appliedCount={appliedCount}
          candidate={candidate}
          commitReady={commitReady}
          model={model}
          operationCount={operationCount}
          previewReady={previewReady}
          schemaGapCount={schemaGapCount}
          validationPassed={validationPassed}
        />
      </div>

      <div
        aria-labelledby="prd-preview-tab-evidence"
        hidden={activeTab !== 'evidence'}
        id="prd-preview-evidence"
        role="tabpanel"
      >
        <EvidenceView
          appliedCount={appliedCount}
          candidate={candidate}
          operationCount={operationCount}
          previewReady={previewReady}
          schemaGapCount={schemaGapCount}
          validationPassed={validationPassed}
        />
      </div>

      <div
        aria-labelledby="prd-preview-tab-changes"
        className="bg-[var(--workspace-panel)] p-3"
        hidden={activeTab !== 'changes'}
        id="prd-preview-changes"
        role="tabpanel"
      >
        {changesView}
      </div>

      <div
        aria-labelledby="prd-preview-tab-yaml"
        className="bg-[var(--workspace-panel)] p-3"
        hidden={activeTab !== 'yaml'}
        id="prd-preview-yaml"
        role="tabpanel"
      >
        {yamlView}
      </div>
    </section>
  );
}

function PrdReadingView({
  appliedCount,
  candidate,
  commitReady,
  model,
  operationCount,
  previewReady,
  schemaGapCount,
  validationPassed,
}: {
  appliedCount: number;
  candidate: WorkspaceCandidate;
  commitReady: boolean;
  model: PrdDocumentModel;
  operationCount: number;
  previewReady: boolean;
  schemaGapCount: number;
  validationPassed: boolean;
}) {
  const primarySource = candidate.sourceBundle[0] ?? null;
  const sourceExcerpt = primarySource ? getSourceExcerpt(primarySource) : '';

  return (
    <div className="grid min-h-[650px] xl:grid-cols-[minmax(0,1fr)_340px]">
      <article className="min-w-0 bg-[var(--surface-card)] px-7 py-8 sm:px-10 xl:px-14">
        <div className="mx-auto max-w-[860px]">
          <header className="border-b border-[var(--stroke-divider)] pb-6">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              Product requirements document
            </div>
            <div className="mt-3 flex flex-wrap items-start gap-3">
              <h2 className="text-3xl font-bold tracking-[-0.025em] text-[var(--text-primary)]">
                {model.title}
              </h2>
              <Badge variant={commitReady ? 'success' : 'pending-subtle'}>
                {commitReady ? 'Ready to commit' : 'Review required'}
              </Badge>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
              {candidate.summary}
            </p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--text-tertiary)]">
              <span>{getSchemaLabel(candidate)}</span>
              <span>{formatCount(candidate.sourceBundle.length, 'source')}</span>
              <span>{formatCount(operationCount, 'change')}</span>
              <span>{previewReady ? `${appliedCount} materialized` : 'Not materialized'}</span>
            </div>
          </header>

          <PrdSection
            candidate={candidate}
            citations={getPathCitations(candidate, 'summary/problem')}
            title="Problem"
            value={model.problem || 'No problem statement provided.'}
          />
          <PrdSection
            candidate={candidate}
            citations={getPathCitations(candidate, 'summary/audience')}
            title="Audience"
            value={model.audience || 'No audience specified.'}
          />
          <PrdSection
            candidate={candidate}
            citations={getPathCitations(candidate, 'summary/outcome')}
            title="Outcome"
            value={model.outcome || 'No outcome specified.'}
          />

          <section className="border-b border-[var(--stroke-divider)] py-7">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              Requirements
            </div>
            {model.requirements.length > 0 ? (
              <div className="mt-4 grid gap-6">
                {model.requirements.map((requirement, index) => {
                  const citations = getPathCitations(candidate, `requirements/${requirement.key}`);
                  return (
                    <section key={`${requirement.key}:${String(index)}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-[var(--text-primary)]">
                          {requirement.title}
                        </h3>
                        {requirement.priority ? (
                          <Badge variant="pending-subtle">
                            {requirement.priority.toUpperCase()}
                          </Badge>
                        ) : null}
                        <CitationList candidate={candidate} sourceIds={citations} />
                      </div>
                      <h4 className="mt-5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
                        Acceptance criteria
                      </h4>
                      {requirement.acceptance.length > 0 ? (
                        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-[var(--text-secondary)]">
                          {requirement.acceptance.map((criterion, criterionIndex) => (
                            <li key={`${criterion}:${String(criterionIndex)}`}>{criterion}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-[var(--text-tertiary)]">
                          No acceptance criteria specified.
                        </p>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--text-tertiary)]">
                No requirements were materialized in this preview.
              </p>
            )}
          </section>
        </div>
      </article>

      <aside
        aria-label="PRD source and validation summary"
        className="border-t border-[var(--stroke-divider)] bg-[var(--surface-panel)] xl:border-t-0 xl:border-l"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--stroke-divider)] px-5 py-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              Source &amp; validation
            </div>
            <h3 className="mt-2 text-sm font-bold text-[var(--text-primary)]">Preview readiness</h3>
          </div>
          <Badge variant={commitReady ? 'success' : 'pending-subtle'}>
            {commitReady
              ? 'Ready to commit'
              : schemaGapCount > 0
                ? `${schemaGapCount} ${schemaGapCount === 1 ? 'schema gap' : 'schema gaps'}`
                : 'Review required'}
          </Badge>
        </header>

        <section className="border-b border-[var(--stroke-divider)] px-5 py-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
            Matched source
          </div>
          {primarySource ? (
            <>
              <div className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                {primarySource.title}
              </div>
              <div className="mt-1 break-all font-mono text-[10px] text-[var(--text-tertiary)]">
                {primarySource.id}
              </div>
              {sourceExcerpt ? (
                <blockquote className="mt-4 border-l-2 border-[var(--accent-branch)] bg-[var(--accent-branch)]/5 px-4 py-3 text-xs leading-5 text-[var(--text-secondary)]">
                  “{sourceExcerpt}”
                </blockquote>
              ) : null}
            </>
          ) : (
            <p className="mt-3 text-sm text-[var(--text-tertiary)]">
              No source material is attached to this preview.
            </p>
          )}
        </section>

        <section className="grid grid-cols-2 gap-2 border-b border-[var(--stroke-divider)] p-5">
          <ProofMetric label="Source" value={primarySource ? 'Captured' : 'Missing'} />
          <ProofMetric label="Proposal" value={`${operationCount} reviewed`} />
          <ProofMetric label="YOps" value={validationPassed ? 'Validated' : 'Pending'} />
          <ProofMetric label="Render" value={previewReady ? 'Materialized' : 'Dry-run'} />
          <ProofMetric
            label="Schema"
            value={
              schemaGapCount === 0
                ? 'Satisfied'
                : `${schemaGapCount} ${schemaGapCount === 1 ? 'gap' : 'gaps'}`
            }
          />
        </section>

        <p className="px-5 py-5 text-xs leading-5 text-[var(--text-tertiary)]">
          Detailed evidence, field changes, and YAML remain available in the tabs above without
          interrupting the reading view.
        </p>
      </aside>
    </div>
  );
}

function PrdSection({
  candidate,
  citations,
  title,
  value,
}: {
  candidate: WorkspaceCandidate;
  citations: string[];
  title: string;
  value: string;
}) {
  return (
    <section className="border-b border-[var(--stroke-divider)] py-6">
      <h3 className="text-base font-bold text-[var(--text-primary)]">{title}</h3>
      <div className="mt-2 flex flex-wrap items-start gap-2">
        <p className="max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">{value}</p>
        <CitationList candidate={candidate} sourceIds={citations} />
      </div>
    </section>
  );
}

function CitationList({
  candidate,
  sourceIds,
}: {
  candidate: WorkspaceCandidate;
  sourceIds: string[];
}) {
  if (sourceIds.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {sourceIds.map((sourceId) => {
        const sourceIndex = candidate.sourceBundle.findIndex((source) => source.id === sourceId);
        return (
          <span
            className="inline-flex min-h-5 min-w-7 items-center justify-center rounded border border-[var(--accent-branch)]/30 bg-[var(--accent-branch)]/5 px-1.5 font-mono text-[10px] font-semibold text-[var(--accent-branch)]"
            key={sourceId}
            title={sourceId}
          >
            {sourceIndex >= 0 ? `S${sourceIndex + 1}` : 'S1'}
          </span>
        );
      })}
    </span>
  );
}

function ProofMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2.5">
      <div className="text-[10px] text-[var(--text-tertiary)]">{label}</div>
      <div className="mt-1 text-xs font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
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
    <div className="grid min-h-[560px] gap-4 bg-[var(--workspace-panel)] p-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-5">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">Evidence coverage</h3>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          Sources referenced by the operations that produced this PRD preview.
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
                ? 'Satisfied'
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

export function buildPrdDocumentModel(
  trees: WorkspaceYOpsTreeNode[] | null,
  candidate: WorkspaceCandidate
): PrdDocumentModel {
  const rootNode = trees?.find((node) => node.key === 'prd') ?? trees?.[0] ?? null;
  const root = rootNode ? treeNodeToRecord(rootNode) : {};
  const summary = toRecord(root.summary);

  return {
    audience: toDisplayString(summary.audience),
    outcome: toDisplayString(summary.outcome),
    problem: toDisplayString(summary.problem),
    requirements: toRequirements(root.requirements),
    title: toDisplayString(root.title) || candidate.title,
  };
}

function treeNodeToRecord(node: WorkspaceYOpsTreeNode): Record<string, WorkspaceYOpsValue> {
  const value: Record<string, WorkspaceYOpsValue> = { ...node.slots };
  node.children.forEach((child) => {
    value[child.key] = treeNodeToRecord(child);
  });
  return value;
}

function toRequirements(value: WorkspaceYOpsValue | undefined): PrdDocumentRequirement[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => requirementFromValue(item, String(index + 1)));
  }

  const record = toRecord(value);
  if (isRequirementRecord(record)) return requirementFromValue(record, 'requirement');

  return Object.entries(record).flatMap(([key, item]) => requirementFromValue(item, key));
}

function requirementFromValue(value: WorkspaceYOpsValue, key: string): PrdDocumentRequirement[] {
  const record = toRecord(value);
  if (Object.keys(record).length === 0) return [];
  return [
    {
      acceptance: toStringList(record.acceptance),
      key,
      priority: toDisplayString(record.priority),
      title: toDisplayString(record.title) || humanizeKey(key),
    },
  ];
}

function isRequirementRecord(value: Record<string, WorkspaceYOpsValue>): boolean {
  return 'title' in value || 'acceptance' in value || 'priority' in value;
}

function toStringList(value: WorkspaceYOpsValue | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map(toDisplayString).filter(Boolean);
  }
  const record = toRecord(value);
  const numericEntries = Object.entries(record)
    .filter(([key]) => /^\d+$/.test(key))
    .sort(([left], [right]) => Number(left) - Number(right));
  if (numericEntries.length > 0) {
    return numericEntries.map(([, item]) => toDisplayString(item)).filter(Boolean);
  }
  const scalar = toDisplayString(value);
  return scalar ? [scalar] : [];
}

function toRecord(value: WorkspaceYOpsValue | undefined): Record<string, WorkspaceYOpsValue> {
  if (!value || Array.isArray(value) || typeof value !== 'object') return {};
  return value;
}

function toDisplayString(value: WorkspaceYOpsValue | undefined): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function humanizeKey(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getPathCitations(candidate: WorkspaceCandidate, pathSuffix: string): string[] {
  const normalizedSuffix = pathSuffix.replace(/^\/+|\/+$/g, '');
  return Array.from(
    new Set(
      candidate.yopsDraft.operations
        .filter((operation) => {
          const normalizedPath = operation.path.replace(/^\/+|\/+$/g, '').replace(/\/-$/, '');
          return (
            normalizedPath.endsWith(normalizedSuffix) || normalizedPath.includes(normalizedSuffix)
          );
        })
        .flatMap((operation) => operation.sourceRefs ?? [])
    )
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

function getSchemaLabel(candidate: WorkspaceCandidate): string {
  const binding = candidate.schemaBindings[0];
  return binding ? `${binding.schemaName} ${binding.version}` : 'Schema not bound';
}

function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
