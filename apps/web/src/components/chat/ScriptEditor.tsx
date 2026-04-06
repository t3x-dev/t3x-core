'use client';

import { useCallback, useEffect, useRef } from 'react';
import { EditorView, keymap, lineNumbers, placeholder as cmPlaceholder } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';
import { lintGutter } from '@codemirror/lint';
import { defaultKeymap } from '@codemirror/commands';
import { useWorkspaceStore } from '@/store/workspaceStore';

const PLACEHOLDER = `yops:
  - set:
      path: node/slot
      value: "new value"
      from: T1`;

export function ScriptEditor() {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const mode = useWorkspaceStore((s) => s.mode);
  const scriptText = useWorkspaceStore((s) => s.scriptText);
  const parseErrors = useWorkspaceStore((s) => s.parseErrors);
  const execError = useWorkspaceStore((s) => s.execError);
  const setScriptText = useWorkspaceStore((s) => s.setScriptText);
  const isExternalUpdate = useRef(false);

  // Initialize CodeMirror
  useEffect(() => {
    if (!editorRef.current) return;
    const state = EditorState.create({
      doc: scriptText,
      extensions: [
        lineNumbers(),
        yaml(),
        oneDark,
        lintGutter(),
        keymap.of(defaultKeymap),
        cmPlaceholder(PLACEHOLDER),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isExternalUpdate.current) {
            setScriptText(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '11px' },
          '.cm-scroller': { overflow: 'auto', fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace" },
          '.cm-gutters': { backgroundColor: '#191c27', borderRight: '1px solid #2a2d3a' },
        }),
      ],
    });
    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    view.dispatch({ effects: EditorState.readOnly.of(mode === 'streaming') });
  }, [mode]);

  return (
    <div className="flex flex-col h-full bg-[#13151e]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--stroke)] bg-[#191c27]">
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Script
          {mode === 'streaming' && (
            <span className="ml-2 text-[7px] font-bold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 uppercase">
              streaming
            </span>
          )}
        </span>
        <span className="text-[9px] font-mono text-[var(--text-tertiary)] opacity-60">
          {mode === 'streaming' ? 'read-only' : 'editable'}
        </span>
      </div>
      <div ref={editorRef} className="flex-1 min-h-0 overflow-hidden" />
      {(parseErrors.length > 0 || execError) && (
        <div className="border-t border-red-900/30 bg-red-950/20 px-3 py-1.5 text-[10px] font-mono max-h-20 overflow-y-auto">
          {parseErrors.map((err, i) => (
            <div key={i} className="text-red-400 py-px">
              <span className="text-red-500">Line {err.line}:</span> {err.message}
            </div>
          ))}
          {execError && (
            <div className="text-red-400 py-px">
              <span className="text-red-500">Op {execError.op_index + 1}</span>
              <span className="text-red-600 ml-1">({execError.code})</span>
              <span className="ml-1">— {execError.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
