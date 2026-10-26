'use client';
import type { StudioCandidate, StudioPreview } from '@t3x-dev/api-client';
import { dump } from 'js-yaml';
import { ArrowUpRight, Box, ChevronDown, GitBranch, ListTree, Network } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ReferenceIcon as Icon } from './DiscoverReference';
import s from './SchemaStudioExperience.module.css';
import { type SchemaEditorChrome, SchemaToolbarSlot } from './SchemaToolbarSlot';

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
  onAdd,
  onEditDefinition,
  onReview,
  canReview = false,
  onDownload,
  onClear,
}: {
  navigation?: ReactNode;
  editorInvalid?: boolean;
  dataEditor?: (view: 'data' | 'visual', chrome: SchemaEditorChrome) => ReactNode;
  contextLocked?: boolean;
  browseHref: string;
  sourceHref?: string;
  workspaceHref?: string;
  branch?: string;
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
  onAdd?: () => void;
  onEditDefinition?: () => void;
  onReview?: () => void;
  canReview?: boolean;
  onDownload?: () => void;
  onClear?: () => void;
}) {
  const [mode, setMode] = useState<'data' | 'visual'>('data');
  const [statusTarget, setStatusTarget] = useState<HTMLDivElement | null>(null);
  const [menuTarget, setMenuTarget] = useState<HTMLDivElement | null>(null);
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
          <div className={s.toolbarActions}>
            <div ref={setStatusTarget} className={s.toolbarActions} />
            <Button
              variant="commit"
              size="sm"
              aria-label="Review changes"
              disabled={!canReview || editorInvalid}
              onClick={onReview}
            >
              Review changes
            </Button>
            {data?.report.issues.filter((issue) => issue.blocking).length ? (
              <span className={s.draftStatus}>
                {data.report.issues.filter((issue) => issue.blocking).length} blocking issues
              </span>
            ) : null}
            <div ref={setMenuTarget} />
          </div>
        </div>
      </SchemaToolbarSlot>
      {loading ? <output className={s.feedback}>Loading candidates…</output> : null}
      {error ? (
        <p role="alert" className={s.feedback}>
          {error}
        </p>
      ) : null}
      <div className={s.body} data-view={mode}>
        <section aria-label="Schema definition" className={s.canvas}>
          <div className={s.dataEditor}>
            {dataEditor?.(mode, {
              statusTarget,
              menuTarget,
              viewControls: (
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
                      {view === 'data' ? (
                        <ListTree aria-hidden="true" />
                      ) : (
                        <Network aria-hidden="true" />
                      )}
                      {view === 'data' ? 'Fields' : 'Visual'}
                    </button>
                  ))}
                </div>
              ),
              navigationActions: (
                <>
                  <DropdownMenuSeparator />
                  {bindingStatus ? <DropdownMenuLabel>{bindingStatus}</DropdownMenuLabel> : null}
                  {sourceHref ? (
                    <DropdownMenuItem asChild>
                      <Link href={sourceHref}>Back to source</Link>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem asChild>
                    <Link href={browseHref}>
                      Browse schemas <ArrowUpRight size={13} />
                    </Link>
                  </DropdownMenuItem>
                  {workspaceHref ? (
                    <DropdownMenuItem asChild>
                      <Link href={workspaceHref}>
                        Open Workspace <ArrowUpRight size={13} />
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                </>
              ),
            })}
          </div>
        </section>
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
              <p className={s.feedback}>Create a Workspace to apply this definition.</p>
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
