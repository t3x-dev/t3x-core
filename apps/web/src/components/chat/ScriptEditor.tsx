'use client';

import { defaultKeymap } from '@codemirror/commands';
import { yaml } from '@codemirror/lang-yaml';
import { Compartment, EditorState } from '@codemirror/state';
import {
  placeholder as cmPlaceholder,
  Decoration,
  EditorView,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { useEffect, useMemo, useRef } from 'react';
import { getChangedLineNumbers, getHumanCommentContentLineNumbers } from '@/domain/yops/scriptDiff';
import {
  selectCanonicalScriptText,
  selectScriptDirty,
  selectScriptText,
  useWorkspaceStore,
} from '@/store/workspaceStore';
import { cn } from '@/utils/cn';

const PLACEHOLDER = `yops:
  - set:
      path: node/slot
      value: "new value"`;

function pendingEditLineHighlightExtension(lineNumbersToHighlight: ReadonlySet<number>) {
  return EditorView.decorations.of((view) => {
    const ranges = [...lineNumbersToHighlight]
      .filter((lineNumber) => lineNumber >= 1 && lineNumber <= view.state.doc.lines)
      .sort((a, b) => a - b)
      .map((lineNumber) =>
        Decoration.line({ class: 'cm-yops-pending-edit-line' }).range(
          view.state.doc.line(lineNumber).from
        )
      );
    return Decoration.set(ranges, true);
  });
}

export function ScriptEditor() {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const mode = useWorkspaceStore((s) => s.mode);
  const scriptText = useWorkspaceStore(selectScriptText);
  const canonicalScriptText = useWorkspaceStore(selectCanonicalScriptText);
  const scriptDirty = useWorkspaceStore(selectScriptDirty);
  const recentScriptApplyLineNumbers = useWorkspaceStore((s) => s.recentScriptApplyLineNumbers);
  const lastError = useWorkspaceStore((s) => s.lastError);
  const isExternalUpdate = useRef(false);
  const readOnlyCompartment = useRef(new Compartment());
  const humanHighlightCompartment = useRef(new Compartment());

  const highlightedLines = useMemo(() => {
    const lines = new Set<number>();
    if (!scriptDirty && recentScriptApplyLineNumbers.length > 0) {
      for (const lineNumber of recentScriptApplyLineNumbers) lines.add(lineNumber);
      return lines;
    }
    if (!scriptDirty) {
      for (const lineNumber of getHumanCommentContentLineNumbers(scriptText)) {
        lines.add(lineNumber);
      }
      return lines;
    }
    for (const lineNumber of getChangedLineNumbers(canonicalScriptText, scriptText)) {
      lines.add(lineNumber);
    }
    return lines;
  }, [canonicalScriptText, recentScriptApplyLineNumbers, scriptDirty, scriptText]);

  useEffect(() => {
    if (!editorRef.current) return;
    const state = EditorState.create({
      doc: scriptText,
      extensions: [
        lineNumbers(),
        yaml(),
        keymap.of(defaultKeymap),
        cmPlaceholder(PLACEHOLDER),
        readOnlyCompartment.current.of(EditorState.readOnly.of(false)),
        humanHighlightCompartment.current.of(pendingEditLineHighlightExtension(new Set())),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isExternalUpdate.current) {
            const text = update.state.doc.toString();
            // User typed in the editor — set the override. `setEditorOverride`
            // both stores the text and (via the derived selector) flips
            // `selectScriptDirty` to true. No separate dirty-flag write.
            useWorkspaceStore.getState().setEditorOverride(text);
          }
        }),
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: '11px',
            backgroundColor: 'var(--panel-alt)',
            color: 'var(--text-primary)',
          },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
          },
          '.cm-gutters': {
            backgroundColor: 'var(--panel)',
            color: 'var(--text-tertiary)',
            borderRight: '1px solid var(--stroke-default)',
          },
          '.cm-activeLineGutter': {
            backgroundColor: 'var(--hover-bg)',
          },
          '.cm-activeLine': {
            backgroundColor: 'var(--hover-bg)',
          },
          '.cm-yops-pending-edit-line': {
            backgroundColor: 'color-mix(in srgb, var(--status-info) 12%, transparent)',
            boxShadow: 'inset 3px 0 0 var(--status-info)',
          },
          '.cm-cursor': {
            borderLeftColor: 'var(--text-primary)',
          },
          '.cm-selectionBackground': {
            backgroundColor: 'var(--source) !important',
            opacity: '0.15',
          },
          '&.cm-focused .cm-selectionBackground': {
            backgroundColor: 'var(--source) !important',
            opacity: '0.2',
          },
        }),
      ],
    });
    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== scriptText) {
      isExternalUpdate.current = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: scriptText },
      });
      isExternalUpdate.current = false;
      if (mode === 'streaming') {
        view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.length) });
      }
    }
  }, [scriptText, mode]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        EditorState.readOnly.of(mode === 'streaming')
      ),
    });
  }, [mode]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: humanHighlightCompartment.current.reconfigure(
        pendingEditLineHighlightExtension(highlightedLines)
      ),
    });
  }, [highlightedLines]);

  const isStreaming = mode === 'streaming';
  const editorStateLabel = isStreaming
    ? 'read-only'
    : scriptDirty
      ? 'script edit pending'
      : 'clean';

  return (
    <div className="flex flex-col h-full bg-[var(--panel-alt)]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--stroke-default)] bg-[var(--panel)]">
        <span className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              isStreaming ? 'bg-red-500 animate-pulse' : 'bg-green-500'
            )}
          />
          YOps
        </span>
        <span
          className="text-[9px] font-mono text-[var(--text-tertiary)] opacity-60"
          aria-live="polite"
        >
          {editorStateLabel}
        </span>
      </div>

      <div ref={editorRef} className="flex-1 min-h-0 overflow-hidden" />

      {lastError && (
        <div className="border-t border-[var(--status-error)]/20 bg-[var(--status-error-muted)] px-3 py-1.5 text-[10px] font-mono text-[var(--status-error)] max-h-16 overflow-y-auto">
          {lastError}
        </div>
      )}
    </div>
  );
}
