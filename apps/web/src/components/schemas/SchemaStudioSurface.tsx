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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import s from './SchemaStudioExperience.module.css';
import { SchemaToolbarSlot } from './SchemaToolbarSlot';

export function SchemaStudioSurface({
  navigation,
  dataEditor,
  editorInvalid = false,
  contextLocked = false,
  sourceHref,
  workspaceHref,
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
  onReview,
  canReview = false,
  onDownload,
}: {
  navigation?: ReactNode;
  editorInvalid?: boolean;
  dataEditor?: () => ReactNode;
  contextLocked?: boolean;
  sourceHref?: string;
  workspaceHref?: string;
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
  onReview?: () => void;
  canReview?: boolean;
  onDownload?: () => void;
}) {
  const [yamlOpen, setYamlOpen] = useState(false);
  const yaml = useMemo(
    () => (data?.schema ? dump(data.schema, { noRefs: true, lineWidth: 100 }) : ''),
    [data?.schema]
  );

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
                <DropdownMenuItem onSelect={() => setYamlOpen(true)}>View YAML</DropdownMenuItem>
                {workspaceHref ? (
                  <DropdownMenuItem asChild>
                    <Link href={workspaceHref}>Open Workspace</Link>
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
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
      </div>
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
