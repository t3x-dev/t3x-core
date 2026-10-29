'use client';

import { StudioSchemaEditLocalContributionSchema } from '@t3x-dev/api-client';
import { dump, JSON_SCHEMA, load } from 'js-yaml';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { WorkspaceYOpsEditor } from '@/components/workspaces/WorkspaceYOpsEditor';

export function SchemaYamlEditor({
  open,
  onOpenChange,
  initialDefinition,
  initiallyDirty = false,
  workspaceTitle,
  onSave,
  onReview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDefinition?: Record<string, unknown>;
  initiallyDirty?: boolean;
  workspaceTitle: string;
  onSave: (definition: Record<string, unknown>, intent: string) => Promise<void>;
  onReview: () => Promise<void>;
}) {
  const [yaml, setYaml] = useState('');
  const [baseline, setBaseline] = useState('');
  const [needsSave, setNeedsSave] = useState(false);
  const [intent, setIntent] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<'save' | 'review'>();
  const [confirmClose, setConfirmClose] = useState(false);
  const initialized = useRef(false);
  const saving = useRef(false);
  const hasSaved = useRef(false);

  useEffect(() => {
    if (!open) {
      initialized.current = false;
      return;
    }
    if (initialized.current) return;
    initialized.current = true;
    const source = dump(initialDefinition ?? { nodes: {} }, { noRefs: true, lineWidth: 100 });
    setYaml(source);
    setBaseline(source);
    setNeedsSave(initiallyDirty);
    setIntent('');
    setError(undefined);
    setConfirmClose(false);
    hasSaved.current = false;
  }, [open, initialDefinition, initiallyDirty]);

  const parsed = useMemo(() => {
    try {
      const definition = StudioSchemaEditLocalContributionSchema.parse(
        load(yaml, { schema: JSON_SCHEMA }) ?? {}
      );
      // The shared transport also accepts partial contributions. This editor
      // always saves a complete definition; never silently switch write modes.
      if (definition.yschema !== '0.1')
        throw new Error("Keep yschema: '0.1' in the complete Schema definition.");
      return { definition, error: undefined };
    } catch (cause) {
      return {
        definition: undefined,
        error: cause instanceof Error ? cause.message : 'Invalid Schema YAML.',
      };
    }
  }, [yaml]);
  const dirty = needsSave || yaml !== baseline;
  useEffect(() => {
    if (!open || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [open, dirty]);

  function close() {
    if (saving.current) return;
    // The field draft stays mounted behind this editor; only new YAML edits
    // need discarding when returning to it.
    if (yaml !== baseline) setConfirmClose(true);
    else onOpenChange(false);
  }
  async function save(review = false, closeAfter = false) {
    if (saving.current || !parsed.definition) return;
    saving.current = true;
    setBusy(review ? 'review' : 'save');
    setError(undefined);
    let saved = hasSaved.current && !dirty;
    try {
      if (!saved) {
        await onSave(parsed.definition, intent.trim() || 'Edit Schema YAML.');
        setBaseline(yaml);
        setNeedsSave(false);
        hasSaved.current = true;
        saved = true;
      }
      if (review) await onReview();
      else if (closeAfter) onOpenChange(false);
      setConfirmClose(false);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Please try again.';
      setError(saved && review ? `Saved. Could not open Review: ${message}` : message);
    } finally {
      saving.current = false;
      setBusy(undefined);
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([yaml], { type: 'application/yaml' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'schema-studio-definition.yaml';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        className="flex h-[min(860px,92dvh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1120px,96vw)]"
        showCloseButton={!busy}
      >
        <DialogHeader className="shrink-0 border-b border-[var(--stroke-divider)] px-5 py-4 pr-12 text-left">
          <DialogTitle>Schema YAML editor</DialogTitle>
          <DialogDescription>
            {workspaceTitle} · Edit this workspace’s schema draft. Save to keep editing, or save and
            review your changes.
          </DialogDescription>
        </DialogHeader>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-5 py-2">
          <output className="text-xs text-[var(--text-secondary)]" aria-live="polite">
            {busy === 'review'
              ? 'Saving and preparing Review…'
              : busy
                ? 'Saving…'
                : dirty
                  ? 'Unsaved changes'
                  : hasSaved.current
                    ? 'Draft saved · not committed'
                    : 'No unsaved changes'}
          </output>
          <Button variant="ghost" size="sm" onClick={download} disabled={!!busy}>
            Download YAML
          </Button>
        </div>
        <div className="min-h-0 flex-1 bg-[var(--editor-bg)]">
          <WorkspaceYOpsEditor
            ariaLabel="Schema definition YAML editor"
            value={yaml}
            readOnly={!!busy}
            onChange={(value) => {
              setYaml(value);
              setError(undefined);
            }}
          />
        </div>
        {parsed.error || error ? (
          <p
            role="alert"
            className="max-h-28 shrink-0 overflow-auto whitespace-pre-wrap border-t border-[var(--stroke-divider)] px-5 py-2 text-xs text-[var(--status-error)]"
          >
            {parsed.error || error}
          </p>
        ) : null}
        <div className="flex shrink-0 flex-wrap items-end gap-3 border-t border-[var(--stroke-divider)] px-5 py-3">
          {confirmClose ? (
            <>
              <p className="w-full text-sm">
                Save your YAML changes before closing? Discard returns to the field draft.
              </p>
              <Button variant="ghost" disabled={!!busy} onClick={() => setConfirmClose(false)}>
                Keep editing
              </Button>
              <Button variant="outline" disabled={!!busy} onClick={() => onOpenChange(false)}>
                Discard YAML edits
              </Button>
              <Button
                disabled={!!busy || !parsed.definition}
                onClick={() => void save(false, true)}
              >
                Save draft and close
              </Button>
            </>
          ) : (
            <>
              <label
                className="min-w-48 flex-1 space-y-1 text-xs text-[var(--text-secondary)]"
                htmlFor="schema-yaml-intent"
              >
                <span>Change description (optional)</span>
                <Input
                  id="schema-yaml-intent"
                  value={intent}
                  disabled={!!busy}
                  onChange={(event) => setIntent(event.target.value)}
                  placeholder="Describe this change"
                />
              </label>
              <Button
                variant="outline"
                disabled={!!busy || !parsed.definition || !dirty}
                onClick={() => void save()}
              >
                Save draft
              </Button>
              <Button
                variant="commit"
                disabled={!!busy || !parsed.definition}
                onClick={() => void save(true)}
              >
                Save and review
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
