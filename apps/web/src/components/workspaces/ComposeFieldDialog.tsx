import * as yaml from 'js-yaml';
import { Code2, Copy, ListTree, MessageSquare, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { composeValueLabel } from '@/domain/composePresentation';
import { authoringSemanticContent } from '@/domain/workspaces/authoringReview';
import { type ComposeDraftField, composeDraftFields } from '@/domain/workspaces/composeDraftFields';
import type { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';
import { ComposeDraftValueEditor } from './ComposeDraftValueEditor';
import styles from './ComposeFieldDialog.module.css';

export function ComposeFieldDialog({
  activity,
  initialView,
  title,
  onClose,
  onDiscuss,
}: {
  activity: ReturnType<typeof useComposeActivity>;
  initialView: 'structure' | 'yaml';
  title: string;
  onClose: () => void;
  onDiscuss: () => void;
}) {
  const [view, setView] = useState(initialView);
  const [selected, setSelected] = useState<ComposeDraftField | null>(null);
  const [saving, setSaving] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const document = activity.view?.current;
  const fields = useMemo(
    () => (document === undefined ? [] : composeDraftFields(document)),
    [document]
  );
  const renderedYaml = useMemo(
    () =>
      document === undefined
        ? ''
        : yaml.dump(authoringSemanticContent(document) ?? document, {
            lineWidth: -1,
            noRefs: true,
            sortKeys: true,
          }),
    [document]
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(renderedYaml);
      setCopyNotice('YAML copied.');
    } catch {
      setCopyNotice('Could not copy YAML. Select the text to copy it.');
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className={`${styles.dialog} sm:max-w-[850px]`} showCloseButton={!saving}>
        <header className={styles.header}>
          <p>
            {title} · Draft r{activity.compositionRevision ?? '—'}
          </p>
          <DialogTitle>Current structure</DialogTitle>
          <DialogDescription>
            Select a field to edit its current Draft value. Changes remain in the draft until
            reviewed and committed.
          </DialogDescription>
        </header>
        <div className={styles.tabs} role="group" aria-label="Draft structure view">
          <button
            type="button"
            aria-pressed={view === 'structure'}
            disabled={Boolean(selected)}
            onClick={() => setView('structure')}
          >
            <ListTree aria-hidden="true" /> Structure
          </button>
          <button
            type="button"
            aria-pressed={view === 'yaml'}
            disabled={Boolean(selected)}
            onClick={() => setView('yaml')}
          >
            <Code2 aria-hidden="true" /> YAML
          </button>
        </div>
        <div className={styles.body}>
          {document === undefined ? (
            <p role="status">{activity.error ?? 'Loading current Draft…'}</p>
          ) : view === 'yaml' ? (
            <section aria-label="Current Draft YAML" className={styles.yaml}>
              <button type="button" onClick={() => void copy()}>
                <Copy aria-hidden="true" /> Copy YAML
              </button>
              {copyNotice ? <output>{copyNotice}</output> : null}
              <pre>{renderedYaml}</pre>
            </section>
          ) : selected ? (
            <section className={styles.editor}>
              <h3>{selected.label}</h3>
              <code>{selected.path}</code>
              <p>Current value: {composeValueLabel(selected.value, 'Absent')}</p>
              <ComposeDraftValueEditor
                key={selected.path}
                activity={activity}
                path={selected.path}
                current={selected.value}
                onBusyChange={setSaving}
                onCancel={() => setSelected(null)}
                onSaved={(result) => {
                  if (result.kind !== 'no_change') setSelected(null);
                }}
              />
            </section>
          ) : fields.length ? (
            <ul className={styles.tree} aria-label="Current Draft fields">
              {fields.map((field) => (
                <li key={field.path} style={{ paddingLeft: `${Math.min(field.depth, 8) * 16}px` }}>
                  {field.editable ? (
                    <button
                      type="button"
                      aria-label={`Edit ${field.label}`}
                      title={field.path}
                      onClick={() => setSelected(field)}
                    >
                      <span>{field.label}</span>
                      <code>{composeValueLabel(field.value, 'Absent')}</code>
                      <Pencil aria-hidden="true" />
                    </button>
                  ) : (
                    <div className={styles.group}>
                      <ListTree aria-hidden="true" />
                      <strong>{field.label}</strong>
                      <small>
                        {Array.isArray(field.value)
                          ? 'array'
                          : field.value !== null && typeof field.value === 'object'
                            ? 'object'
                            : composeValueLabel(field.value, 'Absent')}
                      </small>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>No fields yet. Describe your first change in Chat.</p>
          )}
        </div>
        <footer className={styles.footer}>
          <output>{activity.notice ?? 'Current Draft · not committed'}</output>
          <button type="button" disabled={Boolean(selected) || saving} onClick={onDiscuss}>
            <MessageSquare aria-hidden="true" /> Discuss in Chat
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
