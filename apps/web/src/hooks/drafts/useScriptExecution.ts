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
  const mode = useWorkspaceStore((s) => s.mode);

  // Sync opsLog → scriptText when extraction produces new ops (not during manual edit)
  useEffect(() => {
    if (!scriptDirty && opsLog.length > 0) {
      useWorkspaceStore.getState().setScriptText(serializeOpsToYaml(opsLog));
    }
  }, [opsLog, scriptDirty]);

  const execute = useCallback(async () => {
    const store = useWorkspaceStore.getState();
    const convId = store.conversationId;
    const projectId = useChatStore.getState().activeProjectId;
    if (!convId || !projectId) return;

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

    // Add HumanSource to ops that lack source metadata (manual edits in script)
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
      useWorkspaceStore.getState().setScriptDirty(false);
      useWorkspaceStore.getState().setMode('executed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Execution failed';
      useWorkspaceStore.getState().setMode('idle');
      useWorkspaceStore.getState().setError(msg);
      toast.error(msg);
    }
  }, []);

  // Run is gated on `scriptDirty` to prevent the duplicate-apply footgun:
  // `runExtraction` already calls `commitOps`, so the post-extract script is
  // a *mirror* of what's already in `yops_log`. Re-running it would append
  // the same ops a second time. Run becomes meaningful only after a manual
  // edit in the script editor — that's when scriptDirty flips true.
  // (Long-term: extraction should produce a draft script that Run commits;
  // tracked separately. This gate is the correct guardrail until then.)
  const canRun = mode !== 'streaming' && mode !== 'committing' && scriptDirty;
  const disabledReason = !scriptDirty
    ? ('No script edits to run' as const)
    : mode === 'streaming'
      ? ('Extraction running' as const)
      : mode === 'committing'
        ? ('Commit in progress' as const)
        : null;

  return { execute, canRun, disabledReason };
}
