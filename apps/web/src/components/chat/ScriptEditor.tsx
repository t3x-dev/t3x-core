'use client';

import { defaultKeymap } from '@codemirror/commands';
import { yaml } from '@codemirror/lang-yaml';
import { lintGutter } from '@codemirror/lint';
import { Compartment, EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { placeholder as cmPlaceholder, EditorView, keymap, lineNumbers } from '@codemirror/view';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
import { useWorkspaceStore } from '@/store/workspaceStore';

const PLACEHOLDER = `yops:
  - set:
      path: node/slot
      value: "new value"
      from: T1`;

// Light theme using CSS variable tokens from globals.css
const lightTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'var(--editor-bg)', color: 'var(--text-primary)' },
    '.cm-gutters': {
      backgroundColor: 'var(--editor-gutter)',
      borderRight: '1px solid var(--stroke-default)',
      color: 'var(--text-tertiary)',
    },
    '.cm-activeLineGutter': { backgroundColor: 'var(--hover-bg)' },
    '.cm-activeLine': { backgroundColor: 'var(--hover-bg)' },
    '.cm-selectionBackground': { backgroundColor: 'rgba(59,130,246,0.15) !important' },
    '.cm-cursor': { borderLeftColor: 'var(--text-primary)' },
    '.cm-matchingBracket': { backgroundColor: 'rgba(59,130,246,0.2)', outline: 'none' },
    // Syntax token overrides for light mode
    '.ͼb': { color: 'var(--syn-key)' }, // def (keywords)
    '.ͼd': { color: 'var(--syn-string)' }, // string
    '.ͼc': { color: 'var(--syn-op)' }, // keyword
    '.ͼe': { color: 'var(--syn-comment)' }, // comment
    '.ͼi': { color: 'var(--syn-path)' }, // meta
    '.ͼ7': { color: 'var(--syn-tag)' }, // atom
  },
  { dark: false }
);

export function ScriptEditor() {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const mode = useWorkspaceStore((s) => s.mode);
  const scriptText = useWorkspaceStore((s) => s.scriptText);
  const scriptOps = useWorkspaceStore((s) => s.scriptOps);
  const parseErrors = useWorkspaceStore((s) => s.parseErrors);
  const execError = useWorkspaceStore((s) => s.execError);
  const baseCommitHash = useWorkspaceStore((s) => s.baseCommitHash);
  const setScriptText = useWorkspaceStore((s) => s.setScriptText);
  const isExternalUpdate = useRef(false);
  const readOnlyCompartment = useRef(new Compartment());
  const themeCompartment = useRef(new Compartment());
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Initialize CodeMirror
  useEffect(() => {
    if (!editorRef.current) return;
    const state = EditorState.create({
      doc: scriptText,
      extensions: [
        lineNumbers(),
        yaml(),
        themeCompartment.current.of(isDark ? oneDark : lightTheme),
        lintGutter(),
        keymap.of(defaultKeymap),
        cmPlaceholder(PLACEHOLDER),
        readOnlyCompartment.current.of(EditorState.readOnly.of(false)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isExternalUpdate.current) {
            setScriptText(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '11px' },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
          },
          '.cm-gutters': {
            backgroundColor: 'var(--editor-gutter)',
            borderRight: '1px solid var(--stroke-default)',
          },
        }),
      ],
    });
    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;
    // Ensure correct theme after hydration (resolvedTheme may change after mount)
    requestAnimationFrame(() => {
      if (viewRef.current) {
        const currentIsDark = document.documentElement.classList.contains('dark');
        viewRef.current.dispatch({
          effects: themeCompartment.current.reconfigure(currentIsDark ? oneDark : lightTheme),
        });
      }
    });
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch theme when dark/light changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.current.reconfigure(isDark ? oneDark : lightTheme),
    });
  }, [isDark]);

  // Sync store → editor
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentText = view.state.doc.toString();
    if (currentText !== scriptText) {
      isExternalUpdate.current = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: scriptText } });
      isExternalUpdate.current = false;
      if (mode === 'streaming') {
        view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.length) });
      }
    }
  }, [scriptText, mode]);

  // Toggle read-only during streaming
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        EditorState.readOnly.of(mode === 'streaming')
      ),
    });
  }, [mode]);

  const hasErrors = parseErrors.length > 0 || !!execError;
  const opsCount = scriptOps.length;

  return (
    <div className="flex flex-col h-full bg-[var(--editor-bg)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--stroke-default)] bg-[var(--editor-gutter)]">
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Script
          {mode === 'streaming' && (
            <span className="ml-2 text-[7px] font-bold px-1.5 py-0.5 rounded bg-[var(--source-dim)] text-[var(--source)] uppercase">
              streaming
            </span>
          )}
        </span>
      </div>

      {/* Editor */}
      <div ref={editorRef} className="flex-1 min-h-0 overflow-hidden" />

      {/* Error panel */}
      {hasErrors && (
        <div className="border-t border-[var(--status-error)]/30 bg-[var(--status-error-muted)] px-3 py-1.5 text-[10px] font-mono max-h-20 overflow-y-auto">
          {parseErrors.map((err, i) => (
            <div key={i} className="text-[var(--status-error)] py-px">
              <span className="text-[var(--status-error)] font-semibold">Line {err.line}:</span>{' '}
              {err.message}
            </div>
          ))}
          {execError && (
            <div className="text-[var(--status-error)] py-px">
              <span className="text-[var(--status-error)] font-semibold">
                Op {execError.op_index + 1}
              </span>
              <span className="text-[var(--status-error)] opacity-70 ml-1">({execError.code})</span>
              <span className="ml-1">— {execError.message}</span>
            </div>
          )}
        </div>
      )}

      {/* Status bar (Fix 3) */}
      <div className="flex items-center gap-2 px-3 py-1 border-t border-[var(--stroke-default)] bg-[var(--editor-gutter)] text-[9px] text-[var(--text-tertiary)]">
        {hasErrors ? (
          <span className="text-[var(--status-error)]">
            ✗ {parseErrors.length + (execError ? 1 : 0)} error(s)
          </span>
        ) : opsCount > 0 ? (
          <span className="text-[var(--status-success)]">
            ✓ {opsCount} ops{mode === 'executed' ? ' applied' : ''}
          </span>
        ) : (
          <span>no ops</span>
        )}
        {baseCommitHash && (
          <span className="ml-auto font-mono">base: {baseCommitHash.slice(0, 6)}</span>
        )}
      </div>
    </div>
  );
}
