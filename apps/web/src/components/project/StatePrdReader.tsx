'use client';

import { Check, Copy, FileText, GitCompare, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  PrdRenderEvidence,
  PrdRenderModel,
  PrdRenderRequirement,
  PrdRenderSection,
} from '@/domain/project/stateViewModel';
import { cn } from '@/utils/cn';

type ReaderMode = 'rendered' | 'raw';
type InspectorTab = 'changes' | 'evidence';

interface StatePrdReaderProps {
  model: PrdRenderModel;
  schemaName: string;
  validationGapCount: number;
  validationReady: boolean;
  yamlText: string;
}

export function StatePrdReader({
  model,
  schemaName,
  validationGapCount,
  validationReady,
  yamlText,
}: StatePrdReaderProps) {
  const [mode, setMode] = useState<ReaderMode>('rendered');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab | null>(null);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(
    model.evidence[0]?.id ?? null
  );
  const [copied, setCopied] = useState(false);
  const selectedEvidence =
    model.evidence.find((item) => item.id === selectedEvidenceId) ?? model.evidence[0] ?? null;
  const validationLabel = validationReady
    ? `${String(model.changes.length)} / ${String(model.changes.length)} passed`
    : validationGapCount > 0
      ? `${String(validationGapCount)} validation gap${validationGapCount === 1 ? '' : 's'}`
      : 'Validation pending';

  function openInspector(tab: InspectorTab, evidenceId?: string) {
    if (evidenceId) setSelectedEvidenceId(evidenceId);
    setInspectorTab((current) => (current === tab && !evidenceId ? null : tab));
  }

  async function copyYaml() {
    await navigator.clipboard.writeText(yamlText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section
      aria-label="Schema render"
      className="min-h-[665px] overflow-hidden bg-[var(--surface-card)]"
    >
      <header className="flex min-h-[55px] flex-wrap items-center gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="truncate font-mono text-[11px] font-semibold text-[var(--text-secondary)]">
            prd <span className="text-[var(--text-tertiary)]">/</span>{' '}
            <span className="text-[var(--text-primary)]">{model.title}</span>
          </span>
          <Badge variant={validationReady ? 'success' : 'warning'}>{validationLabel}</Badge>
        </div>

        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
          <Button
            aria-pressed={inspectorTab === 'evidence'}
            onClick={() => openInspector('evidence')}
            size="sm"
            type="button"
            variant="canvas-outline"
          >
            <FileText aria-hidden="true" className="size-3.5" />
            Evidence <span>{model.evidence.length}</span>
          </Button>
          <Button
            aria-pressed={inspectorTab === 'changes'}
            onClick={() => openInspector('changes')}
            size="sm"
            type="button"
            variant="canvas-outline"
          >
            <GitCompare aria-hidden="true" className="size-3.5" />
            Changes <span>{model.changes.length}</span>
          </Button>
          <div
            aria-label="Preview representation"
            className="inline-flex min-h-9 items-stretch rounded-md border border-[var(--stroke-default)] bg-[var(--surface-app)] p-0.5"
            role="tablist"
          >
            {(['rendered', 'raw'] as const).map((nextMode) => (
              <button
                aria-selected={mode === nextMode}
                className={cn(
                  'min-w-[76px] rounded px-3 text-[11px] font-bold capitalize text-[var(--text-tertiary)] transition-colors',
                  mode === nextMode &&
                    'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm'
                )}
                key={nextMode}
                onClick={() => {
                  setMode(nextMode);
                  if (nextMode === 'raw') setInspectorTab(null);
                }}
                role="tab"
                type="button"
              >
                {nextMode}
              </button>
            ))}
          </div>
        </div>
      </header>

      {mode === 'rendered' ? (
        <div
          className={cn(
            'relative grid min-h-[665px] grid-cols-[minmax(0,1fr)_0px] transition-[grid-template-columns] duration-200',
            inspectorTab && 'xl:grid-cols-[minmax(0,1fr)_354px]'
          )}
        >
          <div className="min-w-0 overflow-auto bg-[var(--surface-card)]">
            <PrdDocument
              model={model}
              onInspectEvidence={(evidenceId) => openInspector('evidence', evidenceId)}
              schemaName={schemaName}
              validationGapCount={validationGapCount}
              validationReady={validationReady}
            />
          </div>
          <PrdInspector
            activeTab={inspectorTab}
            model={model}
            onClose={() => setInspectorTab(null)}
            onSelectTab={setInspectorTab}
            selectedEvidence={selectedEvidence}
            validationLabel={validationLabel}
            validationReady={validationReady}
          />
        </div>
      ) : (
        <section
          aria-label="Raw materialized YAML"
          className="min-h-[665px] bg-[var(--surface-code)] text-[var(--text-code)]"
        >
          <header className="flex min-h-11 items-center gap-2 border-b border-[var(--text-tertiary)]/20 bg-[var(--surface-code)] px-4">
            <span className="font-mono text-[11px] font-semibold text-[var(--text-code)]">
              prd.yaml
            </span>
            <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
              materialized · {model.changes.length} applied
            </span>
            <Button
              className="ml-auto border-[var(--text-tertiary)]/30 bg-[var(--text-code)]/[0.04] text-[var(--text-code)] hover:border-[var(--text-tertiary)]/50 hover:bg-[var(--text-code)]/[0.08] hover:text-[var(--text-code)]"
              onClick={() => void copyYaml()}
              size="sm"
              type="button"
              variant="canvas-outline"
            >
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy YAML'}
            </Button>
          </header>
          <YamlCode yamlText={yamlText} />
        </section>
      )}
    </section>
  );
}

function PrdDocument({
  model,
  onInspectEvidence,
  schemaName,
  validationGapCount,
  validationReady,
}: {
  model: PrdRenderModel;
  onInspectEvidence: (evidenceId: string) => void;
  schemaName: string;
  validationGapCount: number;
  validationReady: boolean;
}) {
  return (
    <article className="mx-auto w-[min(1040px,calc(100%-80px))] py-12 max-md:w-[calc(100%-32px)] max-md:py-8">
      <header className="border-b border-[var(--stroke-divider)] pb-7">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
          Product requirements document{model.documentId ? ` · ${model.documentId}` : ''}
        </p>
        <h1 className="mt-2.5 max-w-[820px] text-[31px] font-bold leading-[1.2] tracking-[-0.032em] text-[var(--text-primary)]">
          {model.title}
        </h1>
        <p className="mt-3.5 max-w-[820px] text-[15.5px] leading-[1.72] text-[var(--text-secondary)]">
          {model.lede || model.outcome || model.problem || 'Materialized product requirements.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-[var(--text-tertiary)]">
          <span>{model.schemaVersion || schemaName}</span>
          {model.owner ? <span>Owner: {model.owner}</span> : null}
          <span>{model.evidence.length} sources</span>
          <span>{model.changes.length} changes</span>
          {model.target ? <span>Target: {model.target}</span> : null}
          <span>Materialized commit</span>
        </div>
      </header>

      <section className="border-b border-[var(--stroke-divider)] py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
              Executive summary
            </p>
            <h2 className="mt-2 text-[21px] font-bold leading-[1.35] tracking-[-0.02em] text-[var(--text-primary)]">
              Problem, audience, and intended outcome
            </h2>
          </div>
          <Badge variant={validationReady ? 'success' : 'warning'}>
            {validationReady
              ? 'Review ready'
              : validationGapCount > 0
                ? `${validationGapCount} gaps`
                : 'Review pending'}
          </Badge>
        </div>
        <div className="mt-4 grid border-y border-[var(--stroke-divider)] md:grid-cols-3">
          <SummaryCell
            evidenceIds={evidenceIdsForPath(model, 'summary/problem')}
            label="Problem"
            onInspectEvidence={onInspectEvidence}
            value={model.problem || 'No problem statement provided.'}
          />
          <SummaryCell
            evidenceIds={evidenceIdsForPath(model, 'summary/audience')}
            label="Audience"
            missing={model.audienceMissing}
            onInspectEvidence={onInspectEvidence}
            value={model.audience || 'This field is required by the schema.'}
          />
          <SummaryCell
            evidenceIds={evidenceIdsForPath(model, 'summary/outcome')}
            label="Outcome"
            onInspectEvidence={onInspectEvidence}
            value={model.outcome || 'No outcome specified.'}
          />
        </div>
      </section>

      {model.sections.map((section, index) => (
        <StructuredSection
          index={index + 1}
          key={section.key}
          model={model}
          onInspectEvidence={onInspectEvidence}
          section={section}
        />
      ))}

      <RequirementsSection
        model={model}
        onInspectEvidence={onInspectEvidence}
        sectionNumber={model.sections.length + 1}
      />

      {Object.keys(model.metadata).length > 0 ? (
        <StructuredSection
          index={model.sections.length + 2}
          model={model}
          onInspectEvidence={onInspectEvidence}
          section={{ key: 'metadata', title: 'Document metadata', value: model.metadata }}
        />
      ) : null}
    </article>
  );
}

function SummaryCell({
  evidenceIds,
  label,
  missing = false,
  onInspectEvidence,
  value,
}: {
  evidenceIds: string[];
  label: string;
  missing?: boolean;
  onInspectEvidence: (evidenceId: string) => void;
  value: string;
}) {
  return (
    <section
      className={cn(
        'min-w-0 px-4 py-4 first:pl-0 last:pr-0 md:border-r md:border-[var(--stroke-divider)] md:last:border-r-0',
        missing && 'bg-[var(--status-warning-muted)] px-4 first:pl-4'
      )}
    >
      <h3 className="text-xs font-bold text-[var(--text-primary)]">{label}</h3>
      <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">{value}</p>
      <CitationButtons evidenceIds={evidenceIds} onInspectEvidence={onInspectEvidence} />
    </section>
  );
}

function StructuredSection({
  index,
  model,
  onInspectEvidence,
  section,
}: {
  index: number;
  model: PrdRenderModel;
  onInspectEvidence: (evidenceId: string) => void;
  section: PrdRenderSection;
}) {
  const evidenceIds = evidenceIdsForPath(model, section.key);
  return (
    <section className="border-b border-[var(--stroke-divider)] py-8">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
        {index} · {section.title}
      </p>
      <div className="mt-2 flex flex-wrap items-start gap-2">
        <h2 className="text-[21px] font-bold leading-[1.35] tracking-[-0.02em] text-[var(--text-primary)]">
          {sectionTitle(section)}
        </h2>
        <CitationButtons evidenceIds={evidenceIds} onInspectEvidence={onInspectEvidence} />
      </div>
      <div className="mt-4">
        <StructuredValue value={section.value} />
      </div>
    </section>
  );
}

function RequirementsSection({
  model,
  onInspectEvidence,
  sectionNumber,
}: {
  model: PrdRenderModel;
  onInspectEvidence: (evidenceId: string) => void;
  sectionNumber: number;
}) {
  return (
    <section className="border-b border-[var(--stroke-divider)] py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
            {sectionNumber} · Functional requirements
          </p>
          <h2 className="mt-2 text-[21px] font-bold leading-[1.35] tracking-[-0.02em] text-[var(--text-primary)]">
            Launch contract
          </h2>
        </div>
        <Badge variant="success">{model.requirements.length} materialized</Badge>
      </div>

      {model.requirements.length > 0 ? (
        <div className="mt-4 overflow-x-auto border-y border-[var(--stroke-default)]">
          <table className="w-full min-w-[760px] border-collapse text-left text-[12.5px] leading-[1.55] text-[var(--text-secondary)]">
            <thead>
              <tr className="bg-[var(--surface-panel)] text-[10px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-primary)]">
                <th className="px-3 py-3">ID</th>
                <th className="px-3 py-3">Requirement</th>
                <th className="px-3 py-3">Priority</th>
                <th className="px-3 py-3">Acceptance signal</th>
                <th className="px-3 py-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {model.requirements.map((requirement, index) => (
                <RequirementRow
                  evidenceIds={evidenceIdsForPaths(model, [
                    `requirements/${requirement.key || String(index)}`,
                    `requirements/${String(index)}`,
                  ])}
                  index={index}
                  key={`${requirement.key}:${requirement.title}:${String(index)}`}
                  onInspectEvidence={onInspectEvidence}
                  requirement={requirement}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-[var(--text-tertiary)]">
          No requirements were materialized in this state.
        </p>
      )}
    </section>
  );
}

function RequirementRow({
  evidenceIds,
  index,
  onInspectEvidence,
  requirement,
}: {
  evidenceIds: string[];
  index: number;
  onInspectEvidence: (evidenceId: string) => void;
  requirement: PrdRenderRequirement;
}) {
  return (
    <tr className="border-b border-[var(--stroke-divider)] last:border-b-0">
      <td className="px-3 py-3 align-top font-mono text-[10px] text-[var(--text-tertiary)]">
        {requirement.key || `R-${String(index + 1).padStart(2, '0')}`}
      </td>
      <td className="px-3 py-3 align-top">
        <strong className="text-[var(--text-primary)]">{requirement.title}</strong>
        {requirement.description ? <p className="mt-1">{requirement.description}</p> : null}
      </td>
      <td className="px-3 py-3 align-top">
        <Badge variant="pending-subtle">{requirement.priority || 'P?'}</Badge>
      </td>
      <td className="px-3 py-3 align-top">
        {requirement.acceptance
          ? requirement.acceptance.split('\n').map((criterion) => (
              <span className="block" key={criterion}>
                {criterion}
              </span>
            ))
          : 'Not specified'}
      </td>
      <td className="px-3 py-3 align-top">
        <CitationButtons evidenceIds={evidenceIds} onInspectEvidence={onInspectEvidence} />
      </td>
    </tr>
  );
}

function CitationButtons({
  evidenceIds,
  onInspectEvidence,
}: {
  evidenceIds: string[];
  onInspectEvidence: (evidenceId: string) => void;
}) {
  if (evidenceIds.length === 0) return null;
  return (
    <span className="mt-2 inline-flex flex-wrap gap-1">
      {evidenceIds.map((evidenceId, index) => {
        const sourceNumber = evidenceId.match(/(\d+)$/)?.[1] ?? String(index + 1);
        return (
          <button
            aria-label={`Inspect source ${sourceNumber}`}
            className="inline-flex min-h-5 min-w-7 items-center justify-center rounded border border-[var(--source)]/30 bg-[var(--source-dim)] px-1.5 font-mono text-[9px] font-extrabold text-[var(--source)] hover:border-[var(--source)]"
            key={evidenceId}
            onClick={() => onInspectEvidence(evidenceId)}
            type="button"
          >
            S{sourceNumber}
          </button>
        );
      })}
    </span>
  );
}

function StructuredValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (value.every(isScalar)) return <ScalarList values={value} />;
    return <RecordTable rows={value.map(toRecord).filter((row) => Object.keys(row).length > 0)} />;
  }

  const record = toRecord(value);
  if (Object.keys(record).length > 0) {
    const entries = Object.entries(record);
    if (entries.every(([, item]) => isScalar(item))) {
      return (
        <dl className="grid border-y border-[var(--stroke-divider)] md:grid-cols-2">
          {entries.map(([key, item]) => (
            <div
              className="border-b border-[var(--stroke-divider)] px-4 py-3 md:odd:border-r"
              key={key}
            >
              <dt className="text-[10px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                {humanizeKey(key)}
              </dt>
              <dd className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                {displayValue(item)}
              </dd>
            </div>
          ))}
        </dl>
      );
    }

    if (entries.every(([, item]) => Array.isArray(item) && item.every(isScalar))) {
      return (
        <div className="grid border-y border-[var(--stroke-divider)] md:grid-cols-2">
          {entries.map(([key, item]) => (
            <section
              className="px-5 py-4 md:odd:border-r md:odd:border-[var(--stroke-divider)]"
              key={key}
            >
              <h3 className="text-sm font-bold text-[var(--text-primary)]">{humanizeKey(key)}</h3>
              <ScalarList values={item as unknown[]} />
            </section>
          ))}
        </div>
      );
    }

    const tableRows = entries.map(([key, item]) => ({ __key: key, ...toRecord(item) }));
    if (tableRows.some((row) => Object.keys(row).length > 1))
      return <RecordTable rows={tableRows} />;

    return (
      <pre className="overflow-x-auto rounded-md bg-[var(--surface-code)] p-4 font-mono text-xs leading-6 text-[var(--text-code)]">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  const text = displayValue(value);
  if (text.includes('\n')) {
    return (
      <pre className="overflow-x-auto rounded-md bg-[var(--surface-code)] p-4 font-mono text-xs leading-6 text-[var(--text-code)]">
        {text}
      </pre>
    );
  }
  return (
    <p className="max-w-[78ch] text-[15px] leading-[1.72] text-[var(--text-secondary)]">{text}</p>
  );
}

function ScalarList({ values }: { values: unknown[] }) {
  return (
    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-[var(--text-secondary)]">
      {values.map((item, index) => (
        <li key={`${displayValue(item)}:${String(index)}`}>{displayValue(item)}</li>
      ))}
    </ul>
  );
}

function RecordTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  const columns = useMemo(
    () => Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 6),
    [rows]
  );
  if (rows.length === 0 || columns.length === 0) return null;

  return (
    <div className="overflow-x-auto border-y border-[var(--stroke-default)]">
      <table className="w-full min-w-[720px] border-collapse text-left text-[12.5px] leading-[1.55] text-[var(--text-secondary)]">
        <thead>
          <tr className="bg-[var(--surface-panel)] text-[10px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-primary)]">
            {columns.map((column) => (
              <th className="px-3 py-3" key={column}>
                {column === '__key' ? 'ID' : humanizeKey(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              className="border-b border-[var(--stroke-divider)] last:border-b-0"
              key={`${displayValue(row.__key)}:${String(index)}`}
            >
              {columns.map((column) => (
                <td className="px-3 py-3 align-top" key={column}>
                  {displayValue(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrdInspector({
  activeTab,
  model,
  onClose,
  onSelectTab,
  selectedEvidence,
  validationLabel,
  validationReady,
}: {
  activeTab: InspectorTab | null;
  model: PrdRenderModel;
  onClose: () => void;
  onSelectTab: (tab: InspectorTab) => void;
  selectedEvidence: PrdRenderEvidence | null;
  validationLabel: string;
  validationReady: boolean;
}) {
  if (!activeTab) return null;

  return (
    <aside
      aria-label="PRD inspector"
      className={cn(
        'min-w-0 overflow-hidden border-l-0 border-[var(--stroke-divider)] bg-[var(--surface-panel)] opacity-100',
        'max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-20 max-xl:w-[354px] max-xl:max-w-[92vw] max-xl:shadow-[var(--fx-shadow-lg)] xl:border-l'
      )}
    >
      <header className="flex min-h-[54px] items-center gap-2 border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3">
        {(['evidence', 'changes'] as const).map((tab) => (
          <button
            aria-selected={activeTab === tab}
            className={cn(
              'h-[54px] border-b-2 border-transparent px-2 text-[11px] font-bold capitalize text-[var(--text-tertiary)]',
              activeTab === tab && 'border-[var(--source)] text-[var(--source)]'
            )}
            key={tab}
            onClick={() => onSelectTab(tab)}
            role="tab"
            type="button"
          >
            {tab}
          </button>
        ))}
        <Button
          className="ml-auto"
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="canvas-ghost"
        >
          <X aria-hidden="true" />
          <span className="sr-only">Close inspector</span>
        </Button>
      </header>

      <div className="h-[611px] overflow-auto">
        {activeTab === 'evidence' ? (
          <EvidenceInspector evidence={selectedEvidence} model={model} />
        ) : null}
        {activeTab === 'changes' ? (
          <ChangesInspector
            model={model}
            validationLabel={validationLabel}
            validationReady={validationReady}
          />
        ) : null}
      </div>
    </aside>
  );
}

function EvidenceInspector({
  evidence,
  model,
}: {
  evidence: PrdRenderEvidence | null;
  model: PrdRenderModel;
}) {
  if (!evidence) {
    return (
      <div className="p-5 text-sm leading-6 text-[var(--text-tertiary)]">
        This commit does not expose source evidence references.
      </div>
    );
  }

  return (
    <>
      <section className="border-b border-[var(--stroke-divider)] p-5">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
          Selected citation · {evidence.label}
        </p>
        <h2 className="mt-2 text-base font-bold text-[var(--text-primary)]">{evidence.title}</h2>
        <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
          The rendered statement is linked to its captured source and deterministic materialization
          trace.
        </p>
      </section>
      <section className="border-b border-[var(--stroke-divider)] p-5">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
          Matched source
        </p>
        <strong className="mt-3 block text-xs text-[var(--text-primary)]">{evidence.title}</strong>
        <span className="mt-1 block break-all font-mono text-[10px] text-[var(--text-tertiary)]">
          {evidence.sourceId}
        </span>
        <blockquote className="mt-3 border-l-2 border-[var(--source)] bg-[var(--source-dim)] px-3 py-3 text-xs leading-5 text-[var(--text-secondary)]">
          Source text is retained outside this committed state projection; the trace ID remains
          addressable.
        </blockquote>
      </section>
      <section className="border-b border-[var(--stroke-divider)] p-5">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
          Trace
        </p>
        <dl className="mt-2 divide-y divide-[var(--stroke-divider)]">
          <InspectorTrace label="Source" value="Captured" />
          <InspectorTrace label="Proposal" value={`${model.changes.length} reviewed operations`} />
          <InspectorTrace label="YOps" value="Validated · applied" />
          <InspectorTrace label="Render" value="Materialized from commit tree" />
        </dl>
      </section>
      <section className="p-5">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
          Field mapping
        </p>
        <div className="mt-2 grid gap-1.5">
          {evidence.fieldPaths.map((path) => (
            <code
              className="break-all font-mono text-[10px] text-[var(--text-secondary)]"
              key={path}
            >
              {path}
            </code>
          ))}
        </div>
      </section>
    </>
  );
}

function InspectorTrace({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-3">
      <dt className="text-[11px] font-bold text-[var(--text-secondary)]">{label}</dt>
      <dd className="font-mono text-[10px] leading-5 text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function ChangesInspector({
  model,
  validationLabel,
  validationReady,
}: {
  model: PrdRenderModel;
  validationLabel: string;
  validationReady: boolean;
}) {
  return (
    <>
      <header className="flex items-center justify-between gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] px-5 py-4">
        <strong className="text-xs text-[var(--text-primary)]">Materialized changes</strong>
        <span
          className={cn(
            'text-[10px] font-extrabold',
            validationReady ? 'text-[var(--status-success)]' : 'text-[var(--status-warning)]'
          )}
        >
          {validationLabel}
        </span>
      </header>
      {model.changes.length > 0 ? (
        model.changes.map((change) => (
          <article className="border-b border-[var(--stroke-divider)] px-5 py-3.5" key={change.id}>
            <div className="flex items-center gap-2">
              <span className="min-w-9 font-mono text-[9px] font-extrabold text-[var(--accent-commit)]">
                {change.kind}
              </span>
              <strong className="text-xs text-[var(--text-primary)]">{change.title}</strong>
            </div>
            <code className="mt-1 block truncate font-mono text-[9px] text-[var(--text-tertiary)]">
              {change.path}
            </code>
            <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">
              {change.summary}
            </p>
          </article>
        ))
      ) : (
        <p className="p-5 text-sm leading-6 text-[var(--text-tertiary)]">
          No YOps change log is attached to this commit.
        </p>
      )}
    </>
  );
}

function YamlCode({ yamlText }: { yamlText: string }) {
  return (
    <div className="overflow-auto py-4">
      <table className="w-full min-w-[760px] border-collapse font-mono text-[12.5px] leading-[1.72]">
        <tbody>
          {yamlText.split('\n').map((line, index) => (
            <tr key={String(index)}>
              <td className="w-[58px] select-none pr-4 text-right align-top text-[var(--text-tertiary)]">
                {index + 1}
              </td>
              <td className="whitespace-pre px-4 align-top text-[var(--text-code)]">{line}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function evidenceIdsForPath(model: PrdRenderModel, path: string): string[] {
  const normalized = path.replace(/^prd\//, '').replace(/^\/+|\/+$/g, '');
  return model.evidence
    .filter((evidence) =>
      evidence.fieldPaths.some((fieldPath) => {
        const normalizedFieldPath = fieldPath.replace(/^prd\//, '');
        return (
          normalizedFieldPath === normalized ||
          normalizedFieldPath.startsWith(`${normalized}/`) ||
          normalized.startsWith(`${normalizedFieldPath}/`)
        );
      })
    )
    .map((evidence) => evidence.id);
}

function evidenceIdsForPaths(model: PrdRenderModel, paths: string[]): string[] {
  return Array.from(new Set(paths.flatMap((path) => evidenceIdsForPath(model, path))));
}

function sectionTitle(section: PrdRenderSection): string {
  if (section.key === 'goals') return 'Goals and measurable outcomes';
  if (section.key === 'non_goals') return 'Explicit product boundaries';
  if (section.key === 'metrics') return 'Success metrics and guardrails';
  if (section.key === 'rollout') return 'Progressive exposure and promotion gates';
  if (section.key === 'risks') return 'Known failure modes and mitigations';
  if (section.key === 'decisions') return 'Material product decisions';
  return section.title;
}

function isScalar(value: unknown): boolean {
  return value === null || ['boolean', 'number', 'string', 'undefined'].includes(typeof value);
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.map(displayValue).join(' · ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function humanizeKey(value: string): string {
  return value
    .replace(/^__key$/, 'ID')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
