'use client';

import { defaultKeymap } from '@codemirror/commands';
import { yaml } from '@codemirror/lang-yaml';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import {
  placeholder as cmPlaceholder,
  Decoration,
  EditorView,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
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

const YOPS_MONO_FONT = 'var(--font-mono)';

const yopsHighlightStyle = HighlightStyle.define([
  { tag: [t.propertyName, t.definitionKeyword, t.keyword], color: 'var(--yaml-key)' },
  { tag: t.string, color: 'var(--yaml-string)' },
  { tag: t.number, color: 'var(--yaml-number)' },
  { tag: [t.bool, t.null, t.atom], color: 'var(--yaml-ref)' },
  { tag: t.comment, color: 'var(--yaml-comment)' },
  { tag: [t.punctuation, t.separator], color: 'var(--yaml-punctuation)' },
]);

function findInlineCommentStart(text: string, startIndex: number): number {
  let quote: '"' | "'" | null = null;
  for (let i = startIndex; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (char === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '#' && (i === 0 || /\s/.test(text[i - 1] ?? ''))) return i;
  }
  return text.length;
}

function findMappingColon(text: string): number {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (char === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '#' && (i === 0 || /\s/.test(text[i - 1] ?? ''))) return -1;
    if (char === ':') return i;
  }
  return -1;
}

function yopsValueClass(value: string): string {
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return 'cm-yops-number-value';
  if (/^(?:true|false|null)$/i.test(value)) return 'cm-yops-atom-value';
  return 'cm-yops-string-value';
}

function scalarValueHighlightExtension() {
  return EditorView.decorations.of((view) => {
    const ranges = [];
    for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
      const line = view.state.doc.line(lineNumber);
      const text = line.text;
      const colonIndex = findMappingColon(text);
      if (colonIndex === -1) continue;

      let start = colonIndex + 1;
      let end = findInlineCommentStart(text, start);
      while (start < end && /\s/.test(text[start] ?? '')) start += 1;
      while (end > start && /\s/.test(text[end - 1] ?? '')) end -= 1;
      if (start >= end) continue;

      const value = text.slice(start, end);
      ranges.push(
        Decoration.mark({ class: yopsValueClass(value) }).range(line.from + start, line.from + end)
      );
    }
    return Decoration.set(ranges, true);
  });
}

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
        syntaxHighlighting(yopsHighlightStyle),
        scalarValueHighlightExtension(),
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
            position: 'relative',
            fontSize: '12px',
            lineHeight: '19px',
            backgroundColor: 'var(--panel-alt)',
            color: 'var(--text-primary)',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            top: '0',
            right: '0',
            bottom: '0',
            zIndex: '4',
            width: '24px',
            pointerEvents: 'none',
            background:
              'linear-gradient(90deg, color-mix(in srgb, var(--panel-alt) 0%, transparent), var(--panel-alt))',
          },
          '.cm-content': {
            padding: '7px 0',
            caretColor: 'var(--text-primary)',
          },
          '.cm-line': {
            padding: '0 24px 0 6px',
          },
          '.cm-scroller': {
            overflow: 'auto',
            paddingRight: '16px',
            scrollPaddingRight: '16px',
            fontFamily: YOPS_MONO_FONT,
            fontWeight: '400',
            fontVariantLigatures: 'none',
            letterSpacing: '0',
            tabSize: '2',
          },
          '.cm-gutters': {
            backgroundColor: 'var(--panel)',
            color: 'color-mix(in srgb, var(--text-tertiary) 70%, transparent)',
            borderRight: '1px solid var(--stroke-default)',
            fontFamily: YOPS_MONO_FONT,
            fontSize: '11px',
            fontVariantNumeric: 'tabular-nums',
          },
          '.cm-lineNumbers .cm-gutterElement': {
            minWidth: '34px',
            padding: '0 8px 0 10px',
          },
          '.cm-yops-string-value': {
            color: 'var(--yaml-string)',
          },
          '.cm-yops-number-value': {
            color: 'var(--yaml-number)',
          },
          '.cm-yops-atom-value': {
            color: 'var(--yaml-ref)',
          },
          '.cm-activeLineGutter': {
            backgroundColor: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
          },
          '.cm-activeLine': {
            backgroundColor: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
          },
          '.cm-yops-pending-edit-line': {
            backgroundColor: 'color-mix(in srgb, var(--accent-commit) 4.5%, transparent)',
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
              isStreaming ? 'bg-[var(--status-error)] animate-pulse' : 'bg-[var(--status-success)]'
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
