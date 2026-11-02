import { yamlLanguage } from '@codemirror/lang-yaml';
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight';
import type { TransitionProtocolValue } from '@t3x-dev/api-client';
import * as yaml from 'js-yaml';
import { Code2, Copy, FileCode2, ListTree, MessageSquare } from 'lucide-react';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import type { SchemaEditorNavigation } from '@/components/schemas/useSchemaNavigationGuard';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { composeValueLabel } from '@/domain/composePresentation';
import { authoringSemanticContent } from '@/domain/workspaces/authoringReview';
import type { DraftStructureNode, DraftYOp } from '@/domain/workspaces/draftStructure';
import type { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { ComposeDraftValueEditor } from './ComposeDraftValueEditor';
import styles from './ComposeFieldDialog.module.css';
import { DraftStructureEditor } from './DraftStructureEditor';
import { WorkspaceSchemaEditor } from './WorkspaceSchemaEditor';

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

export function ComposeFieldDialog({
  activity,
  initialView,
  title,
  onClose,
  onDiscuss,
  current,
  onSubmit,
  error,
  pending = false,
  candidate,
  initialSubject = 'content',
  onSubjectChange,
  schemaBlocked,
  onSchemaChanged,
  focusSchemaPath,
}: {
  activity: ReturnType<typeof useComposeActivity>;
  initialView: 'structure' | 'yaml';
  title: string;
  onClose: () => void;
  onDiscuss: () => void;
  current?: TransitionProtocolValue;
  onSubmit?: (operations: DraftYOp[], reason: string) => Promise<boolean>;
  error?: string | null;
  pending?: boolean;
  candidate?: WorkspaceCandidate;
  focusSchemaPath?: string;
  initialSubject?: 'content' | 'schema';
  onSubjectChange?: (subject: 'content' | 'schema') => void;
  schemaBlocked?: string;
  onSchemaChanged?: () => Promise<void>;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [schemaOpened, setSchemaOpened] = useState(initialSubject === 'schema');
  const [schemaDirty, setSchemaDirty] = useState(false);
  const [schemaSaving, setSchemaSaving] = useState(false);
  const [contentReset, setContentReset] = useState(0);
  const schemaNavigation = useRef<SchemaEditorNavigation | null>(null);
  const [closeRequested, setCloseRequested] = useState(false);
  const [view, setView] = useState(initialView);
  const [selected, setSelected] = useState<DraftStructureNode | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingStructure, setEditingStructure] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const document = current ?? activity.view?.current;
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

  const close = () => {
    if (saving || schemaSaving) return;
    if (selected || editingStructure) {
      setCloseRequested(true);
      return;
    }
    if (schemaNavigation.current) schemaNavigation.current.requestNavigation(onClose);
    else onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className={`${styles.dialog} sm:max-w-[850px]`}
        showCloseButton={!saving && !schemaSaving}
      >
        <header className={styles.header}>
          <p>
            {title} · Draft r{activity.compositionRevision ?? '—'}
          </p>
          <DialogTitle>{candidate ? 'Edit Workspace Draft' : 'Current structure'}</DialogTitle>
          <DialogDescription>
            Add, edit, or delete fields and items. More operations are available on each row.
            Changes remain in the draft until reviewed and committed.
          </DialogDescription>
        </header>
        {candidate ? (
          <fieldset className={styles.tabs} aria-label="Editing subject">
            {(['content', 'schema'] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={subject === item}
                disabled={saving || schemaSaving}
                onClick={() => {
                  setSubject(item);
                  onSubjectChange?.(item);
                  if (item === 'schema') setSchemaOpened(true);
                }}
              >
                {item === 'content' ? 'Content' : 'Schema'}
                {item === 'schema' && schemaDirty ? ' · Unsaved' : ''}
                {item === 'content' && (selected || editingStructure) ? ' · Unsaved' : ''}
              </button>
            ))}
          </fieldset>
        ) : null}
        <div hidden={subject !== 'content'} className={styles.subject}>
          <fieldset className={styles.tabs} aria-label="Draft structure view">
            <button
              type="button"
              aria-pressed={view === 'structure'}
              disabled={Boolean(selected) || editingStructure || saving || pending}
              onClick={() => setView('structure')}
            >
              <ListTree aria-hidden="true" /> Structure
            </button>
            <button
              type="button"
              aria-pressed={view === 'yaml'}
              disabled={Boolean(selected) || editingStructure || saving || pending}
              onClick={() => setView('yaml')}
            >
              <Code2 aria-hidden="true" /> YAML
            </button>
          </fieldset>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <div className={styles.body} data-view={view}>
            {document === undefined ? (
              <output>{activity.error ?? 'Loading current Draft…'}</output>
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
                {/* biome-ignore lint/a11y/noNoninteractiveTabindex: This independently scrolling YAML pane must remain reachable for keyboard scrolling. */}
                <pre tabIndex={0} role="document" aria-label="YAML source">
                  <code>{highlightedYaml}</code>
                </pre>
              </section>
            ) : selected ? (
              <section className={styles.editor}>
                <h3>{selected.key}</h3>
                <code>{selected.path}</code>
                <p>Current value: {composeValueLabel(selected.value, 'Absent')}</p>
                <ComposeDraftValueEditor
                  key={selected.path}
                  activity={activity}
                  path={selected.path}
                  current={selected.value}
                  onBusyChange={setSaving}
                  onSubmit={onSubmit}
                  onCancel={() => setSelected(null)}
                  onSaved={(result) => {
                    if (result.kind !== 'no_change') setSelected(null);
                  }}
                />
              </section>
            ) : (
              <DraftStructureEditor
                current={document}
                key={contentReset}
                pending={saving || schemaSaving || pending}
                onEditField={setSelected}
                onEditingChange={setEditingStructure}
                onPublish={async (operations, reason) => {
                  setSaving(true);
                  try {
                    if (onSubmit) return await onSubmit(operations, reason);
                    await activity.publish({
                      request_id: crypto.randomUUID(),
                      operations,
                      reason,
                    });
                    return true;
                  } finally {
                    setSaving(false);
                  }
                }}
              />
            )}
          </div>
        </div>
        {candidate && schemaOpened ? (
          <div hidden={subject !== 'schema'} className={styles.subject}>
            <WorkspaceSchemaEditor
              candidate={candidate}
              navigationRef={schemaNavigation}
              focusSemanticPath={focusSchemaPath}
              blocked={
                schemaBlocked ??
                (selected || editingStructure
                  ? 'Finish or cancel the current Content input before saving Schema.'
                  : undefined)
              }
              onDirtyChange={setSchemaDirty}
              onBusyChange={setSchemaSaving}
              onChanged={
                onSchemaChanged ??
                (async () => {
                  await activity.loadLatest();
                })
              }
            />
          </div>
        ) : null}
        {closeRequested ? (
          <div role="alert" className={styles.footer}>
            <span>Content input has not been added to your local changes.</span>
            <button type="button" onClick={() => setCloseRequested(false)}>
              Keep editing
            </button>
            <button
              type="button"
              onClick={() => {
                setCloseRequested(false);
                setSelected(null);
                setEditingStructure(false);
                setContentReset((value) => value + 1);
                if (schemaNavigation.current) schemaNavigation.current.requestNavigation(onClose);
                else onClose();
              }}
            >
              Discard content input and close
            </button>
          </div>
        ) : null}
        <footer className={styles.footer}>
          <output>
            {subject === 'schema'
              ? schemaDirty
                ? 'Unsaved Schema input'
                : 'Schema · not committed'
              : selected || editingStructure
                ? 'Unsaved Content input'
                : (activity.notice ?? 'Current Draft · not committed')}
          </output>
          <button
            type="button"
            disabled={Boolean(selected) || editingStructure || saving || schemaSaving || pending}
            onClick={() => {
              if (schemaNavigation.current) schemaNavigation.current.requestNavigation(onDiscuss);
              else onDiscuss();
            }}
          >
            <MessageSquare aria-hidden="true" /> Discuss in Chat
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
