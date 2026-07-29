'use client';

import { defaultKeymap } from '@codemirror/commands';
import { yaml } from '@codemirror/lang-yaml';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { useEffect, useRef } from 'react';

interface WorkspaceYOpsEditorProps {
  ariaLabel?: string;
  readOnly?: boolean;
  value: string;
  onChange: (value: string) => void;
}

const workspaceYOpsHighlightStyle = HighlightStyle.define([
  { tag: [t.propertyName, t.definitionKeyword, t.keyword], color: 'var(--yaml-key)' },
  { tag: t.string, color: 'var(--yaml-string)' },
  { tag: t.number, color: 'var(--yaml-number)' },
  { tag: [t.bool, t.null, t.atom], color: 'var(--yaml-ref)' },
  { tag: t.comment, color: 'var(--yaml-comment)' },
  { tag: [t.punctuation, t.separator], color: 'var(--yaml-punctuation)' },
]);

export function WorkspaceYOpsEditor({
  ariaLabel = 'YOps YAML editor',
  onChange,
  readOnly = false,
  value,
}: WorkspaceYOpsEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const readOnlyCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const externalUpdate = useRef(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        yaml(),
        syntaxHighlighting(workspaceYOpsHighlightStyle),
        keymap.of(defaultKeymap),
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
        EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !externalUpdate.current) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          '&': {
            height: '100%',
            backgroundColor: 'var(--editor-bg)',
            color: 'var(--text-primary)',
            fontSize: '12px',
            lineHeight: '20px',
          },
          '.cm-content': {
            minHeight: '100%',
            padding: '8px 0',
            caretColor: 'var(--text-primary)',
          },
          '.cm-line': {
            padding: '0 20px 0 8px',
          },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: 'var(--font-mono)',
            fontWeight: '400',
            fontVariantLigatures: 'none',
            letterSpacing: '0',
            tabSize: '2',
          },
          '.cm-gutters': {
            backgroundColor: 'var(--editor-gutter)',
            borderRight: '1px solid var(--stroke-divider)',
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
          },
          '.cm-lineNumbers .cm-gutterElement': {
            minWidth: '32px',
            padding: '0 8px 0 4px',
            textAlign: 'right',
          },
          '.cm-activeLineGutter': {
            backgroundColor: 'color-mix(in srgb, var(--accent-pending) 8%, transparent)',
          },
          '.cm-activeLine': {
            backgroundColor: 'color-mix(in srgb, var(--accent-pending) 6%, transparent)',
          },
          '.cm-cursor': {
            borderLeftColor: 'var(--text-primary)',
          },
          '.cm-selectionBackground': {
            backgroundColor: 'color-mix(in srgb, var(--accent-commit) 22%, transparent) !important',
          },
          '&.cm-focused': {
            outline: '1px solid var(--accent-commit)',
            outlineOffset: '-1px',
          },
        }),
      ],
    });
    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Initializing CodeMirror is intentionally one-shot; value/readOnly sync in effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    externalUpdate.current = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    externalUpdate.current = false;
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  return <div className="h-full min-h-0" data-testid="workspace-yops-editor" ref={editorRef} />;
}
