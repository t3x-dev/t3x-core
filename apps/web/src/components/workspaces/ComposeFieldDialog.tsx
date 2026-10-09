import { yamlLanguage } from '@codemirror/lang-yaml';
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight';
import * as yaml from 'js-yaml';
import {
  Box,
  CircleSlash,
  Code2,
  Copy,
  FileCode2,
  Hash,
  List,
  ListTree,
  MessageSquare,
  Pencil,
  ToggleLeft,
  Type,
} from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { composeValueLabel } from '@/domain/composePresentation';
import { authoringSemanticContent } from '@/domain/workspaces/authoringReview';
import { type ComposeDraftField, composeDraftFields } from '@/domain/workspaces/composeDraftFields';
import type { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';
import { ComposeDraftValueEditor } from './ComposeDraftValueEditor';
import styles from './ComposeFieldDialog.module.css';

const yamlHighlighter = tagHighlighter([
  { tag: [tags.propertyName, tags.definitionKeyword, tags.keyword], class: styles.yamlKey },
  { tag: tags.string, class: styles.yamlString },
  { tag: tags.number, class: styles.yamlNumber },
  { tag: [tags.bool, tags.null, tags.atom], class: styles.yamlLiteral },
  { tag: tags.comment, class: styles.yamlComment },
  { tag: [tags.punctuation, tags.separator], class: styles.yamlPunctuation },
]);

function highlightYaml(source: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let position = 0;
  highlightTree(yamlLanguage.parser.parse(source), yamlHighlighter, (from, to, className) => {
    if (from > position) parts.push(source.slice(position, from));
    parts.push(
      <span key={from} className={className}>
        {source.slice(from, to)}
      </span>
    );
    position = to;
  });
  if (position < source.length) parts.push(source.slice(position));
  return parts;
}

function fieldType(value: unknown) {
  if (Array.isArray(value)) return { Icon: List, label: 'array' };
  if (value === null) return { Icon: CircleSlash, label: 'null' };
  switch (typeof value) {
    case 'object':
      return { Icon: Box, label: 'object' };
    case 'number':
      return { Icon: Hash, label: 'number' };
    case 'boolean':
      return { Icon: ToggleLeft, label: 'boolean' };
    default:
      return { Icon: Type, label: 'string' };
  }
}

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
  const highlightedYaml = useMemo(
    () => (view === 'yaml' ? highlightYaml(renderedYaml) : null),
    [renderedYaml, view]
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
        <div className={styles.body} data-view={view}>
          {document === undefined ? (
            <p role="status">{activity.error ?? 'Loading current Draft…'}</p>
          ) : view === 'yaml' ? (
            <section aria-label="Current Draft YAML" className={styles.yaml}>
              <header className={styles.yamlHeading}>
                <span>
                  <FileCode2 aria-hidden="true" /> Current Draft r
                  {activity.compositionRevision ?? '—'}
                </span>
                <div>
                  <small>Read only</small>
                  <button type="button" onClick={() => void copy()}>
                    <Copy aria-hidden="true" /> Copy YAML
                  </button>
                </div>
              </header>
              {copyNotice ? <output className={styles.copyNotice}>{copyNotice}</output> : null}
              <pre tabIndex={0} aria-label="YAML source">
                <code>{highlightedYaml}</code>
              </pre>
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
              {fields.map((field) => {
                const { Icon, label: type } = fieldType(field.value);
                const valueLabel = composeValueLabel(field.value, 'Absent');
                return (
                  <li
                    key={field.path}
                    style={{ paddingLeft: `${Math.min(field.depth, 8) * 16}px` }}
                  >
                    {field.editable ? (
                      <button
                        type="button"
                        aria-label={`Edit ${field.label}`}
                        title={field.path}
                        onClick={() => setSelected(field)}
                      >
                        <span className={styles.fieldIcon} title={type}>
                          <Icon aria-hidden="true" />
                        </span>
                        <span className={styles.fieldLabel}>{field.label}</span>
                        <code title={valueLabel}>{valueLabel}</code>
                        <Pencil className={styles.editIcon} aria-hidden="true" />
                      </button>
                    ) : (
                      <div className={styles.group} title={field.path}>
                        <span className={styles.groupIcon} title={type}>
                          <Icon aria-hidden="true" />
                        </span>
                        <strong className={styles.fieldLabel}>{field.label}</strong>
                        {type === 'array' || type === 'object' ? (
                          <small>{type}</small>
                        ) : (
                          <code title={valueLabel}>{valueLabel}</code>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
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
