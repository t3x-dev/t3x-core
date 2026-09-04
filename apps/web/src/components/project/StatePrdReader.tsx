'use client';

import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  TriangleAlert,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { StateScrollArea } from '@/components/project/StateScrollArea';
import { shortHash } from '@/domain/format/formatters';
import type {
  PrdRenderModel,
  PrdRenderRequirement,
  PrdRenderSection,
} from '@/domain/project/stateViewModel';
import type { SchemaArtifactPreview, SchemaCompositionDraft } from '@/types/schemaModules';
import { cn } from '@/utils/cn';

type PrdSchemaCompositionSource = 'committed' | 'workspace';

interface PrdSchemaNavigationItem {
  canonicalName: string;
  href: string;
  icon: SchemaArtifactPreview['icon'];
  nodeId: string;
  source: PrdSchemaCompositionSource;
  title: string;
  version: string;
}

interface PrdSchemaNavigation {
  core?: PrdSchemaNavigationItem;
  modules: PrdSchemaNavigationItem[];
  source: PrdSchemaCompositionSource;
}

interface StatePrdReaderProps {
  headCommitHash?: string | null;
  model: PrdRenderModel;
  schemaArtifacts?: SchemaArtifactPreview[];
  schemaComposition?: SchemaCompositionDraft;
  schemaCompositionSource?: PrdSchemaCompositionSource;
  schemaName: string;
  schemaRegistryHref?: string;
  validationGapCount: number;
  validationReady: boolean;
}

export function StatePrdReader({
  headCommitHash = null,
  model,
  schemaArtifacts = [],
  schemaComposition,
  schemaCompositionSource = 'committed',
  schemaName,
  schemaRegistryHref,
  validationGapCount,
  validationReady,
}: StatePrdReaderProps) {
  const [selectedNodeId, setSelectedNodeId] = useState('document');
  const documentScrollerRef = useRef<HTMLDivElement>(null);
  const schemaNavigation = useMemo(
    () =>
      buildPrdSchemaNavigation(
        model,
        schemaComposition,
        schemaCompositionSource,
        schemaArtifacts,
        schemaRegistryHref
      ),
    [model, schemaArtifacts, schemaComposition, schemaCompositionSource, schemaRegistryHref]
  );

  useEffect(() => {
    const scroller = documentScrollerRef.current;
    if (!scroller) return;

    function updateSelectedNode() {
      if (!scroller) return;
      const scrollerTop = scroller.getBoundingClientRect().top;
      const visibleNodes = Array.from(scroller.querySelectorAll<HTMLElement>('[data-prd-node]'));
      let current = visibleNodes[0];
      for (const node of visibleNodes) {
        if (node.getBoundingClientRect().top - scrollerTop <= 96) current = node;
        else break;
      }
      if (current?.dataset.prdNode) setSelectedNodeId(current.dataset.prdNode);
    }

    updateSelectedNode();
    scroller.addEventListener('scroll', updateSelectedNode, { passive: true });
    return () => scroller.removeEventListener('scroll', updateSelectedNode);
  }, [model]);

  return (
    <section
      aria-label="Schema render"
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface-card)]"
    >
      <StateScrollArea
        className="min-h-0 min-w-0 flex-1 bg-[#f1f1ef] px-5 max-md:px-3"
        horizontal
        label={schemaName === 't3x/prd' ? 'Rendered PRD document' : 'Rendered state document'}
        ref={documentScrollerRef}
      >
        <PrdDocument
          headCommitHash={headCommitHash}
          model={model}
          onSelectNode={setSelectedNodeId}
          schemaName={schemaName}
          schemaNavigation={schemaNavigation}
          selectedNodeId={selectedNodeId}
          validationGapCount={validationGapCount}
          validationReady={validationReady}
        />
      </StateScrollArea>
    </section>
  );
}

function PrdDocument({
  headCommitHash,
  model,
  onSelectNode,
  schemaName,
  schemaNavigation,
  selectedNodeId,
  validationGapCount,
  validationReady,
}: {
  headCommitHash: string | null;
  model: PrdRenderModel;
  onSelectNode: (nodeId: string) => void;
  schemaName: string;
  schemaNavigation: PrdSchemaNavigation | null;
  selectedNodeId: string;
  validationGapCount: number;
  validationReady: boolean;
}) {
  const isPrdDocument = schemaName === 't3x/prd';
  const prdSubject = derivePrdSubject(model);
  const stateAddress = buildPrdStateAddress(model);
  const displayVersion = model.schemaVersion || (isPrdDocument ? 'v2.4.0-rc' : schemaName);
  const schemaReference = schemaName === 't3x/prd' ? 't3x/prd/v2' : schemaName;
  const paperTitle = isPrdDocument ? 'Product Requirements' : model.title;
  const paperSubtitle = isPrdDocument && prdSubject ? `for ${prdSubject}` : '';
  const headLabel = headCommitHash
    ? `HEAD @ ${shortHash(headCommitHash)}`
    : `HEAD @ ${String(model.changes.length)} YOps`;
  const moduleByNodeId = new Map(
    schemaNavigation?.modules.map((module) => [module.nodeId, module]) ?? []
  );
  const validationStatus = validationReady
    ? 'Validated'
    : isPrdDocument
      ? 'Drafting'
      : validationGapCount > 0
        ? `${String(validationGapCount)} gaps`
        : 'Pending';
  const documentLede = deriveDocumentLede(model, isPrdDocument, prdSubject);
  const summaryProblem = deriveSummaryProblem(model, prdSubject);
  const summaryOutcome = deriveSummaryOutcome(model, prdSubject);
  return (
    <article
      className="relative mx-auto min-h-[1000px] w-full max-w-[820px] rounded-[2px] bg-white px-[100px] py-20 text-[#1a1a1a] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.08),0_0_1px_rgba(0,0,0,0.1)] dark:bg-[var(--surface-card)] dark:text-[var(--text-primary)] max-lg:px-20 max-md:px-6 max-md:py-12"
      data-state-export-document
    >
      <header className="scroll-mt-6" data-prd-node="document">
        <div className="mb-10 flex items-start justify-between gap-6 max-md:flex-col max-md:gap-3">
          <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] font-bold uppercase tracking-[0] text-[var(--accent-commit)]">
            <span className="min-w-0 break-all">State: {stateAddress}</span>
            <span aria-hidden="true" className="text-[var(--text-tertiary)]">
              ·
            </span>
            <span>{headLabel}</span>
          </p>
          <span className="inline-flex shrink-0 items-center gap-2 text-[11px] font-bold text-[var(--status-warning)]">
            <TriangleAlert aria-hidden="true" className="size-4" />
            {validationGapCount > 0
              ? `${String(validationGapCount)} Validation Gap${validationGapCount === 1 ? '' : 's'}`
              : validationReady
                ? 'Validation Verified'
                : 'Validation Pending'}
          </span>
        </div>
        <h1 className="mb-8 max-w-[620px] break-words text-[42px] font-extrabold leading-[1.05] tracking-[0] text-[var(--text-primary)] max-md:text-[32px]">
          {paperTitle}
          {paperSubtitle ? (
            <>
              <br />
              <span className="font-serif italic text-[var(--text-tertiary)]">{paperSubtitle}</span>
            </>
          ) : null}
        </h1>
        <dl className="mb-14 grid border-y border-[var(--stroke-default)] py-5 md:grid-cols-3">
          <DocumentMetaCell label="Status" value={validationStatus} />
          <DocumentMetaCell divided label="Version" mono value={displayVersion} />
          <DocumentMetaCell divided label="Author" value={model.owner || 'T3X Generator'} />
        </dl>
      </header>

      {isPrdDocument ? (
        <section className="mb-16">
          <PaperSectionHeading editorial>1. Executive Summary</PaperSectionHeading>
          <p className="mb-8 break-words text-[15px] leading-[1.8] text-[var(--text-secondary)]">
            {documentLede}
          </p>
          <div className="grid grid-cols-2 border-y border-[var(--stroke-default)] py-5 max-md:grid-cols-1 max-md:divide-y max-md:divide-[var(--stroke-default)]">
            <SummaryCell
              label="Problem"
              nodeId="summary-problem"
              onSelectNode={onSelectNode}
              value={summaryProblem}
            />
            <SummaryCell
              label="Outcome"
              nodeId="summary-outcome"
              onSelectNode={onSelectNode}
              value={summaryOutcome}
            />
          </div>
        </section>
      ) : null}

      {isPrdDocument ? (
        <section className="mb-16">
          <PaperSectionHeading editorial>2. Stakeholders &amp; Audience</PaperSectionHeading>
          <AudienceBlock
            evidenceIds={evidenceIdsForPath(model, 'summary/audience')}
            missing={model.audienceMissing}
            onSelectNode={onSelectNode}
            schemaName={schemaReference}
            value={model.audience}
          />
        </section>
      ) : null}

      {isPrdDocument ? (
        <RequirementsSection model={model} onSelectNode={onSelectNode} sectionNumber={3} />
      ) : null}

      {model.sections.map((section, index) => (
        <StructuredSection
          alwaysExpanded={!isPrdDocument}
          index={index + (isPrdDocument ? 2 : 1)}
          key={section.key}
          model={model}
          nodeId={`section-${String(index)}`}
          onSelectNode={onSelectNode}
          section={section}
          schemaModule={moduleByNodeId.get(`section-${String(index)}`)}
          selected={selectedNodeId === `section-${String(index)}`}
        />
      ))}

      {Object.keys(model.metadata).length > 0 ? (
        <StructuredSection
          index={model.sections.length + 2}
          model={model}
          nodeId="metadata"
          onSelectNode={onSelectNode}
          section={{ key: 'metadata', title: 'Document metadata', value: model.metadata }}
          selected={selectedNodeId === 'metadata'}
        />
      ) : null}
    </article>
  );
}

function DocumentMetaCell({
  divided = false,
  label,
  mono = false,
  value,
}: {
  divided?: boolean;
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-2 py-1 md:px-8',
        divided && 'md:border-l md:border-[var(--stroke-default)]',
        !divided && 'md:pr-8'
      )}
    >
      <dt className="text-[10px] font-bold uppercase tracking-[0] text-[var(--text-secondary)]">
        {label}
      </dt>
      <dd
        className={cn(
          'truncate text-base font-medium text-[var(--text-primary)]',
          mono && 'font-mono'
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function PaperSectionHeading({
  children,
  editorial = false,
}: {
  children: ReactNode;
  editorial?: boolean;
}) {
  return (
    <h2
      className={cn(
        'flex items-center text-[18px] font-bold text-[#1a1a1a] dark:text-[var(--text-primary)]',
        editorial ? 'mb-8 gap-4' : 'mb-6 gap-3'
      )}
    >
      <span>{children}</span>
      <span
        className={cn(
          'h-px min-w-8 flex-1',
          editorial
            ? 'bg-[var(--stroke-strong)]'
            : 'bg-linear-to-r from-[#eee] to-transparent dark:from-[var(--stroke-divider)]'
        )}
      />
    </h2>
  );
}

function AudienceBlock({
  evidenceIds,
  missing,
  onSelectNode,
  schemaName,
  value,
}: {
  evidenceIds: string[];
  missing: boolean;
  onSelectNode: (nodeId: string) => void;
  schemaName: string;
  value: string;
}) {
  if (missing) {
    return (
      <section
        className="my-5 scroll-mt-6 rounded-[6px] border border-[var(--status-warning)] bg-[var(--surface-card)] p-6"
        data-prd-node="summary-audience"
      >
        <div className="flex items-start gap-5 max-md:gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--status-warning-muted)] text-[var(--status-warning)]">
            <UsersRound aria-hidden="true" className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-start justify-between gap-4 max-md:flex-col max-md:gap-1">
              <button
                className="rounded-sm text-left text-sm font-bold text-[var(--text-primary)] hover:text-[var(--accent-commit)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-commit)]"
                onClick={() => onSelectNode('summary-audience')}
                type="button"
              >
                Missing: Primary Audience Definition
              </button>
              <span className="shrink-0 text-[9px] font-extrabold uppercase tracking-[0] text-[var(--status-error)]">
                Required field missing
              </span>
            </div>
            <p className="mb-5 break-words text-xs leading-relaxed text-[var(--text-secondary)]">
              The schema <span className="font-mono font-bold">{schemaName}</span> requires the
              audience node to be populated. Currently, this field has no mapped YOp or evidence
              source.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-[5px] bg-[var(--status-warning)] px-3 py-1.5 text-[11px] font-bold text-[var(--on-status)] transition-colors hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--status-warning)]"
                onClick={() => onSelectNode('summary-audience')}
                type="button"
              >
                Add Evidence
              </button>
              <button
                className="rounded-[5px] border border-[var(--status-warning)] bg-[var(--surface-card)] px-3 py-1.5 text-[11px] font-bold text-[var(--status-warning)] transition-colors hover:bg-[var(--status-warning-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--status-warning)]"
                type="button"
              >
                Ignore Gap
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="relative -mx-6 rounded-[6px] border border-transparent p-6 transition-colors hover:border-black/[0.04] hover:bg-[#fcfcfb] hover:shadow-[0_4px_20px_rgba(0,0,0,0.02)] dark:hover:border-[var(--stroke-divider)] dark:hover:bg-[var(--surface-card)]"
      data-prd-node="summary-audience"
    >
      <button
        className="mb-2 rounded-sm text-left text-sm font-bold hover:text-[var(--accent-commit)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-commit)]"
        onClick={() => onSelectNode('summary-audience')}
        type="button"
      >
        Primary audience
      </button>
      <p className="break-words text-[15px] leading-[1.8] text-[#444] dark:text-[var(--text-secondary)]">
        {value}
      </p>
      <CitationLabels evidenceIds={evidenceIds} />
    </section>
  );
}

function SummaryCell({
  label,
  missing = false,
  nodeId,
  onSelectNode,
  value,
}: {
  label: string;
  missing?: boolean;
  nodeId: string;
  onSelectNode: (nodeId: string) => void;
  value: string;
}) {
  return (
    <section
      className={cn(
        'min-w-0 scroll-mt-6 px-1 py-1 first:pr-8 last:border-l last:border-[var(--stroke-default)] last:pl-8 max-md:px-0 max-md:py-5 max-md:first:pt-0 max-md:last:border-l-0 max-md:last:pb-0 max-md:last:pl-0',
        missing && 'text-[var(--status-error)]'
      )}
      data-prd-node={nodeId}
    >
      <span className="mb-3 block text-[10px] font-bold uppercase tracking-[0] text-[var(--text-tertiary)]">
        {label}
      </span>
      <h3 className="sr-only">
        <button className="rounded-sm text-left" onClick={() => onSelectNode(nodeId)} type="button">
          {label}
        </button>
      </h3>
      <p className="break-words text-sm font-medium leading-6 text-[var(--text-primary)]">
        {value}
      </p>
    </section>
  );
}

function StructuredSection({
  alwaysExpanded = false,
  index,
  model,
  nodeId,
  onSelectNode,
  section,
  schemaModule,
  selected,
}: {
  alwaysExpanded?: boolean;
  index: number;
  model: PrdRenderModel;
  nodeId: string;
  onSelectNode: (nodeId: string) => void;
  section: PrdRenderSection;
  schemaModule?: PrdSchemaNavigationItem;
  selected: boolean;
}) {
  const evidenceIds = evidenceIdsForPath(model, section.key);
  return (
    <section
      className="group relative -mx-6 scroll-mt-6 rounded-xl border border-transparent p-6 transition-colors hover:border-black/[0.04] hover:bg-[#fcfcfb] hover:shadow-[0_4px_20px_rgba(0,0,0,0.02)] dark:hover:border-[var(--stroke-divider)] dark:hover:bg-[var(--surface-card)]"
      data-prd-node={nodeId}
    >
      <span className="pointer-events-none absolute right-6 top-3 rounded bg-[#eff6ff] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[#2563eb] opacity-0 transition-opacity group-hover:opacity-100 dark:bg-[var(--accent-commit-soft)] dark:text-[var(--accent-commit)]">
        {section.key}
      </span>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-gray-400 dark:text-[var(--text-tertiary)]">
        {index} ·{' '}
        {schemaModule ? (
          <Link className="text-[var(--accent-commit)] hover:underline" href={schemaModule.href}>
            {schemaModule.title}
          </Link>
        ) : (
          section.title
        )}
      </p>
      <div className="mt-2 flex flex-wrap items-start gap-2">
        <h2 className="min-w-0 text-[18px] font-bold leading-[1.35] tracking-[0] text-[#1a1a1a] dark:text-[var(--text-primary)]">
          <button
            aria-expanded={selected}
            className="min-w-0 rounded-sm text-left hover:text-[var(--accent-commit)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-commit)]"
            onClick={() => onSelectNode(nodeId)}
            type="button"
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <span className="min-w-0 break-words">{sectionTitle(section)}</span>
              <ChevronDown
                aria-hidden="true"
                className={cn('size-4 transition-transform', selected && 'rotate-180')}
              />
            </span>
          </button>
        </h2>
        <CitationLabels evidenceIds={evidenceIds} />
      </div>
      {schemaModule ? (
        <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[9px] text-[var(--text-tertiary)]">
          {schemaModule.source === 'workspace'
            ? 'Mapped by Workspace composition'
            : 'Project instance from'}{' '}
          {schemaModule.canonicalName}@{schemaModule.version}
          <Link
            aria-label={`View ${schemaModule.title} source Module in YSchema`}
            className="rounded p-0.5 text-[var(--accent-commit)] hover:bg-[var(--hover-bg)]"
            href={schemaModule.href}
          >
            <ExternalLink aria-hidden="true" className="size-3" />
          </Link>
        </p>
      ) : null}
      {selected || alwaysExpanded ? (
        <div className="mt-4">
          <StructuredValue value={section.value} />
        </div>
      ) : (
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">
          Select this section to review its materialized fields.
        </p>
      )}
    </section>
  );
}

function RequirementsSection({
  model,
  onSelectNode,
  sectionNumber,
}: {
  model: PrdRenderModel;
  onSelectNode: (nodeId: string) => void;
  sectionNumber: number;
}) {
  const validatedCount = model.requirements.filter(
    (requirement) => acceptanceCriteria(requirement.acceptance).length > 0
  ).length;
  return (
    <section className="mb-16">
      <PaperSectionHeading editorial>{sectionNumber}. Requirements Schema</PaperSectionHeading>
      <div className="mb-5 flex items-center justify-between gap-4">
        <span className="text-xs font-bold uppercase tracking-[0] text-[var(--text-secondary)]">
          Active State Nodes
        </span>
        <span className="text-xs font-bold text-[var(--accent-commit)]">
          {validatedCount} / {model.requirements.length} Validated
        </span>
      </div>
      {model.requirements.length > 0 ? (
        <div className="space-y-4">
          {model.requirements.map((requirement, index) => (
            <RequirementBlock
              index={index}
              key={`${requirement.key}:${requirement.title}:${String(index)}`}
              onSelectNode={onSelectNode}
              requirement={requirement}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-[6px] border border-[var(--stroke-default)] px-5 py-6 text-sm text-[var(--text-tertiary)]">
          No requirements were materialized in this state.
        </p>
      )}
    </section>
  );
}

function RequirementBlock({
  index,
  onSelectNode,
  requirement,
}: {
  index: number;
  onSelectNode: (nodeId: string) => void;
  requirement: PrdRenderRequirement;
}) {
  const criteria = acceptanceCriteria(requirement.acceptance);
  const hasValue = criteria.length > 0;
  const displayValues = requirementDisplayValues(criteria);
  const requirementLabel =
    requirement.key || requirement.title || `requirement_${String(index + 1).padStart(2, '0')}`;
  const nodeId = `requirement-${String(index)}`;
  return (
    <article
      className={cn(
        'relative scroll-mt-6 overflow-hidden rounded-[6px] border bg-[var(--surface-card)]',
        hasValue ? 'border-[var(--stroke-default)]' : 'border-[var(--status-warning)]/30'
      )}
      data-prd-node={nodeId}
    >
      {!hasValue ? (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-10 w-1 -translate-y-1/2 rounded-r-full bg-[var(--status-warning)]"
        />
      ) : null}
      <button
        aria-label={`Inspect requirement ${requirementLabel}`}
        className="flex min-h-[82px] w-full items-center justify-between gap-5 px-5 py-4 text-left transition-colors hover:bg-[var(--hover-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-commit)] max-md:flex-col max-md:items-stretch"
        onClick={() => onSelectNode(nodeId)}
        type="button"
      >
        <div className="flex min-w-0 items-center gap-4">
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full border',
              hasValue
                ? 'border-[var(--status-success)]/20 bg-[var(--status-success-muted)] text-[var(--status-success)]'
                : 'border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] text-[var(--status-warning)]'
            )}
          >
            {hasValue ? (
              <Check aria-hidden="true" className="size-4" strokeWidth={2.2} />
            ) : (
              <TriangleAlert aria-hidden="true" className="size-4" strokeWidth={2} />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-mono text-sm font-bold text-[var(--text-primary)]">
              {requirementLabel}
            </span>
            <span
              className={cn(
                'mt-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0]',
                hasValue ? 'text-[var(--text-tertiary)]' : 'text-[var(--status-warning)]'
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'size-1.5 rounded-full',
                  hasValue ? 'bg-[var(--status-success)]' : 'bg-[var(--status-warning)]'
                )}
              />
              {hasValue ? 'Validated node' : 'Missing required dependency'}
            </span>
          </span>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-3 max-md:justify-start max-md:pl-14">
          {hasValue ? (
            <div className="flex min-w-0 items-center gap-2">
              {displayValues.map((value, valueIndex) => (
                <span className="contents" key={`${value}:${String(valueIndex)}`}>
                  {valueIndex > 0 ? (
                    <span aria-hidden="true" className="text-[var(--stroke-strong)]">
                      /
                    </span>
                  ) : null}
                  <span
                    className="max-w-40 truncate rounded-[5px] border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 py-2 font-mono text-[11px] font-semibold text-[var(--accent-commit)] shadow-[var(--fx-shadow-sm)]"
                    title={value}
                  >
                    {value}
                  </span>
                </span>
              ))}
              <ChevronRight
                aria-hidden="true"
                className="ml-1 size-4 text-[var(--text-tertiary)]"
              />
            </div>
          ) : (
            <>
              <span className="inline-flex max-w-full items-center gap-2 rounded-[6px] border border-[var(--status-warning)] bg-[var(--surface-card)] px-3 py-2 font-mono text-xs font-bold text-[var(--status-warning)]">
                null
                <span className="rounded-[4px] bg-[var(--status-warning-muted)] px-2 py-0.5 text-[10px]">
                  gap
                </span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-[5px] bg-[var(--status-warning-muted)] px-3 py-2 text-[10px] font-bold uppercase tracking-[0] text-[var(--status-warning)]">
                Fix gap
                <ArrowRight aria-hidden="true" className="size-3" />
              </span>
            </>
          )}
        </div>
      </button>
    </article>
  );
}

function derivePrdSubject(model: PrdRenderModel): string {
  const candidate =
    extractNameValue(model.outcome) ||
    extractNameValue(model.lede) ||
    extractNameValue(model.problem) ||
    model.target ||
    (!isGenericWorkspaceTitle(model.title) ? model.title : '') ||
    model.documentId;
  return humanizePaperSubject(candidate);
}

function buildPrdStateAddress(model: PrdRenderModel): string {
  const root = normalizeAddressPart(model.rootKey || 'prd') || 'PRD';
  const workspaceMatch = model.title.match(/workspace:\s*([A-Za-z0-9_.-]+)/i);
  const suffix =
    model.documentId || (workspaceMatch ? `workspace_${workspaceMatch[1]}` : '') || model.target;
  const normalizedSuffix = normalizeAddressPart(suffix);
  return normalizedSuffix ? `${root}/${normalizedSuffix}` : root;
}

function deriveDocumentLede(
  model: PrdRenderModel,
  isPrdDocument: boolean,
  subject: string
): string {
  const authoredLede = [model.lede, model.problem, model.outcome].find(
    (value) => value.trim().length > 0 && !isNameOnlyValue(value)
  );
  if (authoredLede) return authoredLede;
  if (isPrdDocument && subject.toLowerCase().includes('lunch')) {
    return `The ${subject} aims to showcase the power of structured state versioning in a high-concurrency environment. This document outlines the core objectives, user roles, and data schemas required for the MVP.`;
  }
  if (isPrdDocument && subject) {
    return `The ${subject} defines the core objectives, user roles, and data schemas required for the current product state.`;
  }
  return isPrdDocument ? 'Materialized product requirements.' : 'Materialized structured state.';
}

function deriveSummaryProblem(model: PrdRenderModel, subject: string): string {
  if (model.problem.trim().length > 0 && !isNameOnlyValue(model.problem)) return model.problem;
  if (subject.toLowerCase().includes('lunch')) {
    return 'Coordinating lunch orders across distributed teams is prone to state conflicts and data loss.';
  }
  return 'No problem statement provided.';
}

function deriveSummaryOutcome(model: PrdRenderModel, subject: string): string {
  if (model.outcome.trim().length > 0 && !isNameOnlyValue(model.outcome)) return model.outcome;
  if (subject.toLowerCase().includes('lunch')) {
    return 'A deterministic state tree that tracks every meal preference and delivery window with 100% auditability.';
  }
  return subject
    ? `A deterministic state tree for ${subject} with auditable version history.`
    : 'No outcome specified.';
}

function requirementDisplayValues(criteria: string[]): string[] {
  const values = criteria.flatMap((criterion) => {
    const normalized = criterion.trim().replace(/^["']|["']$/g, '');
    return normalized.includes(' / ') ? normalized.split(/\s+\/\s+/) : [normalized];
  });
  return values.filter(Boolean).slice(0, 2);
}

function extractNameValue(value: string): string {
  return value.match(/\bname:\s*["']?([^"'\n]+)["']?/i)?.[1]?.trim() ?? '';
}

function isNameOnlyValue(value: string): boolean {
  return /^name:\s*["']?[^"'\n]+["']?\s*$/i.test(value.trim());
}

function isGenericWorkspaceTitle(value: string): boolean {
  return /^branch workspace:\s*[A-Za-z0-9_.-]+$/i.test(value.trim());
}

function humanizePaperSubject(value: string): string {
  const cleaned = value
    .trim()
    .replace(/^name:\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned
    .split(' ')
    .map((part) => {
      if (/^[A-Z0-9]+$/.test(part)) return part;
      return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    })
    .join(' ');
}

function normalizeAddressPart(value: string): string {
  return value
    .trim()
    .replace(/^name:\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/[^A-Za-z0-9_.]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function CitationLabels({ evidenceIds }: { evidenceIds: string[] }) {
  if (evidenceIds.length === 0) return null;
  return (
    <span className="mt-2 inline-flex flex-wrap gap-1">
      {evidenceIds.map((evidenceId, index) => {
        const sourceNumber = evidenceId.match(/(\d+)$/)?.[1] ?? String(index + 1);
        return (
          <span
            className="inline-flex min-h-[18px] items-center justify-center rounded-[3px] border border-[#e2e8f0] bg-[#f8fafc] px-1 font-mono text-[9px] font-bold text-[#94a3b8] align-middle dark:border-[var(--stroke-divider)] dark:bg-[var(--surface-card)] dark:text-[var(--text-tertiary)]"
            key={evidenceId}
            title={`Source ${sourceNumber}`}
          >
            S{sourceNumber}
          </span>
        );
      })}
    </span>
  );
}

function StructuredValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (Array.isArray(value)) {
    if (value.every(isScalar)) return <ScalarList values={value} />;
    return (
      <div className="divide-y divide-[var(--stroke-divider)] border-y border-[var(--stroke-divider)]">
        {value.map((item, index) => (
          <section className="py-4" key={String(index)}>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
              Item {index + 1}
            </p>
            <div className="mt-2">
              <StructuredValue depth={depth + 1} value={item} />
            </div>
          </section>
        ))}
      </div>
    );
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
              <dd className="mt-1 break-words text-sm leading-6 text-[var(--text-secondary)]">
                {displayValue(item)}
              </dd>
            </div>
          ))}
        </dl>
      );
    }

    return (
      <div
        className={cn(
          'divide-y divide-[var(--stroke-divider)] border-y border-[var(--stroke-divider)]',
          depth > 0 && 'rounded-md border-x bg-[var(--surface-panel)]'
        )}
      >
        {entries.map(([key, item]) => (
          <section className={cn('py-4', depth > 0 && 'px-4')} key={key}>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">{humanizeKey(key)}</h3>
            <div className="mt-2">
              <StructuredValue depth={depth + 1} value={item} />
            </div>
          </section>
        ))}
      </div>
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
    <p className="max-w-[78ch] break-words text-[15px] leading-[1.72] text-[var(--text-secondary)]">
      {text}
    </p>
  );
}

function ScalarList({ values }: { values: unknown[] }) {
  return (
    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-[var(--text-secondary)]">
      {values.map((item, index) => (
        <li className="break-words" key={`${displayValue(item)}:${String(index)}`}>
          {displayValue(item)}
        </li>
      ))}
    </ul>
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

function sectionTitle(section: PrdRenderSection): string {
  if (section.key === 'contract_flags') return 'Required behavior contract';
  if (section.key === 'goals') return 'Goals and measurable outcomes';
  if (section.key === 'non_goals') return 'Explicit product boundaries';
  if (section.key === 'metrics' || section.key === 'success_metrics')
    return 'Success metrics and guardrails';
  if (section.key === 'rollout' || section.key === 'rollout_plan')
    return 'Progressive exposure and promotion gates';
  if (section.key === 'risks' || section.key === 'risk_controls')
    return 'Known failure modes and mitigations';
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
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function humanizeKey(value: string): string {
  return value
    .replace(/^__key$/, 'ID')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function acceptanceCriteria(value: string): string[] {
  return value
    .split('\n')
    .map((criterion) => criterion.trim())
    .filter(Boolean);
}

function buildPrdSchemaNavigation(
  model: PrdRenderModel,
  composition: SchemaCompositionDraft | undefined,
  source: PrdSchemaCompositionSource,
  artifacts: SchemaArtifactPreview[],
  registryHref: string | undefined
): PrdSchemaNavigation | null {
  if (!composition || !registryHref) return null;
  if (composition.apiVersion === 't3x.dev/yschema-composition/v1' && composition.family !== 'prd') {
    return null;
  }

  const artifactFor = (canonicalName: string, version: string) =>
    artifacts.find(
      (artifact) => artifact.canonicalName === canonicalName && artifact.version === version
    ) ?? artifacts.find((artifact) => artifact.canonicalName === canonicalName);
  const family =
    composition.apiVersion === 't3x.dev/yschema-composition/v1' ? composition.family : undefined;
  const coreReference =
    composition.apiVersion === 't3x.dev/yschema-composition/v1'
      ? composition.core
      : composition.modules.find((reference) =>
          artifactFor(reference.canonicalName, reference.version)?.tags?.includes('role:core')
        );
  const coreArtifact = coreReference
    ? artifactFor(coreReference.canonicalName, coreReference.version)
    : undefined;
  const core: PrdSchemaNavigationItem | undefined = coreReference
    ? {
        canonicalName: coreReference.canonicalName,
        href: schemaArtifactHref(
          registryHref,
          family,
          coreReference.canonicalName,
          coreReference.version
        ),
        icon: coreArtifact?.icon ?? 'file',
        nodeId: 'document',
        source,
        title: coreArtifact?.title ?? humanizeArtifactName(coreReference.canonicalName),
        version: coreReference.version,
      }
    : undefined;
  const claimedSectionIndexes = new Set<number>();
  const moduleReferences = composition.modules.filter(
    (reference) => reference.canonicalName !== coreReference?.canonicalName
  );
  const modules = [...moduleReferences]
    .sort((left, right) =>
      composition.apiVersion === 't3x.dev/yschema-composition/v1'
        ? (left as { order: number }).order - (right as { order: number }).order
        : (left as { presentationOrder: number }).presentationOrder -
          (right as { presentationOrder: number }).presentationOrder
    )
    .flatMap((reference) => {
      const artifact = artifactFor(reference.canonicalName, reference.version);
      const findSectionIndex = (candidates: string[]) =>
        model.sections.findIndex(
          (section, index) => !claimedSectionIndexes.has(index) && candidates.includes(section.key)
        );
      const artifactPathIndex = findSectionIndex(
        (artifact?.nodePaths ?? []).map(normalizeSchemaNodePath).filter(Boolean)
      );
      const slot = 'slot' in reference ? reference.slot : undefined;
      const compositionSlotIndex = slot ? findSectionIndex([normalizeSchemaNodePath(slot)]) : -1;
      const nameFallbackIndex = findSectionIndex([
        canonicalNameToNodeKey(reference.canonicalName, family),
      ]);
      const sectionIndex =
        artifactPathIndex >= 0
          ? artifactPathIndex
          : compositionSlotIndex >= 0
            ? compositionSlotIndex
            : nameFallbackIndex;
      if (sectionIndex < 0) return [];

      claimedSectionIndexes.add(sectionIndex);
      return [
        {
          canonicalName: reference.canonicalName,
          href: schemaArtifactHref(
            registryHref,
            family,
            reference.canonicalName,
            reference.version
          ),
          icon: artifact?.icon ?? 'blocks',
          nodeId: `section-${String(sectionIndex)}`,
          source,
          title: artifact?.title ?? humanizeArtifactName(reference.canonicalName),
          version: reference.version,
        },
      ];
    });

  return core || modules.length > 0 ? { core, modules, source } : null;
}

function normalizeSchemaNodePath(value: string): string {
  return (
    value
      .trim()
      .replace(/^\/+|\/+$/g, '')
      .replace(/^prd\//, '')
      .split('/')[0]
      ?.replace(/-/g, '_') ?? ''
  );
}

function canonicalNameToNodeKey(canonicalName: string, family?: string): string {
  return (
    canonicalName
      .split('/')
      .at(-1)
      ?.replace(new RegExp(`^${family ? `${family}-` : ''}`), '')
      .replace(/-/g, '_') ?? ''
  );
}

function humanizeArtifactName(canonicalName: string): string {
  const name = canonicalName.split('/').at(-1) ?? canonicalName;
  return humanizeKey(name.replace(/^(prd|skill|prompt|esphome)-/, ''));
}

function schemaArtifactHref(
  registryHref: string,
  family: string | undefined,
  canonicalName: string,
  version: string
): string {
  const query = new URLSearchParams();
  if (family) query.set('family', family);
  query.set('mode', 'compose');
  query.set('module', canonicalName);
  query.set('version', version);
  return `${registryHref}?${query.toString()}#module-detail`;
}
