'use client';

import {
  Blocks,
  Braces,
  Check,
  ChevronDown,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  FileCode2,
  FileText,
  GitCompare,
  ListTree,
  Monitor,
  PanelRight,
  Server,
  X,
} from 'lucide-react';
import Link from 'next/link';
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StatePaneResizeHandle } from '@/components/project/StatePaneResizeHandle';
import { StateScrollArea } from '@/components/project/StateScrollArea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  PrdRenderEvidence,
  PrdRenderModel,
  PrdRenderRequirement,
  PrdRenderSection,
} from '@/domain/project/stateViewModel';
import type { SchemaArtifactPreview, SchemaCompositionDraft } from '@/types/schemaModules';
import { cn } from '@/utils/cn';

type ReaderMode = 'rendered' | 'raw';
type InspectorTab = 'changes' | 'evidence' | 'node';
type ReaderPane = 'inspector' | 'outline';
type PrdSchemaCompositionSource = 'committed' | 'workspace';

const PRD_OUTLINE_DEFAULT_WIDTH = 252;
const PRD_OUTLINE_MIN_WIDTH = 220;
const PRD_OUTLINE_MAX_WIDTH = 420;
const PRD_INSPECTOR_DEFAULT_WIDTH = 310;
const PRD_INSPECTOR_MIN_WIDTH = 260;
const PRD_INSPECTOR_MAX_WIDTH = 520;
const PRD_DOCUMENT_MIN_WIDTH = 600;

function clampReaderPaneWidth(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

interface PrdOutlineNode {
  group: 'document' | 'optional' | 'requirements' | 'summary';
  id: string;
  label: string;
  meta?: string;
}

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

interface PrdSelectedNode {
  acceptanceCount: number;
  cardinality: string;
  description: string;
  identity: string;
  label: string;
  path: string;
  required: boolean;
  type: string;
}

interface StatePrdReaderProps {
  model: PrdRenderModel;
  schemaArtifacts?: SchemaArtifactPreview[];
  schemaComposition?: SchemaCompositionDraft;
  schemaCompositionSource?: PrdSchemaCompositionSource;
  schemaName: string;
  schemaRegistryHref?: string;
  validationGapCount: number;
  validationReady: boolean;
  yamlText: string;
}

export function StatePrdReader({
  model,
  schemaArtifacts = [],
  schemaComposition,
  schemaCompositionSource = 'committed',
  schemaName,
  schemaRegistryHref,
  validationGapCount,
  validationReady,
  yamlText,
}: StatePrdReaderProps) {
  const rootKey = model.rootKey || 'prd';
  const [mode, setMode] = useState<ReaderMode>('rendered');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('node');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outlineWidth, setOutlineWidth] = useState(PRD_OUTLINE_DEFAULT_WIDTH);
  const [inspectorWidth, setInspectorWidth] = useState(PRD_INSPECTOR_DEFAULT_WIDTH);
  const [selectedNodeId, setSelectedNodeId] = useState('document');
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(
    model.evidence[0]?.id ?? null
  );
  const [copied, setCopied] = useState(false);
  const documentScrollerRef = useRef<HTMLDivElement>(null);
  const readerLayoutRef = useRef<HTMLDivElement>(null);
  const programmaticNodeRef = useRef<string | null>(null);
  const programmaticNodeTimerRef = useRef<number | null>(null);
  const outlineNodes = useMemo(() => buildOutlineNodes(model), [model]);
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
  const selectedNode = useMemo(
    () => selectInspectorNode(model, selectedNodeId),
    [model, selectedNodeId]
  );
  const selectedEvidence =
    model.evidence.find((item) => item.id === selectedEvidenceId) ?? model.evidence[0] ?? null;
  const validationLabel = validationReady
    ? 'Validation verified'
    : validationGapCount > 0
      ? `${String(validationGapCount)} validation gap${validationGapCount === 1 ? '' : 's'}`
      : 'Validation pending';

  const getReaderPaneMaxWidth = useCallback(
    (pane: ReaderPane) => {
      const containerWidth = readerLayoutRef.current?.getBoundingClientRect().width ?? 0;
      if (containerWidth === 0) {
        return pane === 'outline' ? PRD_OUTLINE_MAX_WIDTH : PRD_INSPECTOR_MAX_WIDTH;
      }
      const inspectorInline =
        typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1536px)').matches;
      const reservedWidth =
        pane === 'outline' ? (inspectorInline ? inspectorWidth : 0) : outlineWidth;
      const configuredMax = pane === 'outline' ? PRD_OUTLINE_MAX_WIDTH : PRD_INSPECTOR_MAX_WIDTH;
      return Math.min(configuredMax, containerWidth - reservedWidth - PRD_DOCUMENT_MIN_WIDTH - 16);
    },
    [inspectorWidth, outlineWidth]
  );

  const handlePaneResizeMouseDown = useCallback(
    (pane: ReaderPane, event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = pane === 'outline' ? outlineWidth : inspectorWidth;
      const minWidth = pane === 'outline' ? PRD_OUTLINE_MIN_WIDTH : PRD_INSPECTOR_MIN_WIDTH;
      const maxWidth = getReaderPaneMaxWidth(pane);

      const handleMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const requestedWidth = pane === 'outline' ? startWidth + delta : startWidth - delta;
        const nextWidth = clampReaderPaneWidth(requestedWidth, minWidth, maxWidth);
        if (pane === 'outline') setOutlineWidth(nextWidth);
        else setInspectorWidth(nextWidth);
      };
      const handleUp = () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
        window.removeEventListener('blur', handleUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
      window.addEventListener('blur', handleUp);
    },
    [getReaderPaneMaxWidth, inspectorWidth, outlineWidth]
  );

  const handlePaneResizeKeyDown = useCallback(
    (pane: ReaderPane, event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const step = event.shiftKey ? 48 : 16;
      const minWidth = pane === 'outline' ? PRD_OUTLINE_MIN_WIDTH : PRD_INSPECTOR_MIN_WIDTH;
      const maxWidth = getReaderPaneMaxWidth(pane);
      const dividerDirection = event.key === 'ArrowRight' ? 1 : -1;
      const paneDirection = pane === 'outline' ? dividerDirection : -dividerDirection;
      const updateWidth = (current: number) =>
        clampReaderPaneWidth(current + step * paneDirection, minWidth, maxWidth);
      if (pane === 'outline') setOutlineWidth(updateWidth);
      else setInspectorWidth(updateWidth);
    },
    [getReaderPaneMaxWidth]
  );

  function openInspector(tab: InspectorTab, evidenceId?: string) {
    if (evidenceId) setSelectedEvidenceId(evidenceId);
    setInspectorTab(tab);
    setInspectorOpen(true);
    setOutlineOpen(false);
  }

  function selectNode(nodeId: string, scroll = false) {
    setSelectedNodeId(nodeId);
    setInspectorTab('node');
    if (scroll) {
      const scroller = documentScrollerRef.current;
      const target = Array.from(
        scroller?.querySelectorAll<HTMLElement>('[data-prd-node]') ?? []
      ).find((element) => element.dataset.prdNode === nodeId);
      if (scroller && target) {
        programmaticNodeRef.current = nodeId;
        if (programmaticNodeTimerRef.current !== null) {
          window.clearTimeout(programmaticNodeTimerRef.current);
        }
        programmaticNodeTimerRef.current = window.setTimeout(() => {
          programmaticNodeRef.current = null;
          programmaticNodeTimerRef.current = null;
        }, 650);
        const reducedMotion =
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const top = Math.max(0, target.offsetTop - 24);
        if (typeof scroller.scrollTo === 'function') {
          scroller.scrollTo({ behavior: reducedMotion ? 'auto' : 'smooth', top });
        } else {
          scroller.scrollTop = top;
        }
      }
    }
    setOutlineOpen(false);
  }

  async function copyYaml() {
    await navigator.clipboard.writeText(yamlText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  useEffect(() => {
    const scroller = documentScrollerRef.current;
    if (!scroller || mode !== 'rendered') return;

    function updateSelectedNode() {
      if (!scroller) return;
      if (programmaticNodeRef.current) return;
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
  }, [mode, model]);

  useEffect(() => {
    function closeTransientPanels(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setInspectorOpen(false);
      setOutlineOpen(false);
    }
    window.addEventListener('keydown', closeTransientPanels);
    return () => {
      window.removeEventListener('keydown', closeTransientPanels);
      if (programmaticNodeTimerRef.current !== null) {
        window.clearTimeout(programmaticNodeTimerRef.current);
      }
    };
  }, []);

  return (
    <section
      aria-label="Schema render"
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface-card)]"
    >
      <header className="flex min-h-[55px] shrink-0 flex-wrap items-center gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="truncate font-mono text-[11px] font-semibold text-[var(--text-secondary)]">
            {rootKey} <span className="text-[var(--text-tertiary)]">/</span>{' '}
            <span className="text-[var(--text-primary)]">{model.title}</span>
          </span>
          <Badge variant={validationReady ? 'success' : 'warning'}>{validationLabel}</Badge>
        </div>

        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
          <Button
            aria-expanded={outlineOpen}
            className="xl:hidden"
            onClick={() => {
              setOutlineOpen((current) => !current);
              setInspectorOpen(false);
            }}
            size="sm"
            type="button"
            variant="canvas-outline"
          >
            <ListTree aria-hidden="true" className="size-3.5" />
            Outline
          </Button>
          <Button
            aria-pressed={inspectorTab === 'evidence'}
            onClick={() => openInspector('evidence')}
            size="sm"
            type="button"
            variant="canvas-outline"
          >
            <FileText aria-hidden="true" className="size-3.5" />
            HEAD evidence <span>{model.evidence.length}</span>
          </Button>
          <Button
            aria-pressed={inspectorTab === 'changes'}
            onClick={() => openInspector('changes')}
            size="sm"
            type="button"
            variant="canvas-outline"
          >
            <GitCompare aria-hidden="true" className="size-3.5" />
            HEAD YOps <span>{model.changes.length}</span>
          </Button>
          <Button
            aria-expanded={inspectorOpen}
            className="2xl:hidden"
            onClick={() => openInspector('node')}
            size="sm"
            type="button"
            variant="canvas-outline"
          >
            <PanelRight aria-hidden="true" className="size-3.5" />
            Inspector
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
                  if (nextMode === 'raw') {
                    setInspectorOpen(false);
                    setOutlineOpen(false);
                  }
                }}
                role="tab"
                tabIndex={mode === nextMode ? 0 : -1}
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
          className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] overflow-hidden xl:grid-cols-[var(--prd-outline-width)_8px_minmax(0,1fr)] 2xl:grid-cols-[var(--prd-outline-width)_8px_minmax(0,1fr)_8px_var(--prd-inspector-width)]"
          ref={readerLayoutRef}
          style={
            {
              '--prd-inspector-width': `${String(inspectorWidth)}px`,
              '--prd-outline-width': `${String(outlineWidth)}px`,
            } as CSSProperties
          }
        >
          {(outlineOpen || inspectorOpen) && (
            <button
              aria-label="Close open panel"
              className={cn(
                'absolute inset-0 z-20 bg-[var(--text-primary)]/[0.06] backdrop-blur-[1px]',
                outlineOpen ? 'xl:hidden' : '2xl:hidden'
              )}
              onClick={() => {
                setInspectorOpen(false);
                setOutlineOpen(false);
              }}
              type="button"
            />
          )}
          <PrdOutline
            model={model}
            nodes={outlineNodes}
            onClose={() => setOutlineOpen(false)}
            onSelect={(nodeId) => selectNode(nodeId, true)}
            open={outlineOpen}
            schemaNavigation={schemaNavigation}
            selectedNodeId={selectedNodeId}
          />
          <StatePaneResizeHandle
            className="hidden xl:block"
            label="Resize document outline"
            max={PRD_OUTLINE_MAX_WIDTH}
            min={PRD_OUTLINE_MIN_WIDTH}
            onKeyDown={(event) => handlePaneResizeKeyDown('outline', event)}
            onMouseDown={(event) => handlePaneResizeMouseDown('outline', event)}
            onReset={() => setOutlineWidth(PRD_OUTLINE_DEFAULT_WIDTH)}
            value={outlineWidth}
          />
          <StateScrollArea
            className="min-h-0 min-w-0 bg-[var(--surface-card)]"
            horizontal
            label={schemaName === 't3x/prd' ? 'Rendered PRD document' : 'Rendered state document'}
            ref={documentScrollerRef}
          >
            <PrdDocument
              model={model}
              onInspectEvidence={(evidenceId) => openInspector('evidence', evidenceId)}
              onSelectNode={(nodeId) => selectNode(nodeId)}
              schemaName={schemaName}
              schemaNavigation={schemaNavigation}
              selectedNodeId={selectedNodeId}
              validationGapCount={validationGapCount}
              validationReady={validationReady}
            />
          </StateScrollArea>
          <StatePaneResizeHandle
            className="hidden 2xl:block"
            label="Resize PRD inspector"
            max={PRD_INSPECTOR_MAX_WIDTH}
            min={PRD_INSPECTOR_MIN_WIDTH}
            onKeyDown={(event) => handlePaneResizeKeyDown('inspector', event)}
            onMouseDown={(event) => handlePaneResizeMouseDown('inspector', event)}
            onReset={() => setInspectorWidth(PRD_INSPECTOR_DEFAULT_WIDTH)}
            value={inspectorWidth}
          />
          <PrdInspector
            activeTab={inspectorTab}
            inspectorOpen={inspectorOpen}
            model={model}
            onClose={() => setInspectorOpen(false)}
            onSelectTab={setInspectorTab}
            selectedNode={selectedNode}
            selectedEvidence={selectedEvidence}
            validationLabel={validationLabel}
            validationReady={validationReady}
          />
        </div>
      ) : (
        <section
          aria-label="Raw materialized YAML"
          className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface-code)] text-[var(--text-code)]"
        >
          <header className="flex min-h-11 shrink-0 items-center gap-2 border-b border-[var(--text-tertiary)]/20 bg-[var(--surface-code)] px-4">
            <span className="font-mono text-[11px] font-semibold text-[var(--text-code)]">
              {rootKey}.yaml
            </span>
            <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
              HEAD · {model.changes.length} YOps applied
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
  onSelectNode,
  schemaName,
  schemaNavigation,
  selectedNodeId,
  validationGapCount,
  validationReady,
}: {
  model: PrdRenderModel;
  onInspectEvidence: (evidenceId: string) => void;
  onSelectNode: (nodeId: string) => void;
  schemaName: string;
  schemaNavigation: PrdSchemaNavigation | null;
  selectedNodeId: string;
  validationGapCount: number;
  validationReady: boolean;
}) {
  const isPrdDocument = schemaName === 't3x/prd';
  const moduleByNodeId = new Map(
    schemaNavigation?.modules.map((module) => [module.nodeId, module]) ?? []
  );
  return (
    <article className="mx-auto w-[min(1080px,calc(100%-56px))] py-10 max-md:w-[calc(100%-32px)] max-md:py-7">
      <header
        className="scroll-mt-6 border-b border-[var(--stroke-divider)] pb-7"
        data-prd-node="document"
      >
        <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
          {isPrdDocument ? 'Product requirements document' : 'Structured state document'}
          {model.documentId ? ` · ${model.documentId}` : ''}
        </p>
        <h1 className="mt-2.5 max-w-[820px] text-[31px] font-bold leading-[1.2] tracking-[-0.032em] text-[var(--text-primary)]">
          {model.title}
        </h1>
        <p className="mt-3.5 max-w-[820px] text-[15.5px] leading-[1.72] text-[var(--text-secondary)]">
          {model.lede ||
            model.outcome ||
            model.problem ||
            (isPrdDocument
              ? 'Materialized product requirements.'
              : 'Materialized structured state.')}
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-[var(--text-tertiary)]">
          <span>{model.schemaVersion || schemaName}</span>
          {model.owner ? <span>Owner: {model.owner}</span> : null}
          <span>
            {model.evidence.length} HEAD source{model.evidence.length === 1 ? '' : 's'}
          </span>
          <span>{model.changes.length} HEAD YOps</span>
          {model.target ? <span>Target: {model.target}</span> : null}
          <span>Materialized commit</span>
        </div>
      </header>

      {isPrdDocument ? (
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
              nodeId="summary-problem"
              onInspectEvidence={onInspectEvidence}
              onSelectNode={onSelectNode}
              value={model.problem || 'No problem statement provided.'}
            />
            <SummaryCell
              evidenceIds={evidenceIdsForPath(model, 'summary/audience')}
              label="Audience"
              missing={model.audienceMissing}
              nodeId="summary-audience"
              onInspectEvidence={onInspectEvidence}
              onSelectNode={onSelectNode}
              value={model.audience || 'This field is required by the schema.'}
            />
            <SummaryCell
              evidenceIds={evidenceIdsForPath(model, 'summary/outcome')}
              label="Outcome"
              nodeId="summary-outcome"
              onInspectEvidence={onInspectEvidence}
              onSelectNode={onSelectNode}
              value={model.outcome || 'No outcome specified.'}
            />
          </div>
        </section>
      ) : null}

      {isPrdDocument ? (
        <RequirementsSection
          model={model}
          onInspectEvidence={onInspectEvidence}
          onSelectNode={onSelectNode}
          sectionNumber={1}
          selectedNodeId={selectedNodeId}
        />
      ) : null}

      {model.sections.map((section, index) => (
        <StructuredSection
          alwaysExpanded={!isPrdDocument}
          index={index + (isPrdDocument ? 2 : 1)}
          key={section.key}
          model={model}
          nodeId={`section-${String(index)}`}
          onInspectEvidence={onInspectEvidence}
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
          onInspectEvidence={onInspectEvidence}
          onSelectNode={onSelectNode}
          section={{ key: 'metadata', title: 'Document metadata', value: model.metadata }}
          selected={selectedNodeId === 'metadata'}
        />
      ) : null}
    </article>
  );
}

function SummaryCell({
  evidenceIds,
  label,
  missing = false,
  nodeId,
  onInspectEvidence,
  onSelectNode,
  value,
}: {
  evidenceIds: string[];
  label: string;
  missing?: boolean;
  nodeId: string;
  onInspectEvidence: (evidenceId: string) => void;
  onSelectNode: (nodeId: string) => void;
  value: string;
}) {
  return (
    <section
      className={cn(
        'min-w-0 scroll-mt-6 px-4 py-4 first:pl-0 last:pr-0 md:border-r md:border-[var(--stroke-divider)] md:last:border-r-0',
        missing && 'bg-[var(--status-warning-muted)] px-4 first:pl-4'
      )}
      data-prd-node={nodeId}
    >
      <h3 className="text-xs font-bold text-[var(--text-primary)]">
        <button
          className="rounded-sm text-left hover:text-[var(--accent-commit)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-commit)]"
          onClick={() => onSelectNode(nodeId)}
          type="button"
        >
          {label}
        </button>
      </h3>
      <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">{value}</p>
      <CitationButtons evidenceIds={evidenceIds} onInspectEvidence={onInspectEvidence} />
    </section>
  );
}

function StructuredSection({
  alwaysExpanded = false,
  index,
  model,
  nodeId,
  onInspectEvidence,
  onSelectNode,
  section,
  schemaModule,
  selected,
}: {
  alwaysExpanded?: boolean;
  index: number;
  model: PrdRenderModel;
  nodeId: string;
  onInspectEvidence: (evidenceId: string) => void;
  onSelectNode: (nodeId: string) => void;
  section: PrdRenderSection;
  schemaModule?: PrdSchemaNavigationItem;
  selected: boolean;
}) {
  const evidenceIds = evidenceIdsForPath(model, section.key);
  return (
    <section
      className="scroll-mt-6 border-b border-[var(--stroke-divider)] py-8"
      data-prd-node={nodeId}
    >
      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
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
        <h2 className="text-[21px] font-bold leading-[1.35] tracking-[-0.02em] text-[var(--text-primary)]">
          <button
            aria-expanded={selected}
            className="rounded-sm text-left hover:text-[var(--accent-commit)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-commit)]"
            onClick={() => onSelectNode(nodeId)}
            type="button"
          >
            <span className="inline-flex items-center gap-2">
              {sectionTitle(section)}
              <ChevronDown
                aria-hidden="true"
                className={cn('size-4 transition-transform', selected && 'rotate-180')}
              />
            </span>
          </button>
        </h2>
        <CitationButtons evidenceIds={evidenceIds} onInspectEvidence={onInspectEvidence} />
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
  onInspectEvidence,
  onSelectNode,
  sectionNumber,
  selectedNodeId,
}: {
  model: PrdRenderModel;
  onInspectEvidence: (evidenceId: string) => void;
  onSelectNode: (nodeId: string) => void;
  sectionNumber: number;
  selectedNodeId: string;
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
        <div className="mt-3 divide-y divide-[var(--stroke-divider)]">
          {model.requirements.map((requirement, index) => (
            <RequirementBlock
              evidenceIds={evidenceIdsForPaths(model, [
                `requirements/${requirement.key || String(index)}`,
                `requirements/${String(index)}`,
              ])}
              index={index}
              key={`${requirement.key}:${requirement.title}:${String(index)}`}
              onInspectEvidence={onInspectEvidence}
              onSelectNode={onSelectNode}
              requirement={requirement}
              selected={selectedNodeId === `requirement-${String(index)}`}
            />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-[var(--text-tertiary)]">
          No requirements were materialized in this state.
        </p>
      )}
    </section>
  );
}

function RequirementBlock({
  evidenceIds,
  index,
  onInspectEvidence,
  onSelectNode,
  requirement,
  selected,
}: {
  evidenceIds: string[];
  index: number;
  onInspectEvidence: (evidenceId: string) => void;
  onSelectNode: (nodeId: string) => void;
  requirement: PrdRenderRequirement;
  selected: boolean;
}) {
  const criteria = acceptanceCriteria(requirement.acceptance);
  const displayedCriteria = criteria.length > 0 ? criteria : ['Not specified'];
  const requirementId = requirement.key || `R-${String(index + 1).padStart(2, '0')}`;
  const nodeId = `requirement-${String(index)}`;
  return (
    <article className="scroll-mt-6 py-6 first:pt-5" data-prd-node={nodeId}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] font-extrabold text-[var(--accent-commit)]">
              {requirementId}
            </span>
            <Badge variant="pending-subtle">{requirement.priority || 'P?'}</Badge>
          </div>
          <h3 className="mt-2 text-[18px] font-bold leading-[1.35] tracking-[-0.015em] text-[var(--text-primary)]">
            <button
              aria-label={`Inspect requirement ${requirement.title}`}
              aria-expanded={selected}
              className="rounded-sm text-left hover:text-[var(--accent-commit)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-commit)]"
              onClick={() => onSelectNode(nodeId)}
              type="button"
            >
              <span className="inline-flex items-center gap-2">
                {requirement.title}
                <ChevronDown
                  aria-hidden="true"
                  className={cn('size-4 transition-transform', selected && 'rotate-180')}
                />
              </span>
            </button>
          </h3>
          {requirement.owner ? (
            <p className="mt-1.5 text-[10px] font-semibold text-[var(--text-tertiary)]">
              Owner · {requirement.owner}
            </p>
          ) : null}
          {requirement.description ? (
            <p className="mt-2 max-w-[72ch] text-[13px] leading-6 text-[var(--text-secondary)]">
              {requirement.description}
            </p>
          ) : null}
        </div>
        <Badge variant="outline">
          {criteria.length} acceptance {criteria.length === 1 ? 'criterion' : 'criteria'}
        </Badge>
      </header>

      {selected ? (
        <>
          <div className="mt-4 border-y border-[var(--stroke-divider)]">
            {displayedCriteria.map((criterion, criterionIndex) => (
              <div
                className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-3 border-b border-[var(--stroke-divider)] px-1 py-2.5 last:border-b-0 max-sm:grid-cols-[18px_minmax(0,1fr)]"
                key={`${criterion}:${String(criterionIndex)}`}
              >
                <span
                  className={cn(
                    'mt-0.5 inline-flex size-4 items-center justify-center rounded-full',
                    criteria.length > 0
                      ? 'bg-[var(--status-success-muted)] text-[var(--status-success)]'
                      : 'bg-[var(--status-warning-muted)] text-[var(--status-warning)]'
                  )}
                >
                  {criteria.length > 0 ? (
                    <Check aria-hidden="true" className="size-3" />
                  ) : (
                    <span aria-hidden="true">—</span>
                  )}
                  <span className="sr-only">
                    {criteria.length > 0 ? 'Criterion present' : 'Criterion missing'}
                  </span>
                </span>
                <span className="text-[12.5px] leading-5 text-[var(--text-primary)]">
                  {criterion}
                </span>
                <code className="font-mono text-[9px] text-[var(--text-tertiary)] max-sm:col-start-2">
                  AC-{String(index + 1).padStart(3, '0')}-
                  {String(criterionIndex + 1).padStart(2, '0')}
                </code>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <CitationButtons evidenceIds={evidenceIds} onInspectEvidence={onInspectEvidence} />
          </div>
        </>
      ) : null}
    </article>
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
            onClick={(event) => {
              event.stopPropagation();
              onInspectEvidence(evidenceId);
            }}
            type="button"
          >
            S{sourceNumber}
          </button>
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
              <dd className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
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

function PrdOutline({
  model,
  nodes,
  onClose,
  onSelect,
  open,
  schemaNavigation,
  selectedNodeId,
}: {
  model: PrdRenderModel;
  nodes: PrdOutlineNode[];
  onClose: () => void;
  onSelect: (nodeId: string) => void;
  open: boolean;
  schemaNavigation: PrdSchemaNavigation | null;
  selectedNodeId: string;
}) {
  const [view, setView] = useState<'modules' | 'outline'>('modules');
  const isPrdDocument = (model.rootKey || 'prd') === 'prd';
  const activeView = schemaNavigation ? view : 'outline';
  const groups: PrdOutlineNode['group'][] = ['document', 'summary', 'requirements', 'optional'];
  const labels: Record<PrdOutlineNode['group'], string> = {
    document: 'Document',
    optional: 'Other sections',
    requirements: 'Requirements',
    summary: 'Summary',
  };

  return (
    <aside
      aria-label="Document outline"
      className={cn(
        'z-30 min-h-0 overflow-hidden border-r border-[var(--stroke-divider)] bg-[var(--surface-panel)]',
        open
          ? 'absolute inset-y-0 left-0 block w-[270px] shadow-[var(--fx-shadow-lg)] xl:static xl:w-auto xl:shadow-none'
          : 'hidden xl:block'
      )}
    >
      <StateScrollArea className="h-full" label="Document outline items">
        <div className="px-3 py-4">
          <header className="border-b border-[var(--stroke-divider)] px-1 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <strong className="block text-[11px] font-bold text-[var(--text-primary)]">
                  {isPrdDocument ? 'PRD structure' : 'Document structure'}
                </strong>
                <span className="mt-0.5 block text-[9px] text-[var(--text-tertiary)]">
                  {schemaNavigation ? (
                    <>
                      <span>
                        {schemaNavigation.modules.length} Module
                        {schemaNavigation.modules.length === 1 ? '' : 's'} used
                      </span>
                      <span aria-hidden="true"> · </span>
                      <span>
                        {schemaNavigation.source === 'committed'
                          ? 'Committed composition'
                          : 'Workspace composition'}
                      </span>
                    </>
                  ) : (
                    'Committed document outline'
                  )}
                </span>
              </div>
              <Button
                className="xl:hidden"
                onClick={onClose}
                size="sm"
                type="button"
                variant="canvas-outline"
              >
                Close
              </Button>
            </div>
            {schemaNavigation ? (
              <div
                aria-label="PRD navigation view"
                className="mt-3 grid grid-cols-2 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-app)] p-0.5"
                role="tablist"
              >
                {(['modules', 'outline'] as const).map((nextView) => (
                  <button
                    aria-selected={activeView === nextView}
                    className={cn(
                      'h-7 rounded-[5px] text-[9px] font-bold capitalize text-[var(--text-tertiary)] transition-colors',
                      activeView === nextView &&
                        'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm'
                    )}
                    key={nextView}
                    onClick={() => setView(nextView)}
                    role="tab"
                    tabIndex={activeView === nextView ? 0 : -1}
                    type="button"
                  >
                    {nextView}
                  </button>
                ))}
              </div>
            ) : null}
          </header>

          {activeView === 'modules' && schemaNavigation ? (
            <nav aria-label="PRD Module navigation" className="mt-4">
              {schemaNavigation.core ? (
                <>
                  <h2 className="px-1 text-[8px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                    Core tagged Module
                  </h2>
                  <div className="mt-1.5">
                    <SchemaNavigationRow
                      index={0}
                      item={schemaNavigation.core}
                      onSelect={onSelect}
                      selected={selectedNodeId === schemaNavigation.core.nodeId}
                    />
                  </div>
                </>
              ) : null}
              <h2 className="mt-4 px-1 text-[8px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                Modules used
              </h2>
              <div className="mt-1.5 grid gap-1">
                {schemaNavigation.modules.map((module, index) => (
                  <SchemaNavigationRow
                    index={index + (schemaNavigation.core ? 1 : 0)}
                    item={module}
                    key={`${module.canonicalName}@${module.version}`}
                    onSelect={onSelect}
                    selected={selectedNodeId === module.nodeId}
                  />
                ))}
              </div>
            </nav>
          ) : (
            <nav
              aria-label={isPrdDocument ? 'PRD semantic nodes' : 'Structured state semantic nodes'}
              className="mt-4"
            >
              {groups.map((group) => {
                const groupNodes = nodes.filter((node) => node.group === group);
                if (groupNodes.length === 0) return null;
                return (
                  <section className="mb-4" key={group}>
                    <h2 className="px-1 text-[8px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                      {labels[group]}
                    </h2>
                    <div className="mt-1.5 grid gap-0.5">
                      {groupNodes.map((node) => {
                        const selected = selectedNodeId === node.id;
                        return (
                          <button
                            aria-current={selected ? 'true' : undefined}
                            aria-label={node.meta ? `${node.label} · ${node.meta}` : node.label}
                            className={cn(
                              'flex min-h-8 w-full items-start gap-2 rounded-md border-l-2 border-l-transparent px-2 py-1.5 text-left text-[10px] leading-4 text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]',
                              selected &&
                                'border-l-[var(--accent-commit)] bg-[var(--status-info-muted)] font-semibold text-[var(--status-info)]'
                            )}
                            key={node.id}
                            onClick={() => onSelect(node.id)}
                            type="button"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold text-current">{node.label}</span>
                              {node.meta ? (
                                <span className="mt-0.5 block truncate font-mono text-[8px] font-normal text-[var(--text-tertiary)]">
                                  {node.meta}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </nav>
          )}
        </div>
      </StateScrollArea>
    </aside>
  );
}

const SCHEMA_NAV_ICONS = {
  blocks: Blocks,
  braces: Braces,
  cpu: Cpu,
  database: Database,
  file: FileCode2,
  monitor: Monitor,
  server: Server,
};

const SCHEMA_NAV_TONES = [
  'text-[var(--accent-commit)] bg-[color-mix(in_srgb,var(--accent-commit)_9%,transparent)]',
  'text-[var(--accent-extract)] bg-[color-mix(in_srgb,var(--accent-extract)_9%,transparent)]',
  'text-[var(--accent-leaf)] bg-[color-mix(in_srgb,var(--accent-leaf)_9%,transparent)]',
  'text-[var(--accent-pending)] bg-[color-mix(in_srgb,var(--accent-pending)_9%,transparent)]',
  'text-[var(--accent-conversation)] bg-[color-mix(in_srgb,var(--accent-conversation)_9%,transparent)]',
];

function SchemaNavigationRow({
  index,
  item,
  onSelect,
  selected,
}: {
  index: number;
  item: PrdSchemaNavigationItem;
  onSelect: (nodeId: string) => void;
  selected: boolean;
}) {
  const Icon = SCHEMA_NAV_ICONS[item.icon];
  const tone = SCHEMA_NAV_TONES[index % SCHEMA_NAV_TONES.length] ?? SCHEMA_NAV_TONES[0];
  return (
    <div
      className={cn(
        'group flex min-h-[50px] items-center rounded-md border-l-2 border-l-transparent transition-colors hover:bg-[var(--hover-bg)]',
        selected && 'border-l-[var(--accent-commit)] bg-[var(--status-info-muted)]'
      )}
    >
      <button
        aria-current={selected ? 'true' : undefined}
        aria-label={`Go to ${item.title} instance`}
        className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-left"
        onClick={() => onSelect(item.nodeId)}
        type="button"
      >
        <span className={cn('flex size-6 flex-none items-center justify-center rounded-md', tone)}>
          <Icon aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10px] font-semibold text-[var(--text-primary)]">
            {item.title}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[8px] text-[var(--text-tertiary)]">
            {item.canonicalName} · v{item.version}
          </span>
        </span>
      </button>
      <Link
        aria-label={`Open ${item.title} in YSchema`}
        className="mr-1 flex size-7 flex-none items-center justify-center rounded-md text-[var(--text-tertiary)] opacity-70 transition-colors hover:bg-[var(--surface-card)] hover:text-[var(--accent-commit)] group-hover:opacity-100"
        href={item.href}
      >
        <ExternalLink aria-hidden="true" className="size-3" />
      </Link>
    </div>
  );
}

function PrdInspector({
  activeTab,
  inspectorOpen,
  model,
  onClose,
  onSelectTab,
  selectedNode,
  selectedEvidence,
  validationLabel,
  validationReady,
}: {
  activeTab: InspectorTab;
  inspectorOpen: boolean;
  model: PrdRenderModel;
  onClose: () => void;
  onSelectTab: (tab: InspectorTab) => void;
  selectedNode: PrdSelectedNode;
  selectedEvidence: PrdRenderEvidence | null;
  validationLabel: string;
  validationReady: boolean;
}) {
  const isPrdDocument = (model.rootKey || 'prd') === 'prd';
  return (
    <aside
      aria-label={isPrdDocument ? 'PRD inspector' : 'State document inspector'}
      className={cn(
        'z-30 min-h-0 min-w-0 flex-col overflow-hidden border-l border-[var(--stroke-divider)] bg-[var(--surface-panel)]',
        inspectorOpen
          ? 'absolute inset-y-0 right-0 flex w-[min(340px,92vw)] shadow-[var(--fx-shadow-lg)] 2xl:static 2xl:w-auto 2xl:shadow-none'
          : 'hidden 2xl:flex'
      )}
    >
      <header
        aria-label="Inspector views"
        className="flex min-h-[54px] shrink-0 items-center gap-1 border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3"
        role="tablist"
      >
        {(['node', 'evidence', 'changes'] as const).map((tab) => (
          <button
            aria-selected={activeTab === tab}
            className={cn(
              'h-[54px] border-b-2 border-transparent px-2 text-[11px] font-bold capitalize text-[var(--text-tertiary)]',
              activeTab === tab && 'border-[var(--source)] text-[var(--source)]'
            )}
            key={tab}
            onClick={() => onSelectTab(tab)}
            role="tab"
            tabIndex={activeTab === tab ? 0 : -1}
            type="button"
          >
            {tab}
          </button>
        ))}
        <Button
          className="ml-auto 2xl:hidden"
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="canvas-ghost"
        >
          <X aria-hidden="true" />
          <span className="sr-only">Close inspector</span>
        </Button>
      </header>

      <StateScrollArea
        className="min-h-0 flex-1"
        label={isPrdDocument ? 'PRD inspector content' : 'State document inspector content'}
      >
        {activeTab === 'node' ? (
          <NodeInspector
            model={model}
            node={selectedNode}
            validationLabel={validationLabel}
            validationReady={validationReady}
          />
        ) : null}
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
      </StateScrollArea>
    </aside>
  );
}

function NodeInspector({
  model,
  node,
  validationLabel,
  validationReady,
}: {
  model: PrdRenderModel;
  node: PrdSelectedNode;
  validationLabel: string;
  validationReady: boolean;
}) {
  const isPrdDocument = (model.rootKey || 'prd') === 'prd';
  const criteriaApplicable =
    (node.type === 'Document' && isPrdDocument) || node.type === 'Requirement';
  const criteriaStatus =
    node.acceptanceCount > 0 ? 'Present' : criteriaApplicable ? 'Missing' : 'Not applicable';
  return (
    <div aria-live="polite" aria-atomic="true">
      <section className="border-b border-[var(--stroke-divider)] p-5">
        <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
          Selected semantic node
        </p>
        <h2 className="mt-2 text-base font-bold leading-6 text-[var(--text-primary)]">
          {node.label}
        </h2>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{node.description}</p>
      </section>

      <section className="border-b border-[var(--stroke-divider)] p-5">
        <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
          Semantic address
        </p>
        <code className="mt-3 block break-all rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-3 font-mono text-[10px] font-bold text-[var(--accent-commit)]">
          State → {node.path.replaceAll('/', ' → ')}
        </code>
      </section>

      <section className="border-b border-[var(--stroke-divider)] p-5">
        <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
          Node definition
        </p>
        <dl className="mt-3 grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
          <InspectorDefinition label="Type" value={node.type} />
          <InspectorDefinition label="Identity" mono value={node.identity} />
          <InspectorDefinition label="Cardinality" value={node.cardinality} />
          <InspectorDefinition label="Required" value={node.required ? 'Yes' : 'No'} />
          <InspectorDefinition
            label="Render"
            value={isPrdDocument ? 'PRD document' : 'Structured state document'}
          />
        </dl>
      </section>

      <section className="border-b border-[var(--stroke-divider)] p-5">
        <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
          Node validation
        </p>
        <div className="mt-3 grid gap-2">
          <InspectorCheck label="Known schema adapter" status="Pass" tone="success" />
          <InspectorCheck
            label={validationLabel}
            status={validationReady ? 'Pass' : 'Review'}
            tone={validationReady ? 'success' : 'warning'}
          />
          <InspectorCheck
            label={`${String(node.acceptanceCount)} acceptance ${node.acceptanceCount === 1 ? 'criterion' : 'criteria'}`}
            status={criteriaStatus}
            tone={node.acceptanceCount > 0 ? 'success' : criteriaApplicable ? 'warning' : 'neutral'}
          />
        </div>
      </section>

      <section className="p-5">
        <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
          Provenance
        </p>
        <dl className="mt-3 grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
          <InspectorDefinition label="HEAD sources" value={String(model.evidence.length)} />
          <InspectorDefinition label="HEAD YOps" value={String(model.changes.length)} />
          <InspectorDefinition
            label="Schema"
            mono
            value={model.schemaVersion || 'project binding'}
          />
        </dl>
      </section>
    </div>
  );
}

function InspectorDefinition({
  label,
  mono,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <>
      <dt className="font-medium text-[var(--text-tertiary)]">{label}</dt>
      <dd
        className={cn(
          'min-w-0 font-bold text-[var(--text-primary)]',
          mono && 'font-mono text-[10px]'
        )}
      >
        {value}
      </dd>
    </>
  );
}

function InspectorCheck({
  label,
  status,
  tone,
}: {
  label: string;
  status: string;
  tone: 'neutral' | 'success' | 'warning';
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2.5">
      <span className="text-[10px] text-[var(--text-primary)]">{label}</span>
      <span
        className={cn(
          'font-mono text-[9px] font-extrabold uppercase',
          tone === 'success' && 'text-[var(--status-success)]',
          tone === 'warning' && 'text-[var(--status-warning)]',
          tone === 'neutral' && 'text-[var(--text-tertiary)]'
        )}
      >
        {status}
      </span>
    </div>
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
          The rendered statement is linked to evidence attached to the current HEAD commit and its
          deterministic materialization trace.
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
          <InspectorTrace label="Proposal" value={`${model.changes.length} reviewed HEAD YOps`} />
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
        <strong className="text-xs text-[var(--text-primary)]">HEAD materialized YOps</strong>
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
    <StateScrollArea className="min-h-0 flex-1" horizontal label="Raw YAML content">
      <table className="w-full min-w-[760px] border-collapse font-mono text-[12.5px] leading-[1.72]">
        <tbody>
          {yamlText.split('\n').map((line, index) => (
            <tr key={String(index)}>
              <td className="sticky left-0 z-10 w-[58px] select-none border-r border-[var(--text-tertiary)]/20 bg-[var(--surface-code)] pr-4 text-right align-top text-[var(--text-tertiary)]">
                {index + 1}
              </td>
              <td className="whitespace-pre px-4 align-top text-[var(--text-code)]">{line}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </StateScrollArea>
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

function buildOutlineNodes(model: PrdRenderModel): PrdOutlineNode[] {
  const rootKey = model.rootKey || 'prd';
  const isPrdDocument = rootKey === 'prd';
  return [
    { group: 'document', id: 'document', label: model.title, meta: model.documentId || rootKey },
    ...(isPrdDocument
      ? [
          { group: 'summary' as const, id: 'summary-problem', label: 'Problem' },
          { group: 'summary' as const, id: 'summary-audience', label: 'Audience' },
          { group: 'summary' as const, id: 'summary-outcome', label: 'Outcome' },
          ...model.requirements.map((requirement, index) => ({
            group: 'requirements' as const,
            id: `requirement-${String(index)}`,
            label: requirement.title,
            meta: requirement.key || `R-${String(index + 1).padStart(2, '0')}`,
          })),
        ]
      : []),
    ...model.sections.map((section, index) => ({
      group: 'optional' as const,
      id: `section-${String(index)}`,
      label: section.title,
      meta: section.key,
    })),
    ...(Object.keys(model.metadata).length > 0
      ? [{ group: 'optional' as const, id: 'metadata', label: 'Document metadata' }]
      : []),
  ];
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

function selectInspectorNode(model: PrdRenderModel, nodeId: string): PrdSelectedNode {
  const rootKey = model.rootKey || 'prd';
  const isPrdDocument = rootKey === 'prd';
  if (
    nodeId === 'summary-problem' ||
    nodeId === 'summary-audience' ||
    nodeId === 'summary-outcome'
  ) {
    const key = nodeId.replace('summary-', '');
    return {
      acceptanceCount: 0,
      cardinality: 'Exactly one',
      description: `Schema-backed ${key} field rendered in the executive summary.`,
      identity: key,
      label: humanizeKey(key),
      path: `${rootKey}/summary/${key}`,
      required: true,
      type: key === 'audience' ? 'Text or list slot' : 'String slot',
    };
  }

  const requirementIndex = Number.parseInt(nodeId.replace('requirement-', ''), 10);
  if (nodeId.startsWith('requirement-') && Number.isInteger(requirementIndex)) {
    const requirement = model.requirements[requirementIndex];
    if (requirement) {
      const identity = requirement.key || `R-${String(requirementIndex + 1).padStart(2, '0')}`;
      return {
        acceptanceCount: acceptanceCriteria(requirement.acceptance).length,
        cardinality: 'One of many',
        description:
          requirement.description || 'A schema-backed requirement in the materialized PRD.',
        identity,
        label: `${identity} · ${requirement.title}`,
        path: `${rootKey}/requirements/${requirement.key || String(requirementIndex)}`,
        required: true,
        type: 'Requirement',
      };
    }
  }

  const sectionIndex = Number.parseInt(nodeId.replace('section-', ''), 10);
  if (nodeId.startsWith('section-') && Number.isInteger(sectionIndex)) {
    const section = model.sections[sectionIndex];
    if (section) {
      return {
        acceptanceCount: 0,
        cardinality: 'Zero or one',
        description: `Optional ${section.title.toLowerCase()} section materialized from committed state.`,
        identity: section.key,
        label: section.title,
        path: `${rootKey}/${section.key}`,
        required: false,
        type: 'Section',
      };
    }
  }

  if (nodeId === 'metadata') {
    return {
      acceptanceCount: 0,
      cardinality: 'Zero or one',
      description: `Versioning and source metadata attached to the ${isPrdDocument ? 'PRD' : 'state'} document.`,
      identity: 'metadata',
      label: 'Document metadata',
      path: `${rootKey}/metadata`,
      required: false,
      type: 'Metadata section',
    };
  }

  return {
    acceptanceCount: model.requirements.reduce(
      (count, requirement) => count + acceptanceCriteria(requirement.acceptance).length,
      0
    ),
    cardinality: 'Exactly one',
    description: isPrdDocument
      ? 'Root document node rendered as the committed product requirements document.'
      : 'Root document node rendered from committed structured state.',
    identity: model.documentId || rootKey,
    label: model.title,
    path: rootKey,
    required: true,
    type: 'Document',
  };
}
