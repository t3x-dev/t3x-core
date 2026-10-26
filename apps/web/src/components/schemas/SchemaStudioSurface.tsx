'use client';
import type { StudioCandidate, StudioPreview } from '@t3x-dev/api-client';
import { dump } from 'js-yaml';
import { ArrowUpRight, Box, ChevronDown, GitBranch, ListTree, Network, X } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ReferenceIcon as Icon } from './DiscoverReference';
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
  bindingStatus,
  workspaceTitle = 'No draft workspace',
  workspaceId = '',
  workspaces = [],
  onWorkspace,
  modules = [],
  composition = [],
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
  bindingStatus?: string;
  workspaceTitle?: string;
  workspaceId?: string;
  workspaces?: Array<{ id: string; title: string }>;
  onWorkspace?: (id: string) => void;
  modules?: StudioVisualModule[];
  composition?: StudioVisualModule[];
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
  const [mode, setMode] = useState<'data' | 'visual'>('data');
  const [panel, setPanel] = useState<'Checks' | 'Changes' | null>(null);
  const [query, setQuery] = useState('');
  const yaml = useMemo(
    () => (data?.schema ? dump(data.schema, { noRefs: true, lineWidth: 100 }) : ''),
    [data?.schema]
  );
  const visibleModules = modules.filter((module) =>
    `${module.title} ${module.source}`.toLowerCase().includes(query.toLowerCase())
  );
  function moduleIcon(module: StudioVisualModule) {
    return (
      <span className={s.mi}>
        <Icon name={module.candidate?.kind === 'schema' ? 'braces' : 'box'} size={15} />
      </span>
    );
  }
  return (
    <main aria-label="Schema editor" className={s.app}>
      <SchemaToolbarSlot>
        <div className={s.tool} role="toolbar" aria-label="Studio controls">
          {navigation}
          <label className={s.ws}>
            <Box aria-hidden="true" size={18} />
            <span>{workspaceTitle}</span>
            <ChevronDown aria-hidden="true" size={12} />
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
              <GitBranch aria-hidden="true" size={14} />
              {branch}
            </span>
          ) : null}
          <div className={s.seg} role="tablist" aria-label="Studio view">
            {(['data', 'visual'] as const).map((view) => (
              <button
                type="button"
                disabled={editorInvalid}
                role="tab"
                aria-selected={mode === view}
                onClick={() => setMode(view)}
                key={view}
              >
                {view === 'data' ? <ListTree aria-hidden="true" /> : <Network aria-hidden="true" />}
                {view === 'data' ? 'Fields' : 'Visual'}
              </button>
            ))}
          </div>
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
      <div className={s.inspectionToolbar} role="toolbar" aria-label="Schema status and inspection">
        {bindingStatus ? <p className={s.bindingStatus}>{bindingStatus}</p> : null}
        {draftStatus ? <span className={s.draftStatus}>{draftStatus}</span> : null}
        <fieldset className={s.panelControls} aria-label="Schema inspection">
          <button
            type="button"
            disabled={editorInvalid}
            aria-pressed={panel === 'Checks'}
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
            aria-pressed={panel === 'Changes'}
            onClick={() => setPanel(panel === 'Changes' ? null : 'Changes')}
          >
            Definition changes
          </button>
        </fieldset>
      </div>
      {loading ? <output className={s.feedback}>Loading candidates…</output> : null}
      {error ? (
        <p role="alert" className={s.feedback}>
          {error}
        </p>
      ) : null}
      <div className={s.body} data-panel={panel ? 'open' : 'closed'} data-view={mode}>
        <section aria-label="Schema definition" className={s.canvas}>
          <div className={s.dataEditor}>{dataEditor?.(mode)}</div>
        </section>
        <aside
          aria-label={panel === 'Checks' ? 'Schema checks' : 'Definition changes'}
          className={s.insp}
          hidden={!panel}
        >
          <div className={s.panelHeading}>
            <h2>{panel === 'Checks' ? 'Schema checks' : 'Definition changes'}</h2>
            <button
              type="button"
              aria-label="Close inspection panel"
              onClick={() => setPanel(null)}
            >
              <X size={16} />
            </button>
          </div>
          <div className={s.inspectorScroll}>
            {panel === 'Checks' ? (
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
                      <span className={s.grow} />
                      <span className={layer.status === 'passed' ? s.passed : s.warning}>
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
      <section aria-label="Schema details" className={s.details}>
        <details className={s.disclosure}>
          <summary>
            Sources <span>{composition.length} selected</span>
          </summary>
          <div className={s.disclosureContent}>
            <div className={s.sourceToolbar}>
              <input
                aria-label="Filter sources"
                placeholder="Search sources…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={onAdd}
                disabled={!onAdd || contextLocked || pending}
              >
                Manage sources
              </Button>
              <Link href={browseHref} className={s.navLink}>
                Browse source releases
              </Link>
            </div>
            <ul className={s.sourceList}>
              {visibleModules.map((module) => {
                const dependencies =
                  data?.modules.find((item) => item.candidateId === module.id)?.requiredBy ?? [];
                return (
                  <li key={module.id} className={s.sourceRow}>
                    <label className={s.sourceIdentity}>
                      <input
                        type="checkbox"
                        aria-label={
                          module.candidate
                            ? `Select ${module.title} ${module.candidate.source?.version ?? ''}`
                            : module.title
                        }
                        checked={module.checked}
                        disabled={
                          !module.candidate?.available ||
                          pending ||
                          contextLocked ||
                          locked.has(module.id)
                        }
                        onChange={() => onChoose?.(module)}
                      />
                      {moduleIcon(module)}
                      <span>
                        <b>{module.title}</b>
                        <small>
                          {module.candidate?.source?.canonicalName ?? module.source} ·{' '}
                          {module.candidate?.source?.version ?? 'Unavailable'}
                        </small>
                      </span>
                    </label>
                    <div className={s.sourceMetadata}>
                      <code>{module.candidate?.source?.hash ?? 'Hash unavailable'}</code>
                      {dependencies.length ? (
                        <span>Required by {dependencies.join(', ')}</span>
                      ) : null}
                    </div>
                    {module.candidate ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${module.title}`}
                        disabled={pending || contextLocked || locked.has(module.id)}
                        onClick={() => onRemove?.(module.id)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {!loading && !error && !modules.length ? (
              <p className={s.feedback}>
                No sources yet. Browse schemas to add a definition or module.
              </p>
            ) : modules.length && !visibleModules.length ? (
              <p className={s.feedback}>No sources match this search.</p>
            ) : null}
            {composition.length && onClear ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending || contextLocked}
                onClick={onClear}
              >
                Clear selection
              </Button>
            ) : null}
            {!workspaces.length ? (
              <p className={s.feedback}>Create a Workspace to review and adopt this definition.</p>
            ) : null}
          </div>
        </details>
        <details className={s.disclosure}>
          <summary>
            YAML <span>Candidate definition</span>
          </summary>
          <div className={s.disclosureContent}>
            <div className={s.sourceToolbar}>
              <p className={s.feedback}>Read-only preview of the current Schema candidate.</p>
              {onEditDefinition ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEditDefinition}
                  disabled={contextLocked || pending}
                >
                  Edit definition
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={onDownload}
                disabled={!yaml || !onDownload || pending || editorInvalid}
              >
                Download YAML
              </Button>
            </div>
            {pending ? <output className={s.feedback}>Updating definition preview…</output> : null}
            {editorInvalid ? (
              <p className={s.feedback}>Fix the field errors to update this preview.</p>
            ) : null}
            {yaml ? (
              <pre className={s.yaml}>
                <code>{yaml}</code>
              </pre>
            ) : (
              <p className={s.feedback}>
                No definition to preview yet. Choose sources to get started.
              </p>
            )}
          </div>
        </details>
      </section>
    </main>
  );
}
