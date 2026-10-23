'use client';
import type { StudioCandidate, StudioPreview } from '@t3x-dev/api-client';
import { dump } from 'js-yaml';
import { ArrowUpRight, GitBranch, X } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ReferenceIcon as Icon } from './DiscoverReference';
import shared from './ExploreDiscoverySurface.module.css';
import s from './SchemaStudioExperience.module.css';
import { SchemaToolbarSlot } from './SchemaToolbarSlot';
import { StudioChanges, StudioImpactPreview } from './StudioDefinitionPreview';

export type StudioVisualModule = {
  id: string;
  title: string;
  source: string;
  tone: string;
  checked: boolean;
  candidate?: StudioCandidate;
};
export function SchemaStudioSurface({
  navigation,
  dataEditor,
  editorInvalid = false,
  contextLocked = false,
  browseHref,
  sourceHref,
  workspaceHref,
  branch,
  draftStatus,
  workspaceTitle = 'No draft workspace',
  workspaceId = '',
  workspaces = [],
  onWorkspace,
  modules = [],
  composition = [],
  activeModule,
  onSelect,
  onChoose,
  onRemove,
  locked = new Set<string>(),
  pending = false,
  loading = false,
  error,
  data,
  onCheck,
  onAdd,
  onEditDefinition,
  onReview,
  canReview = false,
  onDownload,
  onClear,
}: {
  navigation?: ReactNode;
  editorInvalid?: boolean;
  dataEditor?: (view: 'data' | 'visual') => ReactNode;
  contextLocked?: boolean;
  browseHref: string;
  sourceHref?: string;
  workspaceHref?: string;
  branch?: string;
  draftStatus?: string;
  workspaceTitle?: string;
  workspaceId?: string;
  workspaces?: Array<{ id: string; title: string }>;
  onWorkspace?: (id: string) => void;
  modules?: StudioVisualModule[];
  composition?: StudioVisualModule[];
  activeModule?: StudioVisualModule;
  onSelect?: (id: string) => void;
  onChoose?: (module: StudioVisualModule) => void;
  onRemove?: (id: string) => void;
  locked?: Set<string>;
  pending?: boolean;
  loading?: boolean;
  error?: string;
  data?: StudioPreview;
  onCheck?: () => void;
  onAdd?: () => void;
  onEditDefinition?: () => void;
  onReview?: () => void;
  canReview?: boolean;
  onDownload?: () => void;
  onClear?: () => void;
}) {
  const [mode, setMode] = useState<'data' | 'visual' | 'structure' | 'yaml'>(
    dataEditor ? 'data' : 'structure'
  );
  const editing = mode === 'data' || mode === 'visual';
  const [panel, setPanel] = useState<'Inspector' | 'Checks' | 'Changes' | null>('Inspector');
  const detailsOpen = panel !== null && (!editing || panel !== 'Inspector');
  const [zoom, setZoom] = useState(1);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const yaml = useMemo(
    () =>
      data?.schema
        ? dump(data.schema, { noRefs: true, lineWidth: 100 })
        : '# Add a module to preview its definition.',
    [data?.schema]
  );
  const sourceCount = new Set(composition.map((module) => module.source)).size;
  const activeDependencies =
    data?.modules.find((module) => module.candidateId === activeModule?.id)?.requiredBy ?? [];
  function moduleIcon(module: StudioVisualModule) {
    return (
      <span className={`${s.mi} ${s[module.tone] ?? s.v}`}>
        <Icon name={module.candidate?.kind === 'schema' ? 'braces' : 'box'} size={15} />
      </span>
    );
  }
  return (
    <main aria-label="Studio composition" className={`${shared.surface} ${s.app}`}>
      <SchemaToolbarSlot>
        <div className={s.tool} role="toolbar" aria-label="Studio controls">
          {navigation}
          <label className={s.ws}>
            <Icon name="layers" size={15} />
            <span>{workspaceTitle}</span>
            <Icon name="down" size={12} />
            <select
              aria-label="Target Workspace"
              value={workspaceId}
              onChange={(event) => onWorkspace?.(event.target.value)}
              disabled={!onWorkspace}
            >
              {!workspaces.some((item) => item.id === workspaceId) && workspaces.length > 0 ? (
                <option value={workspaceId}>Workspace unavailable</option>
              ) : null}
              {workspaces.length ? (
                workspaces.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))
              ) : (
                <option value="">No draft workspace</option>
              )}
            </select>
          </label>
          {branch ? (
            <span className={s.branch} title={branch}>
              <GitBranch size={14} />
              {branch}
            </span>
          ) : null}
          <div className={s.toolbarActions}>
            {sourceHref ? (
              <Link href={sourceHref} className={s.navLink}>
                Back to source
              </Link>
            ) : null}
            <Link href={browseHref} className={s.navLink}>
              Browse schemas <ArrowUpRight size={13} />
            </Link>
            {workspaceHref ? (
              <Link href={workspaceHref} className={s.navLink}>
                Open Workspace <ArrowUpRight size={13} />
              </Link>
            ) : null}
            <button
              type="button"
              className={`${shared.btn} ${s.b2}`}
              aria-label="Manage sources"
              onClick={onAdd}
              disabled={!onAdd || contextLocked}
            >
              <Icon name="plus" />
              Manage sources
            </button>
            <Button
              variant="commit"
              size="sm"
              aria-label="Review Schema changes"
              disabled={!canReview}
              onClick={onReview}
            >
              Review Schema changes
            </Button>
          </div>
        </div>
      </SchemaToolbarSlot>
      <div className={s.viewToolbar} role="toolbar" aria-label="Schema views and inspection">
        <div className={s.seg} role="tablist" aria-label="Studio view">
          {(dataEditor
            ? (['data', 'visual', 'structure', 'yaml'] as const)
            : (['structure', 'yaml'] as const)
          ).map((view) => (
            <button
              type="button"
              disabled={editorInvalid}
              role="tab"
              aria-selected={mode === view}
              className={mode === view ? s.on : ''}
              onClick={() => setMode(view)}
              key={view}
            >
              <Icon name={view === 'structure' ? 'layers' : 'braces'} size={13} />
              {view === 'data'
                ? 'Fields'
                : view === 'visual'
                  ? 'Visual'
                  : view === 'structure'
                    ? 'Composition'
                    : 'YAML'}
            </button>
          ))}
        </div>
        {draftStatus ? <span className={s.draftStatus}>{draftStatus}</span> : null}
        <fieldset className={s.panelControls} aria-label="Schema inspection">
          {!editing ? (
            <button
              type="button"
              aria-pressed={detailsOpen && panel === 'Inspector'}
              onClick={() => setPanel(panel === 'Inspector' ? null : 'Inspector')}
            >
              Module details
            </button>
          ) : null}
          <button
            type="button"
            disabled={editorInvalid}
            aria-pressed={detailsOpen && panel === 'Checks'}
            onClick={() => {
              setPanel(panel === 'Checks' ? null : 'Checks');
              if (panel !== 'Checks') onCheck?.();
            }}
          >
            Schema checks
          </button>
          <button
            type="button"
            disabled={editorInvalid}
            aria-pressed={detailsOpen && panel === 'Changes'}
            onClick={() => setPanel(panel === 'Changes' ? null : 'Changes')}
          >
            Definition changes
          </button>
        </fieldset>
      </div>
      <div
        className={s.body}
        data-mode={editing ? 'data' : mode}
        data-panel={detailsOpen ? 'open' : 'closed'}
      >
        <aside aria-label="Studio sources" className={s.col} hidden={editing}>
          <div className={s.ch}>
            <b>Sources</b>
            <span className={s.n}>{modules.length}</span>
            <div className={shared.grow} />
            <button
              type="button"
              className={s.ib2}
              aria-label="Search sources"
              onClick={() => setSearching(!searching)}
            >
              <Icon name="search" />
            </button>
            <Link className={s.ib2} href={browseHref} aria-label="Browse schemas">
              <Icon name="plus" />
            </Link>
          </div>
          <p className={s.compositionSummary}>
            {composition.length} selected · {sourceCount} source projects
          </p>
          {searching ? (
            <input
              className={s.sourceSearch}
              aria-label="Filter sources"
              placeholder="Search sources…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          ) : null}
          <div className={s.sourceScroll}>
            {loading ? <output className={s.feedback}>Loading candidates…</output> : null}
            {error ? (
              <p role="alert" className={s.feedback}>
                {error}
              </p>
            ) : null}
            {!loading && !error && !modules.length ? (
              <div className={s['empty-src']}>
                <span className={s.ic0}>
                  <Icon name="box" size={18} />
                </span>
                <b>No candidates yet</b>
                <p>Schemas you pick in Browse show up here, ready to add to the structure.</p>
                <Link className={shared.btn} href={browseHref}>
                  <Icon name="grid" size={13} />
                  Browse schemas
                </Link>
              </div>
            ) : null}
            {modules.length ? <div className={s['sub-t']}>AVAILABLE MODULES</div> : null}
            {modules
              .filter((module) =>
                `${module.title} ${module.source}`.toLowerCase().includes(query.toLowerCase())
              )
              .map((module) => (
                <div
                  key={module.id}
                  className={`${s.sg} ${activeModule?.id === module.id ? s.hov : ''}`}
                >
                  {moduleIcon(module)}
                  <button
                    type="button"
                    className={s.sourceIdentity}
                    onClick={() => {
                      onSelect?.(module.id);
                      setPanel('Inspector');
                    }}
                  >
                    <span className={s.nm}>{module.title}</span>
                    <span className={s.by}>
                      {module.source} · {module.candidate?.source?.version ?? 'Preview'}
                    </span>
                  </button>
                  <label className={s.add}>
                    <input
                      type="checkbox"
                      aria-label={
                        module.candidate
                          ? `Select ${module.title} ${module.candidate.source?.version ?? ''}`
                          : module.title
                      }
                      checked={module.checked}
                      disabled={
                        !module.candidate ||
                        !module.candidate.available ||
                        pending ||
                        locked.has(module.id)
                      }
                      onChange={() => onChoose?.(module)}
                    />
                    <Icon name={module.checked ? 'check' : 'plus'} size={14} />
                  </label>
                  {module.candidate ? (
                    <button
                      type="button"
                      className={s.remove}
                      aria-label={`Remove ${module.title}`}
                      disabled={pending || locked.has(module.id)}
                      onClick={() => onRemove?.(module.id)}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  ) : null}
                </div>
              ))}
            {composition.length && onClear ? (
              <button type="button" className={s.clear} onClick={onClear}>
                Clear selection
              </button>
            ) : null}
          </div>
        </aside>
        <section
          aria-label={editing ? 'Schema definition' : 'Composed structure'}
          className={s.canvas}
        >
          {dataEditor ? (
            <div className={s.dataEditor} hidden={!editing}>
              {dataEditor(mode === 'visual' ? 'visual' : 'data')}
            </div>
          ) : null}
          {editing ? null : mode === 'yaml' ? (
            <pre className={s.yaml}>{yaml}</pre>
          ) : composition.length ? (
            <div className={s.canvasScroll}>
              <div
                className={s.nodeStage}
                style={{
                  minHeight: Math.max(520, Math.ceil(composition.length / 2) * 180 + 180),
                  transform: `scale(${zoom})`,
                }}
              >
                {composition.map((module, index) => (
                  <button
                    type="button"
                    key={module.id}
                    onClick={() => {
                      onSelect?.(module.id);
                      setPanel('Inspector');
                    }}
                    className={`${s.node} ${activeModule?.id === module.id ? s.sel : ''}`}
                    style={{
                      left: index % 2 ? 'calc(100% - 264px)' : '28px',
                      top: 110 + Math.floor(index / 2) * 180 + (index % 2 ? 60 : 0),
                    }}
                  >
                    <span className={s.h}>
                      {moduleIcon(module)}
                      <span className={s.nodeIdentity}>
                        <span className={s.nm}>{module.title}</span>
                        <span className={s.pth}>
                          {module.candidate?.source?.canonicalName ?? module.source}
                        </span>
                      </span>
                      <span className={s.ver}>{module.candidate?.source?.version ?? '—'}</span>
                    </span>
                    <span className={s.ft}>
                      <span>
                        <Icon name="braces" size={12} />
                        {module.candidate?.kind ?? 'Module'}
                      </span>
                      <span>{module.source}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <StudioEmptyCanvas browseHref={browseHref} onAdd={onAdd} />
          )}
          <div className={s.float} hidden={editing}>
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))}
              disabled={mode === 'yaml'}
            >
              −
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))}
              disabled={mode === 'yaml'}
            >
              +
            </button>
            <span className={s.sp} />
            <button type="button" aria-label="Fit view" onClick={() => setZoom(1)}>
              ⤢
            </button>
            <span className={s.sp} />
            <button
              type="button"
              aria-label="Download definition"
              onClick={onDownload}
              disabled={!data?.schema || !onDownload}
            >
              <Icon name="download" />
            </button>
          </div>
        </section>
        <aside
          aria-label={
            panel === 'Checks'
              ? 'Schema checks'
              : panel === 'Changes'
                ? 'Definition changes'
                : 'Module details'
          }
          className={s.insp}
          hidden={!detailsOpen}
        >
          <div className={s.panelHeading}>
            <h2>
              {panel === 'Checks'
                ? 'Schema checks'
                : panel === 'Changes'
                  ? 'Definition changes'
                  : 'Module details'}
            </h2>
            <button
              type="button"
              aria-label="Close inspection panel"
              onClick={() => setPanel(null)}
            >
              <X size={16} />
            </button>
          </div>
          <div className={s.inspectorScroll}>
            {panel === 'Inspector' ? (
              <>
                {!activeModule ? (
                  <div className={s.nosel}>
                    <b>No module selected</b>Select a module on the canvas to inspect its
                    definition.
                  </div>
                ) : null}
                <div className={s.sec}>
                  <div className={s['sec-h']}>SOURCE</div>
                  <div className={s.kv}>
                    <span className={s.k}>Project</span>
                    <span className={`${s.v} ${s.fill}`}>{activeModule?.source ?? '—'}</span>
                    <span className={s.k}>Module</span>
                    <span className={`${s.v} ${s.fill}`}>{activeModule?.title ?? '—'}</span>
                    <span className={s.k}>Version</span>
                    <span className={`${s.v} ${s.mono2}`}>
                      {activeModule?.candidate?.source?.version ?? '—'}
                    </span>
                    <span className={s.k}>Commit</span>
                    <span
                      className={`${s.v} ${s.mono2}`}
                      title={activeModule?.candidate?.source?.hash}
                    >
                      {activeModule?.candidate?.source?.hash?.slice(0, 19) ?? 'No source selected'}
                    </span>
                  </div>
                  <Link className={s.sourceLink} href={browseHref}>
                    Browse source releases
                    <Icon name="arrowr" size={12} />
                  </Link>
                </div>
                <div className={s.sec}>
                  <div className={s['sec-h']}>MODULE SETTINGS</div>
                  <p className={s.explanation}>
                    {activeModule
                      ? 'Open the Workspace workbench to add local changes above the selected sources.'
                      : 'Select a candidate to inspect its definition.'}
                  </p>
                  <div className={s.moduleActions}>
                    {activeModule && onEditDefinition ? (
                      <button type="button" className={shared.btn} onClick={onEditDefinition}>
                        Edit definition
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={shared.btn}
                      onClick={() => {
                        setPanel('Checks');
                        onCheck?.();
                      }}
                      disabled={!composition.length || pending || !onCheck}
                    >
                      <Icon name="shield" />
                      Check schema
                    </button>
                  </div>
                </div>
                <div className={s.sec}>
                  <div className={s['sec-h']}>
                    REQUIRED BY
                    <span className={shared.grow} />
                    {activeDependencies.length}
                  </div>
                  {activeDependencies.length ? (
                    activeDependencies.map((name) => (
                      <div className={s.dep} key={name}>
                        <Icon name="layers" />
                        {name}
                      </div>
                    ))
                  ) : (
                    <p className={s.explanation}>
                      {activeModule
                        ? 'No required dependents in this preview.'
                        : 'Select a module to inspect dependencies.'}
                    </p>
                  )}
                </div>
                {!workspaces.length ? (
                  <p className={s.explanation}>
                    Create a Workspace to review and adopt this definition.
                  </p>
                ) : null}
              </>
            ) : panel === 'Checks' ? (
              <>
                <div className={s.sec}>
                  <div className={s['sec-h']}>SCHEMA CHECKS</div>
                  <p>
                    {data
                      ? data.report.valid &&
                        data.adoption.allowed &&
                        data.impact?.canAdopt !== false
                        ? 'All blocking checks passed'
                        : 'Changes require attention'
                      : 'Not run'}
                  </p>
                </div>
                {(data?.report.layers ?? []).map((layer) => (
                  <div className={s.sec} key={layer.id}>
                    <div className={s['sec-h']}>
                      {layer.label}
                      <span className={shared.grow} />
                      <span className={layer.status === 'passed' ? shared.ok : shared.warn}>
                        {layer.status === 'not_run'
                          ? 'Not run'
                          : layer.status === 'passed'
                            ? 'Passed'
                            : layer.status === 'warning'
                              ? 'Warning'
                              : 'Failed'}
                      </span>
                    </div>
                    {layer.summary ? <p className={s.explanation}>{layer.summary}</p> : null}
                    {layer.issues.map((issue, index) => (
                      <p className={s.issue} key={`${layer.id}-${issue.code}-${index}`}>
                        {issue.message}
                      </p>
                    ))}
                  </div>
                ))}
              </>
            ) : (
              <div className={s.sec}>
                <div className={s['sec-h']}>DEFINITION CHANGES</div>
                <StudioChanges changes={data?.workspace?.changes ?? []} />
                <div className={s['sec-h']}>CONTENT IMPACT</div>
                <StudioImpactPreview impact={data?.impact ?? null} />
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
export function StudioEmptyCanvas({
  browseHref,
  onAdd,
}: {
  browseHref: string;
  onAdd?: () => void;
}) {
  return (
    <div className={s.hint}>
      <div className={s.in}>
        <div className={s.dia} aria-hidden="true">
          <svg aria-hidden="true" viewBox="0 0 260 112">
            <path
              d="M96 36 C 130 36, 130 76, 164 76"
              fill="none"
              stroke="var(--stroke-default)"
              strokeWidth="1.5"
              strokeDasharray="3 4"
            />
          </svg>
          <div className={s.bx} style={{ left: 0, top: 14 }}>
            <i />
            <u />
          </div>
          <div className={s.bx} style={{ left: 0, top: 66, opacity: 0.6 }}>
            <i />
            <u />
          </div>
          <div className={`${s.bx} ${s.dash}`} style={{ left: 164, top: 54 }}>
            <span style={{ margin: 'auto' }}>+</span>
          </div>
        </div>
        <h3>Compose your structure</h3>
        <p>
          Add a module from Browse, then select it to shape its exact definition and connect it to
          the others.
        </p>
        <div className={`${shared.row} ${s.emptyActions}`}>
          <Link className={`${shared.btn} ${s.b2} ${s.dark}`} href={browseHref}>
            <Icon name="grid" />
            Browse schemas
          </Link>
          {onAdd ? (
            <button type="button" className={`${shared.btn} ${s.b2}`} onClick={onAdd}>
              <Icon name="file" />
              Manage sources
            </button>
          ) : (
            <Link className={`${shared.btn} ${s.b2}`} href="/">
              Choose a project
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
