'use client';
import type { StudioPreview } from '@t3x-dev/api-client';
import { ArrowUpRight, Braces, ChevronDown, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useId } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import s from './SchemaStudioExperience.module.css';
import { SchemaToolbarSlot } from './SchemaToolbarSlot';

export function SchemaStudioSurface({
  navigation,
  hidden = false,
  dataEditor,
  editorInvalid = false,
  onLocateError,
  canEditDefinition = false,
  contextLocked = false,
  sourceHref,
  branchControl,
  draftStatus,
  saveStatus,
  pending = false,
  loading = false,
  data,
  onEditDefinition,
  onCompose,
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
  onLocateError?: () => void;
  canEditDefinition?: boolean;
  dataEditor?: () => ReactNode;
  contextLocked?: boolean;
  sourceHref?: string;
  branchControl?: ReactNode;
  draftStatus?: string;
  saveStatus?: string;
  pending?: boolean;
  loading?: boolean;
  data?: StudioPreview;
  onEditDefinition?: () => void;
  onCompose?: () => void;
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
  const fieldHint = useId();
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
                <Braces size={18} aria-hidden="true" />
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
              <fieldset className={s.editingTools} aria-label="Schema editing tools">
                {onUndo ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Undo last change"
                    disabled={!canUndo}
                    onClick={onUndo}
                  >
                    <Undo2 size={14} aria-hidden="true" /> Undo
                  </Button>
                ) : null}
                {saveStatus ? <output className={s.draftStatus}>{saveStatus}</output> : null}
                {editorInvalid && onLocateError ? (
                  <Button variant="ghost" size="sm" onClick={onLocateError}>
                    Find field error
                  </Button>
                ) : null}
              </fieldset>
              <fieldset aria-label="Schema next steps" className={s.saveGroup}>
                <Button
                  variant="canvas-outline"
                  size="sm"
                  disabled={!onCompose || pending}
                  onClick={onCompose}
                >
                  Continue in Compose <ArrowUpRight size={14} aria-hidden="true" />
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex" tabIndex={editorInvalid ? 0 : undefined}>
                      <Button
                        variant="commit"
                        className={s.reviewButton}
                        size="sm"
                        aria-label={
                          hasUnsavedChanges ? 'Save and review in Workspace' : 'Review in Workspace'
                        }
                        disabled={!canReview}
                        onClick={onReview}
                      >
                        {hasUnsavedChanges ? 'Save and review in Workspace' : 'Review in Workspace'}
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {editorInvalid ? (
                    <TooltipContent>Fix the highlighted fields before review.</TooltipContent>
                  ) : null}
                </Tooltip>
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
                <DropdownMenuContent align="end" className={s.moreMenu}>
                  <DropdownMenuItem
                    aria-describedby={editorInvalid ? fieldHint : undefined}
                    disabled={!canEditDefinition}
                    onSelect={onEditDefinition}
                  >
                    View draft YAML
                  </DropdownMenuItem>
                  {editorInvalid ? (
                    <p id={fieldHint} className={s.menuHint}>
                      Fix field errors before opening YAML.
                    </p>
                  ) : null}
                  <DropdownMenuItem disabled={!canSave} onSelect={onSave}>
                    Save now
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {onRules ? (
                    <DropdownMenuGroup aria-label="Schema settings">
                      <DropdownMenuLabel className={s.menuLabel}>Schema settings</DropdownMenuLabel>
                      <DropdownMenuItem disabled={!canOpenRules} onSelect={onRules}>
                        Relationships & rules…
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  ) : null}
                  {onInspect || onPublish ? (
                    <>
                      {onRules ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuGroup aria-label="Check and publish">
                        <DropdownMenuLabel className={s.menuLabel}>
                          Check & publish
                        </DropdownMenuLabel>
                        {onInspect ? (
                          <DropdownMenuItem
                            onSelect={onInspect}
                            title="Open schema checks and affected content in Workspace Review."
                            disabled={!data || contextLocked || pending}
                          >
                            View checks and impact <ArrowUpRight size={14} aria-hidden="true" />
                          </DropdownMenuItem>
                        ) : null}
                        {onPublish ? (
                          <>
                            <DropdownMenuItem onSelect={onPublish} disabled={!!publishBlocker}>
                              Publish to public catalog…
                            </DropdownMenuItem>
                            {publishBlocker ? <p className={s.menuHint}>{publishBlocker}</p> : null}
                          </>
                        ) : null}
                      </DropdownMenuGroup>
                    </>
                  ) : null}
                  {onDiscard || onDiscardSaved ? (
                    <>
                      {onRules || onInspect || onPublish ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuGroup aria-label="Discard changes">
                        <DropdownMenuLabel className={s.menuLabel}>
                          Discard changes
                        </DropdownMenuLabel>
                        {onDiscard ? (
                          <DropdownMenuItem
                            className={s.destructiveAction}
                            disabled={!canDiscard}
                            onSelect={onDiscard}
                          >
                            Discard all unsaved changes
                          </DropdownMenuItem>
                        ) : null}
                        {onDiscardSaved ? (
                          <DropdownMenuItem
                            className={s.destructiveAction}
                            disabled={!canDiscardSaved}
                            onSelect={onDiscardSaved}
                          >
                            Discard saved Schema draft…
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuGroup>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </SchemaToolbarSlot>
      ) : null}
      {loading ? <output className={s.feedback}>Loading candidates…</output> : null}
      <div className={s.body}>
        <section aria-label="Schema definition" className={s.canvas}>
          <div className={s.dataEditor}>{dataEditor?.()}</div>
        </section>
      </div>
    </main>
  );
}
