import type { SourcedYOp } from '@t3x-dev/core';
import { parseYOpsYaml } from '@t3x-dev/core';
import * as yaml from 'js-yaml';
import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { commitOps } from '@/commands/yops/yopsService';
import { serializeOpsToYaml } from '@/domain/yops/serializeOps';
import { hydrateConversationToStore } from '@/hooks/conversations/hydrateConversationToStore';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

/**
 * The script editor's canonical wire format wraps ops in a `yops:` envelope
 * (matches the placeholder + how `serializeOpsToYaml` writes the script).
 * `parseYOpsYaml` from @t3x-dev/yops only accepts a top-level array, so
 * unwrap here before delegating. Falls through to `parseYOpsYaml` unchanged
 * when the input is already a top-level array (manual edit case).
 */
function parseScript(yamlStr: string): ReturnType<typeof parseYOpsYaml> {
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlStr);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    Array.isArray((parsed as { yops?: unknown }).yops)
  ) {
    return parseYOpsYaml(yaml.dump((parsed as { yops: unknown }).yops));
  }
  return parseYOpsYaml(yamlStr);
}

export function useScriptExecution() {
  const opsLog = useWorkspaceStore((s) => s.opsLog);
  const scriptDirty = useWorkspaceStore((s) => s.scriptDirty);
  const hasDraft = useWorkspaceStore((s) => s.hasDraft);
  const mode = useWorkspaceStore((s) => s.mode);

  // Sync committed opsLog → scriptText only when there's no draft and no
  // manual edit. Once Extract stages a draft, `useExtraction` owns the
  // script content; once the user starts editing, `scriptDirty` owns it.
  useEffect(() => {
    if (scriptDirty || hasDraft) return;
    if (opsLog.length > 0) {
      useWorkspaceStore.getState().setScriptText(serializeOpsToYaml(opsLog));
    }
  }, [opsLog, scriptDirty, hasDraft]);

  const execute = useCallback(async () => {
    const store = useWorkspaceStore.getState();
    const convId = store.conversationId;
    const projectId = useChatStore.getState().activeProjectId;
    if (!convId || !projectId) return;

    // Defense in depth: the WorkspaceTopbar Apply button gates on `canRun`,
    // but execute() may be invoked from tests, hotkeys, or future callers
    // that bypass the button. Re-check the same guards here.
    if (store.mode === 'streaming' || store.mode === 'committing') return;
    // Apply only fires when there's something un-applied: either a fresh
    // draft from Extract, or a manual edit. A clean script that mirrors
    // committed state is a no-op.
    if (!store.scriptDirty && !store.hasDraft) return;

    const parseResult = parseScript(store.scriptText);
    if (!parseResult.ok) {
      store.setError(`YAML parse error: ${parseResult.error}`);
      toast.error(`YAML parse error: ${parseResult.error}`);
      return;
    }

    const ops = parseResult.ops as SourcedYOp[];
    if (ops.length === 0) {
      store.setError('No ops to execute');
      return;
    }

    // Add HumanSource to ops that lack source metadata (manual edits in
    // script). Draft ops from Extract already carry an `llm` source, so
    // they pass through unchanged.
    const now = new Date().toISOString();
    const sourced = ops.map((op) => {
      if ((op as Record<string, unknown>).source) return op;
      return {
        ...op,
        source: { type: 'human' as const, author: 'script-editor', at: now },
      };
    }) as SourcedYOp[];

    try {
      store.setMode('committing');
      await commitOps(convId, sourced);
      await hydrateConversationToStore(projectId, convId);
      const after = useWorkspaceStore.getState();
      after.setScriptDirty(false);
      // Apply succeeded — the draft is now in yops_log; clear local state.
      after.clearDraft();
      after.setMode('executed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Execution failed';
      useWorkspaceStore.getState().setMode('idle');
      useWorkspaceStore.getState().setError(msg);
      toast.error(msg);
    }
  }, []);

  // Apply is enabled when there's something un-applied to apply: a fresh
  // draft from Extract (`hasDraft`) or a manual edit (`scriptDirty`). A
  // clean script that mirrors committed state is a no-op and keeps the
  // button disabled.
  const canRun = mode !== 'streaming' && mode !== 'committing' && (scriptDirty || hasDraft);
  const disabledReason =
    mode === 'streaming'
      ? ('Extraction running' as const)
      : mode === 'committing'
        ? ('Commit in progress' as const)
        : !scriptDirty && !hasDraft
          ? ('No script edits to apply' as const)
          : null;

  return { execute, canRun, disabledReason };
}
