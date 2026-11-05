'use client';
import type { StudioPreview } from '@t3x-dev/api-client';
import { ArrowUpRight, ChevronDown, Shapes } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
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
  canEditDefinition = false,
  contextLocked = false,
  sourceHref,
  branchControl,
  draftStatus,
  pending = false,
  loading = false,
  error,
  data,
  onEditDefinition,
  onPublish,
  publishBlocker,
  onReview,
  onSave,
  canSave = false,
  onInspect,
  canReview = false,
  hasUnsavedChanges = false,
  onUndo,
  canUndo = false,
  onRules,
  canOpenRules = false,
  onDiscard,
  canDiscard = false,
  onDiscardSaved,
  canDiscardSaved = false,
}: {
  navigation?: ReactNode;
  hidden?: boolean;
  editorInvalid?: boolean;
  canEditDefinition?: boolean;
  dataEditor?: () => ReactNode;
  contextLocked?: boolean;
  sourceHref?: string;
  branchControl?: ReactNode;
  draftStatus?: string;
  pending?: boolean;
  loading?: boolean;
  error?: string;
  data?: StudioPreview;
  onEditDefinition?: () => void;
  onPublish?: () => void;
  publishBlocker?: string;
  onReview?: () => void;
  onSave?: () => void;
  canSave?: boolean;
  onInspect?: () => void;
  canReview?: boolean;
  hasUnsavedChanges?: boolean;
  onUndo?: () => void;
  canUndo?: boolean;
  onRules?: () => void;
  canOpenRules?: boolean;
  onDiscard?: () => void;
  canDiscard?: boolean;
  onDiscardSaved?: () => void;
  canDiscardSaved?: boolean;
}) {
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
            <div className={s.heading}>
              <span className={s.schemaIcon}>
                <Shapes size={18} aria-hidden="true" />
              </span>
              <div className={s.headingContent}>
                <h1>Schema</h1>
                <div className={s.workspaceContext}>
                  {branchControl}
                  {draftStatus ? <output className={s.draftStatus}>{draftStatus}</output> : null}
                </div>
              </div>
            </div>
            <div className={s.toolbarActions}>
              <fieldset aria-label="Schema save and review" className={s.saveGroup}>
                {onUndo || onDiscard || onDiscardSaved ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="canvas-outline"
                        size="sm"
                        aria-label="Undo and discard"
                        disabled={!canUndo && !canDiscard && !canDiscardSaved}
                      >
                        Undo <ChevronDown size={14} aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {onUndo ? (
                        <DropdownMenuItem disabled={!canUndo} onSelect={onUndo}>
                          Undo last change
                        </DropdownMenuItem>
                      ) : null}
                      {onUndo && onDiscard ? <DropdownMenuSeparator /> : null}
                      {onDiscard ? (
                        <DropdownMenuItem disabled={!canDiscard} onSelect={onDiscard}>
                          Discard all unsaved changes
                        </DropdownMenuItem>
                      ) : null}
                      {onDiscardSaved ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem disabled={!canDiscardSaved} onSelect={onDiscardSaved}>
                            Discard saved Schema draft…
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
                <Button variant="canvas-outline" size="sm" disabled={!canSave} onClick={onSave}>
                  Save draft
                </Button>
                <Button
                  variant="commit"
                  className={s.reviewButton}
                  size="sm"
                  aria-label={hasUnsavedChanges ? 'Save and review' : 'Review changes'}
                  disabled={!canReview}
                  onClick={onReview}
                >
                  {hasUnsavedChanges ? 'Save and review' : 'Review changes'}
                  <ArrowUpRight size={14} aria-hidden="true" />
                </Button>
              </fieldset>
              {sourceHref ? (
                <Link href={sourceHref} className={s.navLink}>
                  Back to source <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="canvas-outline" size="sm" aria-label="Schema actions">
                    More <ChevronDown size={14} aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onRules ? (
                    <DropdownMenuItem disabled={!canOpenRules} onSelect={onRules}>
                      Relationships & rules…
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem disabled={!canEditDefinition} onSelect={onEditDefinition}>
                    Edit YAML…{editorInvalid ? ' (fix field errors first)' : ''}
                  </DropdownMenuItem>
                  {onPublish ? (
                    <>
                      <DropdownMenuItem onSelect={onPublish} disabled={!!publishBlocker}>
                        Publish to public catalog…
                      </DropdownMenuItem>
                      {publishBlocker ? (
                        <p className="px-2 py-1 text-xs text-[var(--text-secondary)]">
                          {publishBlocker}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                  {onInspect ? (
                    <DropdownMenuItem
                      onSelect={onInspect}
                      title="Open schema checks and affected content in Workspace Review."
                      disabled={!data || contextLocked || pending}
                    >
                      View checks and impact <ArrowUpRight size={14} aria-hidden="true" />
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
    </main>
  );
}
