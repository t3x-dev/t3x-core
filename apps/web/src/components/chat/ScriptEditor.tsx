'use client';

import { defaultKeymap } from '@codemirror/commands';
import { yaml } from '@codemirror/lang-yaml';
import { lintGutter } from '@codemirror/lint';
import { Compartment, EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { placeholder as cmPlaceholder, EditorView, keymap, lineNumbers } from '@codemirror/view';
import type { SourcedYOp, YOp } from '@t3x-dev/core';
import { Loader2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useRef, useState } from 'react';
import { opsToYaml } from '@/lib/scriptParser';
import { useWorkspaceStore } from '@/store/workspaceStore';

const PLACEHOLDER = `# No ops yet — click Extract or edit slots in the After panel.`;

function stripSource(op: SourcedYOp): YOp {
  const { source: _source, ...rest } = op as SourcedYOp & Record<string, unknown>;
  return rest as YOp;
}

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
  const opsLog = useWorkspaceStore((s) => s.opsLog);
  const execError = useWorkspaceStore((s) => s.execError);
  const isStreaming = mode === 'streaming';

  // Derived read-only YAML view of the committed ops log. The editor is a
  // display surface in the new CQRS architecture — writes come from the
  // extraction worker and gold-edit builder, never from editor input.
  const scriptText = useMemo(
    () => opsToYaml(opsLog.map((op) => stripSource(op))),
    [opsLog]
  );

  // Elapsed timer during extraction
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isStreaming) { setElapsed(0); return; }
    const start = Date.now();
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [isStreaming]);

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
        readOnlyCompartment.current.of(EditorState.readOnly.of(true)),
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

  const hasErrors = !!execError;
  const opsCount = opsLog.length;

  return (
    <div className="flex flex-col h-full bg-[var(--editor-bg)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--stroke-default)] bg-[var(--editor-gutter)]">
        <span className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          <span className="relative flex h-2 w-2">
            {isStreaming ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--status-error)] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--status-error)]" />
              </>
            ) : (
              <span className="inline-flex h-2 w-2 rounded-full bg-[var(--status-success)]" />
            )}
          </span>
          Script
        </span>
      </div>

      {/* Editor */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div ref={editorRef} className="h-full" />

        {/* Extraction overlay */}
        {isStreaming && (
          <div className="absolute inset-0 bg-[var(--editor-bg)]/80 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 z-10">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--source)]" />
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              Extracting...
            </span>
            <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
              {elapsed}s
            </span>
          </div>
        )}
      </div>

      {/* Error panel — surfaces engine exec errors from the last replay */}
      {hasErrors && execError && (
        <div className="border-t border-[var(--status-error)]/30 bg-[var(--status-error-muted)] px-3 py-1.5 text-[10px] font-mono max-h-20 overflow-y-auto">
          <div className="text-[var(--status-error)] py-px">
            <span className="text-[var(--status-error)] font-semibold">
              Op {execError.op_index + 1}
            </span>
            <span className="text-[var(--status-error)] opacity-70 ml-1">({execError.code})</span>
            <span className="ml-1">— {execError.message}</span>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center gap-2 px-3 py-1 border-t border-[var(--stroke-default)] bg-[var(--editor-gutter)] text-[9px] text-[var(--text-tertiary)]">
        <span>{opsCount} op{opsCount === 1 ? '' : 's'}</span>
        {hasErrors && <span className="text-[var(--status-error)]">✗ 1 error</span>}
      </div>
    </div>
  );
}
