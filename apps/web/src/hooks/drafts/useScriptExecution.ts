import type { SourcedYOp } from '@t3x-dev/core';
import { parseYOpsYaml } from '@t3x-dev/core';
import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { commitOps } from '@/commands/yops/yopsService';
import { serializeOpsToYaml } from '@/domain/yops/serializeOps';
import { hydrateConversationToStore } from '@/hooks/conversations/hydrateConversationToStore';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

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

    const parseResult = parseYOpsYaml(store.scriptText);
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

  const canRun = mode !== 'streaming' && mode !== 'committing';

  return { execute, canRun };
}
