import type { HumanSource, SourcedYOp } from '@t3x-dev/core';
import { canonicalizeYOps, parseYOpsYaml } from '@t3x-dev/core';
import * as yaml from 'js-yaml';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { SourceValidationError } from '@/commands/yops/errors';
import { buildHumanSource } from '@/commands/yops/goldEditBuilder';
import { commitOps } from '@/commands/yops/yopsService';
import {
  type ApplyPayloadPolicy,
  deriveWorkspaceScriptState,
  getApplyPolicyForScriptState,
} from '@/domain/yops/scriptApplyPolicy';
import { hydrateConversationToStore } from '@/hooks/conversations/hydrateConversationToStore';
import { useChatStore } from '@/store/chatStore';
import {
  selectActiveUncommittedRowCount,
  selectIsInheritedBaselineOnly,
  selectScriptDirty,
  selectScriptText,
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
  const scriptDirty = useWorkspaceStore(selectScriptDirty);
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

  // The committed-mirror sync that previously lived here (opsLog →
  // scriptText writes) is no longer needed. `selectScriptText` derives
  // the editor text from `editorOverride` → `draftOps` → `opsLog` →
  // `''`, so when there's no draft and committed opsLog exists the
  // selector returns the committed YAML automatically — no effect, no
  // dirty-flag bookkeeping, no idempotent guard against re-entrance.
  // This is the structural simplification PR 1 buys us: the entire
  // class of "scriptText drifted from its source" bug is impossible
  // because scriptText is no longer a stored mirror.

  const execute = useCallback(async () => {
    const store = useWorkspaceStore.getState();
    const convId = store.conversationId;
    const projectId = useChatStore.getState().activeProjectId;
    if (!convId || !projectId) return;

    const currentReplayWarningRowId = store.replayWarning?.rowId;
    const currentActiveUncommittedRowCount = selectActiveUncommittedRowCount(store);
    const currentScriptDirty = selectScriptDirty(store);
    const currentScriptState = deriveWorkspaceScriptState({
      hasDraft: store.hasDraft,
      scriptDirty: currentScriptDirty,
      activeOpCount: store.opsLog.length,
      activeUncommittedRowCount: currentActiveUncommittedRowCount,
      replayWarningRowId: currentReplayWarningRowId,
    });
    const currentPolicy = getApplyPolicyForScriptState({
      state: currentScriptState,
      scriptDirty: currentScriptDirty,
      replayWarningRowId: currentReplayWarningRowId,
      mode: store.mode,
      hasInheritedBaseline: selectIsInheritedBaselineOnly(store),
      activeOpCount: store.opsLog.length,
      activeUncommittedRowCount: currentActiveUncommittedRowCount,
    });
    if (!currentPolicy.canApply) return;

    const parseResult = parseScript(selectScriptText(store));
    if (!parseResult.ok) {
      store.setError(`YAML parse error: ${parseResult.error}`);
      toast.error(`YAML parse error: ${parseResult.error}`);
      return;
    }

    // Second canonicalization gate. Manual edits to the Script editor
    // bypass the extractor pipeline, so a user-typed `value: a, b, c`
    // would otherwise apply as a scalar string. Run the same
    // deterministic transform here so both LLM and human paths persist
    // canonical YOps. Mirror of the lift-time gate in providerDraft.ts;
    // see issue #964 for context.
    const ops = canonicalizeYOps(
      parseResult.ops as ReadonlyArray<Record<string, unknown>>
    ) as SourcedYOp[];
    if (ops.length === 0) {
      store.setError('No ops to execute');
      return;
    }

    // Add HumanSource to ops that lack source metadata (manual edits in
    // script). Draft ops from Extract already carry an `llm` source, so
    // they pass through unchanged.
    //
    // The HumanSource is built lazily and only once: when every op
    // already carries source (e.g. an Extract proposal that arrives
    // pre-sourced) Apply must NOT require a session user, because
    // none is needed. Building eagerly would block Apply in
    // auth-disabled / self-hosted contexts where `t3x-user` is absent.
    // Build on first miss; reuse across every other miss so all manual
    // rows share an identical `at` (gold-edit invariant).
    let scriptSource: HumanSource | null = null;
    let sourced: SourcedYOp[];
    try {
      sourced = ops.map((op) => {
        if ((op as Record<string, unknown>).source) return op;
        if (!scriptSource) scriptSource = buildHumanSource('script');
        return { ...op, source: scriptSource };
      }) as SourcedYOp[];
    } catch (err) {
      // No session user — surface a clear error rather than persisting
      // a placeholder identity. Same posture as gold-edit. Only reached
      // when at least one op was missing source.
      const msg =
        err instanceof SourceValidationError
          ? 'Cannot apply: no session user available to attribute the edit.'
          : err instanceof Error
            ? err.message
            : 'Cannot apply: source validation failed.';
      store.setError(msg);
      toast.error(msg);
      return;
    }

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
    // clearDraft routes through writeDraftProposal which nulls the
    // editor override, so selectScriptDirty automatically returns false
    // after this call — no separate dirty-flag clear needed.
    useWorkspaceStore.getState().clearDraft();

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
