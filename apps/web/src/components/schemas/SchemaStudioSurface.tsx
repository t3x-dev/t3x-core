'use client';
import type { StudioCandidate, StudioPreview } from '@t3x-dev/api-client';
import { dump } from 'js-yaml';
import Link from 'next/link';
import { type ReactNode, useMemo, useState } from 'react';
import { ReferenceIcon as Icon } from './DiscoverReference';
import shared from './ExploreDiscoverySurface.module.css';
import s from './SchemaStudioExperience.module.css';
import { SchemaToolbarSlot } from './SchemaToolbarSlot';
import { StudioChanges } from './StudioDefinitionPreview';

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
  browseHref,
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
  onReview,
  canReview = false,
  onDownload,
  onClear,
}: {
  navigation?: ReactNode;
  browseHref: string;
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
  onReview?: () => void;
  canReview?: boolean;
  onDownload?: () => void;
  onClear?: () => void;
}) {
  const [mode, setMode] = useState<'structure' | 'yaml'>('structure');
  const [panel, setPanel] = useState<'Inspector' | 'Checks' | 'Changes'>('Inspector');
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
          <span className={s.separator} />
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
          <span className={`${shared.pill} ${shared.orange}`}>Draft</span>
          <div className={shared.grow} />
          <div className={s.meta}>
            <span>{composition.length} modules</span>
            <span className={s.d} />
            <span>{sourceCount} source projects</span>
            {data ? (
              <>
                <span className={s.d} />
                <span className={data.report.valid ? shared.ok : shared.warn}>
                  {data.report.valid ? 'Schema valid' : 'Check issues'}
                </span>
              </>
            ) : null}
          </div>
          <button
            className={`${shared.btn} ${s.b2}`}
            aria-label="Advanced definition workbench"
            onClick={onAdd}
            disabled={!onAdd}
          >
            <Icon name="plus" />
            Add modules
          </button>
          <button
            className={`${shared.btn} ${shared.primary} ${s.b2}`}
            aria-label="Review & apply"
            disabled={!canReview}
            onClick={onReview}
          >
            Review changes
          </button>
          <button
            className={`${shared.btn} ${s.b2}`}
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
      </SchemaToolbarSlot>
      <div className={s.body}>
        <aside aria-label="Studio sources" className={s.col}>
          <div className={s.ch}>
            <b>Sources</b>
            <span className={s.n}>{modules.length}</span>
            <div className={shared.grow} />
            <button
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
                  <button className={s.sourceIdentity} onClick={() => onSelect?.(module.id)}>
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
              <button className={s.clear} onClick={onClear}>
                Clear selection
              </button>
            ) : null}
          </div>
        </aside>
        <section aria-label="Composed structure" className={s.canvas}>
          <div className={s.ctop}>
            <div className={s.seg} role="tablist" aria-label="Studio view">
              {(['structure', 'yaml'] as const).map((view) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === view}
                  className={mode === view ? s.on : ''}
                  onClick={() => setMode(view)}
                  key={view}
                >
                  <Icon name={view === 'structure' ? 'layers' : 'braces'} size={13} />
                  {view === 'structure' ? 'Structure' : 'YAML'}
                </button>
              ))}
            </div>
          </div>
          {mode === 'yaml' ? (
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
                    key={module.id}
                    type="button"
                    onClick={() => onSelect?.(module.id)}
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
          <div className={s.float}>
            <button
              aria-label="Zoom out"
              onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))}
              disabled={mode === 'yaml'}
            >
              −
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              aria-label="Zoom in"
              onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))}
              disabled={mode === 'yaml'}
            >
              +
            </button>
            <span className={s.sp} />
            <button aria-label="Fit view" onClick={() => setZoom(1)}>
              ⤢
            </button>
            <span className={s.sp} />
            <button
              aria-label="Download definition"
              onClick={onDownload}
              disabled={!data?.schema || !onDownload}
            >
              <Icon name="download" />
            </button>
          </div>
        </section>
        <aside aria-label="Module details" className={s.insp}>
          <div className={s.seg} role="tablist" aria-label="Module panel">
            {(['Inspector', 'Checks', 'Changes'] as const).map((tab) => (
              <button
                role="tab"
                aria-selected={panel === tab}
                className={panel === tab ? s.on : ''}
                onClick={() => setPanel(tab)}
                key={tab}
              >
                {tab}
              </button>
            ))}
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
                      ? 'Open the module workbench to edit its exact definition.'
                      : 'Select a candidate to inspect its definition.'}
                  </p>
                  {activeModule && onAdd ? (
                    <button className={shared.btn} onClick={onAdd}>
                      Edit definition
                    </button>
                  ) : null}
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
                    Create a Workspace to review and apply this definition.
                  </p>
                ) : null}
              </>
            ) : panel === 'Checks' ? (
              <div className={s.sec}>
                <div className={s['sec-h']}>SCHEMA CHECKS</div>
                <p>
                  {data
                    ? data.report.valid
                      ? 'Schema valid'
                      : 'Changes require attention'
                    : 'Not run'}
                </p>
                {data?.report.issues.map((issue, index) => (
                  <p className={s.issue} key={`${issue.code}-${index}`}>
                    {issue.message}
                  </p>
                ))}
              </div>
            ) : (
              <div className={s.sec}>
                <div className={s['sec-h']}>WORKSPACE CHANGES</div>
                <StudioChanges changes={data?.workspace?.changes ?? []} />
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
          <svg viewBox="0 0 260 112">
            <path
              d="M96 36 C 130 36, 130 76, 164 76"
              fill="none"
              stroke="#cdd1da"
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
            <button className={`${shared.btn} ${s.b2}`} onClick={onAdd}>
              <Icon name="file" />
              Start from template
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
