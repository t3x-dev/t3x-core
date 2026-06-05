import { parseYOpsYaml, type SourcedYOp } from '@t3x-dev/core';
import * as yaml from 'js-yaml';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { requestYOpsRevision, type YOpsRevisionResult } from '@/commands/yops/reviseAdapter';
import { serializeOpsToYaml } from '@/domain/yops/serializeOps';
import { useChatModelPreferencesStore } from '@/store/chatModelPreferencesStore';
import { selectEffectiveTurns, selectScriptText, useWorkspaceStore } from '@/store/workspaceStore';

interface UseYOpsRevisionParams {
  selectedProvider?: string | null;
  selectedModel?: string | null;
}

function parseWorkspaceScript(yamlStr: string): ReturnType<typeof parseYOpsYaml> {
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

function serializeRevisionCandidate(ops: SourcedYOp[]): string {
  return serializeOpsToYaml(ops);
}

export function useYOpsRevision({ selectedProvider, selectedModel }: UseYOpsRevisionParams = {}) {
  const sessionProvider = useChatModelPreferencesStore((s) => s.selectedProvider);
  const sessionModel = useChatModelPreferencesStore((s) => s.selectedModel);
  const [isRevising, setIsRevising] = useState(false);
  const [result, setResult] = useState<YOpsRevisionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const revise = useCallback(
    async (feedback: string): Promise<YOpsRevisionResult | null> => {
      const trimmed = feedback.trim();
      if (!trimmed) {
        toast.warning('Describe what should change first.');
        return null;
      }

      const store = useWorkspaceStore.getState();
      if (!store.conversationId) {
        toast.warning('Load a conversation before revising YOps.');
        return null;
      }

      const parsed = parseWorkspaceScript(selectScriptText(store));
      if (!parsed.ok) {
        toast.warning('Fix the YOps YAML before asking AI to revise.', {
          description: parsed.error,
        });
        return null;
      }
      if (parsed.ops.length === 0) {
        toast.warning('No YOps to revise.');
        return null;
      }

      setIsRevising(true);
      setError(null);
      try {
        const revision = await requestYOpsRevision({
          conversationId: store.conversationId,
          feedback: trimmed,
          yops: parsed.ops as unknown as Record<string, unknown>[],
          trees: store.tree.trees,
          relations: store.tree.relations,
          turns: selectEffectiveTurns(store),
          provider: selectedProvider ?? sessionProvider ?? undefined,
          model: selectedModel ?? sessionModel ?? undefined,
        });
        setResult(revision);

        if (revision.kind === 'ok') {
          if (revision.dry_run.preview) {
            useWorkspaceStore.getState().setDraft({
              ops: revision.ops,
              tree: revision.dry_run.preview,
            });
          } else {
            useWorkspaceStore
              .getState()
              .setEditorOverride(serializeRevisionCandidate(revision.ops));
          }
          toast.success('Revised YOps are ready to review.');
        } else if (revision.kind === 'validation_failed') {
          useWorkspaceStore.getState().setEditorOverride(serializeRevisionCandidate(revision.ops));
          toast.warning('AI revision needs review before it can apply.', {
            description: revision.dry_run.error?.message,
          });
        } else {
          toast.warning('AI revision did not return valid YOps.', {
            description: revision.message,
          });
        }

        return revision;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'YOps revision failed.';
        setError(message);
        toast.error(message);
        return null;
      } finally {
        setIsRevising(false);
      }
    },
    [selectedModel, selectedProvider, sessionModel, sessionProvider]
  );

  return {
    isRevising,
    result,
    error,
    revise,
  };
}
