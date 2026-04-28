import type { SourcedYOp } from '@t3x-dev/core';
import { parseYOpsYaml } from '@t3x-dev/core';
import * as yaml from 'js-yaml';
import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { commitOps } from '@/commands/yops/yopsService';
import {
  type ApplyPayloadPolicy,
  deriveWorkspaceScriptState,
  getApplyPolicyForScriptState,
} from '@/domain/yops/scriptApplyPolicy';
import { serializeOpsToYaml } from '@/domain/yops/serializeOps';
import { hydrateConversationToStore } from '@/hooks/conversations/hydrateConversationToStore';
import { useChatStore } from '@/store/chatStore';
import {
  selectActiveUncommittedRowCount,
  selectIsInheritedBaselineOnly,
  useWorkspaceStore,
} from '@/store/workspaceStore';

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

function commitOptionsFromPolicy(payload: ApplyPayloadPolicy) {
  switch (payload.kind) {
    case 'candidate':
      return { replaceActiveLLMDraft: true };
    case 'replace_active_script':
      return { replaceActiveLLMDraft: false, replaceActiveScript: true };
    case 'repair':
      return { replaceActiveLLMDraft: false, repairYopsLogId: payload.repairYopsLogId };
    case 'append':
      return { replaceActiveLLMDraft: false };
    case 'none':
      return null;
  }
}

export function useScriptExecution() {
  const opsLog = useWorkspaceStore((s) => s.opsLog);
  const scriptDirty = useWorkspaceStore((s) => s.scriptDirty);
  const scriptText = useWorkspaceStore((s) => s.scriptText);
  const hasDraft = useWorkspaceStore((s) => s.hasDraft);
  const mode = useWorkspaceStore((s) => s.mode);
  const replayWarningRowId = useWorkspaceStore((s) => s.replayWarning?.rowId);
  const activeUncommittedRowCount = useWorkspaceStore(selectActiveUncommittedRowCount);
  const hasInheritedBaseline = useWorkspaceStore(selectIsInheritedBaselineOnly);
  const scriptState = deriveWorkspaceScriptState({
    hasDraft,
    scriptDirty,
    activeOpCount: opsLog.length,
    activeUncommittedRowCount,
    replayWarningRowId,
  });
  const applyPolicy = getApplyPolicyForScriptState({
    state: scriptState,
    scriptDirty,
    replayWarningRowId,
    mode,
    hasInheritedBaseline,
    activeOpCount: opsLog.length,
    activeUncommittedRowCount,
  });

  // Sync committed opsLog → scriptText so the editor reflects what
  // AfterPanel renders when no draft is staged. Once Extract stages a
  // draft, `useExtraction` owns the script content (via setDraft +
  // setScriptText). Once the user starts editing, `scriptDirty` owns it
  // — but only if the dirty content is actually meaningful.
  //
  // The gate intentionally distinguishes "real manual edit" from "empty
  // dirty marker". A non-empty dirty script is protected from being
  // overwritten by a fresh hydrate of committed ops; an empty dirty
  // marker (`scriptText.trim() === ''`) is treated as no meaningful
  // content and the mirror runs anyway, clearing the stale dirty flag.
  // Without this carve-out, an in-session state where `scriptDirty=true`
  // but `scriptText=''` (e.g. a transient code path that flipped the
  // flag without actually writing edits) leaves the editor blank even
  // though `opsLog.length > 0` and the AfterPanel header reads
  // "Committed result" — a UI coherence violation.
  useEffect(() => {
    if (hasDraft) return;
    if (opsLog.length === 0) return;
    if (scriptDirty && scriptText.trim() !== '') return;
    const yaml = serializeOpsToYaml(opsLog);
    // Idempotent guard: if the editor already shows the canonical
    // mirror, don't write again. This avoids spurious setScriptText
    // calls that would re-trigger the effect's deps and loop, and
    // keeps `scriptDirty` quiet when nothing actually changed.
    if (yaml === scriptText && !scriptDirty) return;
    const store = useWorkspaceStore.getState();
    store.setScriptText(yaml);
    if (scriptDirty) store.setScriptDirty(false);
  }, [opsLog, scriptDirty, hasDraft, scriptText]);

  const execute = useCallback(async () => {
    const store = useWorkspaceStore.getState();
    const convId = store.conversationId;
    const projectId = useChatStore.getState().activeProjectId;
    if (!convId || !projectId) return;

    const currentReplayWarningRowId = store.replayWarning?.rowId;
    const currentActiveUncommittedRowCount = selectActiveUncommittedRowCount(store);
    const currentScriptState = deriveWorkspaceScriptState({
      hasDraft: store.hasDraft,
      scriptDirty: store.scriptDirty,
      activeOpCount: store.opsLog.length,
      activeUncommittedRowCount: currentActiveUncommittedRowCount,
      replayWarningRowId: currentReplayWarningRowId,
    });
    const currentPolicy = getApplyPolicyForScriptState({
      state: currentScriptState,
      scriptDirty: store.scriptDirty,
      replayWarningRowId: currentReplayWarningRowId,
      mode: store.mode,
      hasInheritedBaseline: selectIsInheritedBaselineOnly(store),
      activeOpCount: store.opsLog.length,
      activeUncommittedRowCount: currentActiveUncommittedRowCount,
    });
    if (!currentPolicy.canApply) return;

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

    const commitOptions = commitOptionsFromPolicy(currentPolicy.payload);
    if (!commitOptions) return;

    try {
      store.setMode('committing');
      await commitOps(convId, sourced, commitOptions);
    } catch (err) {
      // Commit failed — yops_log was NOT written; the draft is still
      // applicable, leave it staged so the user can retry. This is the
      // only path that preserves the draft.
      const msg = err instanceof Error ? err.message : 'Execution failed';
      useWorkspaceStore.getState().setMode('idle');
      useWorkspaceStore.getState().setError(msg);
      toast.error(msg);
      return;
    }

    // Commit succeeded — the draft is now in yops_log. Clear local
    // draft state IMMEDIATELY (before hydrate) so a hydrate failure
    // or a page refresh can't restore an already-applied draft and
    // let the user duplicate-apply against the server. This is the
    // split-failure case persistence opened up: previously the draft
    // was only cleared after hydrate resolved, so a hydrate error left
    // the persisted entry intact and an F5 would re-stage applied ops.
    {
      const post = useWorkspaceStore.getState();
      post.setScriptDirty(false);
      post.clearDraft();
    }

    try {
      await hydrateConversationToStore(projectId, convId);
      useWorkspaceStore.getState().setMode('executed');
    } catch (hydrateErr) {
      // Commit landed in yops_log but the post-commit refresh failed
      // (network blip, replay error, etc.). The draft is correctly
      // cleared above; the only remaining problem is that the UI's
      // tree / opsLog are stale. Surface a distinct error so the user
      // knows the apply succeeded and a manual reload is the fix —
      // don't put it on the same toast as commit failure.
      const msg = hydrateErr instanceof Error ? hydrateErr.message : 'Refresh failed';
      useWorkspaceStore.getState().setMode('idle');
      useWorkspaceStore
        .getState()
        .setError(
          `Applied — but workspace refresh failed: ${msg}. Reload the page to see the result.`
        );
      toast.error('Applied — but workspace refresh failed. Reload to see the result.');
    }
  }, []);

  // Apply is enabled when there's something un-applied to apply: a fresh
  // draft from Extract (`hasDraft`) or a manual edit (`scriptDirty`). A
  // clean script that mirrors committed state is a no-op and keeps the
  // button disabled.
  const disabledReason = applyPolicy.canApply ? null : applyPolicy.tooltip;

  return { execute, canRun: applyPolicy.canApply, disabledReason, scriptState, applyPolicy };
}
