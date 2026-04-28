import {
  applyYOps,
  type CompressionV2Metadata,
  type CompressionV2Usage,
  flattenTrees,
  type NodeWithSignals,
  type Relation,
  runCompressionV2Pipeline,
  type SemanticContent,
  type SourcedYOp,
} from '@t3x-dev/core';
import {
  type AnyDB,
  findConversationById,
  listActiveYOpsLogByConversation,
} from '@t3x-dev/storage';
import { resolveProviderAndModel } from './provider-resolver';
import {
  getConversationInheritedBaseline,
  replayEntriesOnBaselineFailFast,
  toYOpsLogEntries,
} from './yops-log-utils';

export interface ApiCompressionV2Input {
  db: AnyDB;
  conversationId: string;
  provider?: string;
  model?: string;
}

export type ApiCompressionV2Result =
  | {
      ok: true;
      snapshot: SemanticContent;
      ops: SourcedYOp[];
      metadata: CompressionV2Metadata;
      usage: CompressionV2Usage;
      model: string;
      projectId: string;
    }
  | {
      ok: false;
      kind:
        | 'conversation_not_found'
        | 'insufficient_nodes'
        | 'empty_result'
        | 'provider_unavailable'
        | 'failure';
      message: string;
      projectId?: string;
    };

/**
 * Compute engagement signals per node by scanning the yops-log timeline.
 * - has_manual_edit: any op from a 'manual' source touched this node
 * - last_touched: number of log entries since last mention (0 = most recent)
 * - mention_count: total references across the log
 */
function computeNodeSignals(
  nodeIds: string[],
  yopsEntries: Array<{ source: string; yops: unknown }>
): Map<string, { has_manual_edit: boolean; last_touched: number; mention_count: number }> {
  const signals = new Map<
    string,
    { has_manual_edit: boolean; last_touched: number; mention_count: number }
  >();

  for (const id of nodeIds) {
    signals.set(id, {
      has_manual_edit: false,
      last_touched: yopsEntries.length,
      mention_count: 0,
    });
  }

  for (let i = 0; i < yopsEntries.length; i++) {
    const entry = yopsEntries[i];
    const isManual = entry.source === 'manual';
    const mentioned = new Set<string>();
    const ops = Array.isArray(entry.yops) ? (entry.yops as Array<Record<string, unknown>>) : [];

    for (const op of ops) {
      let targetId: string | undefined;
      if ('set' in op && op.set && typeof op.set === 'object') {
        targetId = ((op.set as { path?: string }).path ?? '').split('/')[0];
      } else if ('unset' in op && op.unset && typeof op.unset === 'object') {
        targetId = ((op.unset as { path?: string }).path ?? '').split('/')[0];
      } else if ('define' in op && op.define && typeof op.define === 'object') {
        targetId = (op.define as { key?: string }).key;
      } else if ('populate' in op && op.populate && typeof op.populate === 'object') {
        targetId = ((op.populate as { path?: string }).path ?? '').split('/')[0];
      } else if ('drop' in op && op.drop && typeof op.drop === 'object') {
        targetId = ((op.drop as { path?: string }).path ?? '').split('/')[0];
      } else if ('move' in op && op.move && typeof op.move === 'object') {
        targetId = ((op.move as { path?: string }).path ?? '').split('/')[0];
      } else if ('rename' in op && op.rename && typeof op.rename === 'object') {
        targetId = ((op.rename as { path?: string }).path ?? '').split('/')[0];
      }

      if (targetId && signals.has(targetId)) {
        mentioned.add(targetId);
        if (isManual) {
          signals.get(targetId)!.has_manual_edit = true;
        }
      }
    }

    for (const id of mentioned) {
      const sig = signals.get(id)!;
      sig.last_touched = yopsEntries.length - i - 1;
      sig.mention_count += 1;
    }
  }

  return signals;
}

export async function runApiCompressionV2(
  input: ApiCompressionV2Input
): Promise<ApiCompressionV2Result> {
  const conversation = await findConversationById(input.db, input.conversationId);
  if (!conversation) {
    return {
      ok: false,
      kind: 'conversation_not_found',
      message: `Conversation not found: ${input.conversationId}`,
    };
  }

  const yopsRecords = await listActiveYOpsLogByConversation(input.db, input.conversationId);
  const yopsEntries = toYOpsLogEntries(yopsRecords);
  const currentSnapshot = replayEntriesOnBaselineFailFast(
    await getConversationInheritedBaseline(input.db, input.conversationId),
    yopsRecords
  );
  const currentFlat = flattenTrees(currentSnapshot.trees);

  if (currentFlat.length < 2) {
    return {
      ok: false,
      kind: 'insufficient_nodes',
      message: `Not enough nodes to compress (need >= 2, have ${currentFlat.length})`,
      projectId: conversation.projectId,
    };
  }

  const providerResolution = await resolveProviderAndModel(input.provider, input.model);
  if (!providerResolution.ok) {
    return {
      ok: false,
      kind: 'provider_unavailable',
      message: providerResolution.message,
      projectId: conversation.projectId,
    };
  }

  const nodeIds = currentFlat.map((f) => f.id);
  const signalsMap = computeNodeSignals(nodeIds, yopsEntries);
  const nodesWithSignals: NodeWithSignals[] = currentFlat.map((f) => {
    const sig = signalsMap.get(f.id) ?? {
      has_manual_edit: false,
      last_touched: 0,
      mention_count: 1,
    };
    return {
      ...f,
      has_manual_edit: sig.has_manual_edit,
      last_touched: sig.last_touched,
      mention_count: sig.mention_count,
    };
  });

  const relations: Relation[] = currentSnapshot.relations;
  const result = await runCompressionV2Pipeline({
    provider: providerResolution.provider,
    frames: nodesWithSignals,
    relations,
  });

  if (!result.ok) {
    return {
      ok: false,
      kind: 'failure',
      message: result.error,
      projectId: conversation.projectId,
    };
  }

  if (result.yops.length === 0) {
    return {
      ok: false,
      kind: 'empty_result',
      message:
        'No frames were compressed (yops is empty). All frames may be protected or already optimal.',
      projectId: conversation.projectId,
    };
  }

  const applied = applyYOps(currentSnapshot, result.yops);
  const compressedSnapshot: SemanticContent = applied.ok
    ? { trees: applied.trees, relations: applied.relations }
    : currentSnapshot;

  return {
    ok: true,
    snapshot: compressedSnapshot,
    ops: result.yops as SourcedYOp[],
    metadata: result.metadata,
    usage: result.usage,
    model: providerResolution.model,
    projectId: conversation.projectId,
  };
}
