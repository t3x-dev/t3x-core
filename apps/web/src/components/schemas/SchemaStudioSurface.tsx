'use client';
import type { StudioPreview } from '@t3x-dev/api-client';
import { dump } from 'js-yaml';
import { Box, ChevronDown, GitBranch } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import s from './SchemaStudioExperience.module.css';
import { SchemaToolbarSlot } from './SchemaToolbarSlot';

export function SchemaStudioSurface({
  navigation,
  hidden = false,
  dataEditor,
  editorInvalid = false,
  contextLocked = false,
  sourceHref,
  branch,
  draftStatus,
  bindingStatus,
  workspaceTitle = 'No draft workspace',
  workspaceId = '',
  workspaces = [],
  onWorkspace,
  pending = false,
  loading = false,
  error,
  data,
  onEditDefinition,
  onPublish,
  canPublish = false,
  onReview,
  onSave,
  canSave = false,
  onInspect,
  canReview = false,
  onDownload,
  onUndo,
  canUndo = false,
  onRules,
  canOpenRules = false,
  onDescribe,
  onDiscard,
  canDiscard = false,
  sourcesOpen = false,
  onToggleSources,
}: {
  navigation?: ReactNode;
  hidden?: boolean;
  editorInvalid?: boolean;
  dataEditor?: () => ReactNode;
  contextLocked?: boolean;
  sourceHref?: string;
  branch?: string;
  draftStatus?: string;
  bindingStatus?: string;
  workspaceTitle?: string;
  workspaceId?: string;
  workspaces?: Array<{ id: string; title: string }>;
  onWorkspace?: (id: string) => void;
  pending?: boolean;
  loading?: boolean;
  error?: string;
  data?: StudioPreview;
  onEditDefinition?: () => void;
  onPublish?: () => void;
  canPublish?: boolean;
  onReview?: () => void;
  onSave?: () => void;
  canSave?: boolean;
  onInspect?: () => void;
  canReview?: boolean;
  onDownload?: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
  onRules?: () => void;
  canOpenRules?: boolean;
  onDescribe?: () => void;
  onDiscard?: () => void;
  canDiscard?: boolean;
  sourcesOpen?: boolean;
  onToggleSources?: () => void;
}) {
  const [yamlOpen, setYamlOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const yaml = useMemo(
    () => (data?.schema ? dump(data.schema, { noRefs: true, lineWidth: 100 }) : ''),
    [data?.schema]
  );

  return (
    <main
      aria-label="Schema editor"
      className={s.app}
      style={hidden ? { display: 'none' } : undefined}
    >
      {!hidden ? (
        <SchemaToolbarSlot>
          <div
            className={s.tool}
            style={hidden ? { display: 'none' } : undefined}
            role="toolbar"
            aria-label="Studio controls"
          >
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
              <fieldset aria-label="Schema save and review" className={s.saveGroup}>
                {draftStatus ? <output className={s.draftStatus}>{draftStatus}</output> : null}
                {onUndo ? (
                  <Button variant="canvas-outline" size="sm" disabled={!canUndo} onClick={onUndo}>
                    Undo
                  </Button>
                ) : null}
                <Button variant="canvas-outline" size="sm" disabled={!canSave} onClick={onSave}>
                  Save edits
                </Button>
                <Button
                  variant="commit"
                  size="sm"
                  aria-label="Review Schema changes"
                  disabled={!canReview}
                  onClick={onReview}
                >
                  Review changes
                </Button>
              </fieldset>
              {sourceHref ? (
                <Link href={sourceHref} className={s.navLink}>
                  Back to source
                </Link>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="canvas-outline" size="sm" aria-label="Schema actions">
                    More <ChevronDown size={14} aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onToggleSources ? (
                    <DropdownMenuCheckboxItem
                      checked={sourcesOpen}
                      onCheckedChange={onToggleSources}
                    >
                      Schema sources
                    </DropdownMenuCheckboxItem>
                  ) : null}
                  {onRules ? (
                    <DropdownMenuItem disabled={!canOpenRules} onSelect={onRules}>
                      Relations & rules
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onSelect={() => setDetailsOpen(true)}>
                    Schema details
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setYamlOpen(true)}>View YAML</DropdownMenuItem>
                  {onPublish ? (
                    <DropdownMenuItem onSelect={onPublish} disabled={!canPublish}>
                      Publish public Schema…
                    </DropdownMenuItem>
                  ) : null}
                  {onInspect ? (
                    <DropdownMenuItem
                      onSelect={onInspect}
                      disabled={!data || contextLocked || pending}
                    >
                      Schema checks & impact
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  {onDescribe ? (
                    <DropdownMenuItem onSelect={onDescribe}>Describe changes…</DropdownMenuItem>
                  ) : null}
                  {onDiscard ? (
                    <DropdownMenuItem disabled={!canDiscard} onSelect={onDiscard}>
                      Discard changes
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </SchemaToolbarSlot>
      ) : null}
      {loading ? <output className={s.feedback}>Loading candidates…</output> : null}
      {error ? (
        <p role="alert" className={s.feedback}>
          {error}
        </p>
      ) : null}
      <div className={s.body}>
        <section aria-label="Schema definition" className={s.canvas}>
          <div className={s.dataEditor}>{dataEditor?.()}</div>
        </section>
      </div>
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Schema details</DialogTitle>
            <DialogDescription>Identity of the current Schema candidate.</DialogDescription>
          </DialogHeader>
          <p className="break-all text-xs text-[var(--text-secondary)]">
            {bindingStatus || 'No Schema selected.'}
          </p>
          {data ? (
            <dl className="space-y-2 text-xs">
              <dt>Definition hash</dt>
              <dd className="break-all font-mono">{data.schemaHash}</dd>
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={yamlOpen} onOpenChange={setYamlOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Schema YAML</DialogTitle>
            <DialogDescription>
              View or download the current candidate definition.
            </DialogDescription>
          </DialogHeader>
          <div className={s.sourceToolbar}>
            <p className={s.feedback}>Read-only preview of the current Schema candidate.</p>
            {onEditDefinition ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setYamlOpen(false);
                  onEditDefinition?.();
                }}
                disabled={contextLocked || pending}
              >
                Edit YAML
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
        </DialogContent>
      </Dialog>
    </main>
  );
}
