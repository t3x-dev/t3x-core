/**
 * Shared Extraction Pipeline
 *
 * An async generator that yields PipelineEvents at each step of the
 * semantic extraction flow. This is the single source of truth for
 * pipeline logic — consumed by both the POST handler and the SSE
 * streaming endpoint.
 *
 * The generator owns no HTTP concerns. Callers decide how to surface
 * events (collect into a response object, stream as SSE, etc.).
 */

import { createHash } from 'node:crypto';
import {
  applyYOps,
  buildMemoryFromPins,
  checkDiffCompatibility,
  checkReadiness,
  computeSessionContext,
  DEFAULT_STYLE,
  decideAction,
  detectAmbiguity,
  detectDrift,
  type ExtractionResult,
  type ExtractionStyleConfig,
  type ExtractionTurn,
  Extractor,
  flattenTrees,
  GateRunner,
  pipelineEmitter,
  preFilterDrift,
  runTransforms,
  type SemanticContent,
} from '@t3x-dev/core';

/**
 * Internal extension of TreeNode used by the extraction pipeline.
 * The DB schema stores `source` and `slot_quotes` per node; after
 * replaying YOps from the DB these extra fields are present at runtime
 * even though the public TreeNode type no longer declares them.
 */
interface EnrichedTreeNode {
  key: string;
  slots: Record<string, import('@t3x-dev/core').SlotValue>;
  children: EnrichedTreeNode[];
  source?: string;
  slot_quotes?: Record<string, string>;
}

import {
  type AnyDB,
  createTopic,
  deleteYOpsLogEntry,
  findConversationById,
  findLeafById,
  findProjectById,
  findTurnsByConversation,
  findUserById,
  getPinsByIds,
  insertYOpsLogEntry,
  listTopicsByConversation,
  listYOpsLogByConversation,
  listYOpsLogByTopic,
  recordEvent,
  setAliasIfNull,
} from '@t3x-dev/storage';
import { pinoLogger } from '../middleware/logger';
import { ExtractionStyleSchema } from '../schemas/contracts';
import { getDB } from './db';
import { getProviderRegistry } from './provider-registry';
import { rebuildTreesFromSnapshot } from './tree-state-sync';
import { recordUsageFireAndForget, wrapWithUsageTracking } from './usage-tracking';
import { replayYOpsLog, toYOpsLogEntries } from './yops-log-utils';

// ═══════════════════════════════════════════════════════════════════════════
// Alias derivation helpers (T6)
// ═══════════════════════════════════════════════════════════════════════════

const ALIAS_FORMAT = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * Sanitize a YAML root key into a valid alias candidate. Falls back to
 * `topic_<8-char sha256 hash>` derived from `conversationId` when sanitization
 * cannot produce an alias that satisfies ALIAS_FORMAT.
 *
 * Exported for unit testing.
 */
export function deriveAliasCandidate(rootKey: string, conversationId = 'conv_unknown'): string {
  const sanitized = rootKey
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 64);

  if (ALIAS_FORMAT.test(sanitized)) return sanitized;

  // Fallback: stable hash of the conversation id (8 hex chars).
  const hash = createHash('sha256').update(conversationId).digest('hex').slice(0, 8);
  return `topic_${hash}`;
}

interface MaybeAssignAliasArgs {
  db: AnyDB;
  conversation: { conversationId: string; projectId: string; alias: string | null };
  rootKey: string;
  setAliasIfNull: typeof import('@t3x-dev/storage').setAliasIfNull;
}

/**
 * If the conversation has no alias yet, derive one from `rootKey` and try
 * to set it. The `conversations.alias` UPDATE trigger emits
 * `conversation.renamed` automatically when the alias changes — this helper
 * does NOT broadcast. Failures are logged and swallowed — alias derivation
 * MUST NOT block extraction success.
 *
 * Exported for unit testing.
 */
export async function maybeAssignAlias(args: MaybeAssignAliasArgs): Promise<void> {
  const { db, conversation, rootKey, setAliasIfNull } = args;
  if (conversation.alias) return;

  try {
    const candidate = deriveAliasCandidate(rootKey, conversation.conversationId);
    await setAliasIfNull(db, conversation.conversationId, candidate);
  } catch (err) {
    pinoLogger.warn(
      { err, conversationId: conversation.conversationId },
      'Alias derivation failed (extraction continues)'
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface PipelineEvent {
  type:
    | 'status'
    | 'yop'
    | 'reorganized'
    | 'gate'
    | 'advisory'
    | 'drift'
    | 'skipped'
    | 'done'
    | 'error';
  data: Record<string, unknown>;
}

export interface ExtractionPipelineParams {
  conversationId: string;
  projectId: string;
  turnHashes?: string[];
  driftDecision?: { choice: string; relation?: string; new_topic?: string };
  topicId?: string;
  forceExtract?: boolean;
  userId?: string;
  sourcePinIds?: string[];
  /** Per-request extraction style override (takes precedence over project/user defaults) */
  style?: ExtractionStyleConfig;
}

// ═══════════════════════════════════════════════════════════════════════════
// Pipeline Generator
// ═══════════════════════════════════════════════════════════════════════════

/**
 * IMPORTANT: This function does NOT perform authorization checks.
 * Callers MUST verify project access before invoking this generator
 * (e.g., via assertProjectAccess in HTTP route handlers).
 */
export async function* runExtractionPipeline(
  params: ExtractionPipelineParams
): AsyncGenerator<PipelineEvent> {
  const {
    conversationId,
    turnHashes,
    driftDecision,
    topicId,
    forceExtract,
    userId,
    style: requestStyle,
  } = params;

  try {
    const db = await getDB();

    // ── 1. Validate conversation ──
    const conversation = await findConversationById(db, conversationId);
    if (!conversation) {
      yield {
        type: 'error',
        data: {
          code: 'CONVERSATION_NOT_FOUND',
          message: `Conversation not found: ${conversationId}`,
        },
      };
      return;
    }

    // ── 2. Fetch conversation turns ──
    const allTurns = await findTurnsByConversation(db, {
      conversationId,
      limit: 500,
    });

    if (allTurns.length === 0) {
      yield {
        type: 'error',
        data: { code: 'CONVERSATION_NOT_FOUND', message: 'No turns found for this conversation' },
      };
      return;
    }

    // Filter to specific turn hashes if provided
    const selectedTurns = turnHashes
      ? allTurns.filter((t) => turnHashes.includes(t.turnHash))
      : allTurns;

    if (selectedTurns.length === 0) {
      yield {
        type: 'error',
        data: { code: 'INVALID_REQUEST', message: 'None of the specified turn_hashes were found' },
      };
      return;
    }

    // ── 3. Resolve extraction style: request -> project -> user -> default ──
    const projectRecord = await findProjectById(db, conversation.projectId);
    let resolvedStyle: ExtractionStyleConfig = DEFAULT_STYLE;
    if (requestStyle) {
      resolvedStyle = requestStyle;
    } else if (projectRecord?.extractionStyle) {
      const parsed = ExtractionStyleSchema.safeParse(projectRecord.extractionStyle);
      if (parsed.success) {
        resolvedStyle = parsed.data;
      }
    } else if (userId) {
      const user = await findUserById(db, userId);
      if (user?.default_extraction_style) {
        const parsed = ExtractionStyleSchema.safeParse(user.default_extraction_style);
        if (parsed.success) {
          resolvedStyle = parsed.data;
        }
      }
    }

    // ── 4. Fetch existing yops log and build current snapshot ──
    let yopsRecords = topicId
      ? await listYOpsLogByTopic(db, conversationId, topicId)
      : await listYOpsLogByConversation(db, conversationId);

    // When forceExtract, clear existing log entries to avoid duplicates on replay
    if (forceExtract && yopsRecords.length > 0) {
      for (const record of yopsRecords) {
        await deleteYOpsLogEntry(db, record.id);
      }
      yopsRecords = [];
    }

    const currentSnapshot = replayYOpsLog(toYOpsLogEntries(yopsRecords));
    const currentFlat = flattenTrees(currentSnapshot.trees);

    // ── 5. Convert turns to ExtractionTurn format ──
    const extractionTurns: ExtractionTurn[] = selectedTurns.map((t) => ({
      role: t.role as ExtractionTurn['role'],
      content: t.content,
      turn_hash: t.turnHash,
    }));

    // 5b. Calculate processedTurnCount
    let processedTurnCount: number | undefined;
    if (yopsRecords.length > 0 && currentFlat.length > 0) {
      const lastEntry = yopsRecords[yopsRecords.length - 1];
      const lastExtractionTime = new Date(lastEntry.createdAt).getTime();
      processedTurnCount = selectedTurns.filter(
        (t) => new Date(t.createdAt).getTime() <= lastExtractionTime
      ).length;
    }

    // ── Step 1: SessionStateManager ──
    if (!driftDecision && !forceExtract) {
      const sessionCtx = computeSessionContext(
        yopsRecords.map((d) => d.source),
        processedTurnCount ?? 0,
        selectedTurns.length
      );
      const decision = decideAction(sessionCtx);

      yield {
        type: 'status',
        data: { step: 'session_state', result: decision === 'extract' ? 'proceed' : decision },
      };

      if (decision === 'wait') {
        yield {
          type: 'skipped',
          data: { reason: 'wait' },
        };
        return;
      }
      // 'skip' is advisory — log but don't block
    }

    // ── Step 2: ReadinessGate ──
    if (!driftDecision && !forceExtract) {
      const isFirstExtraction = currentFlat.length === 0;
      const readiness = checkReadiness(
        selectedTurns.map((t) => ({ role: t.role, content: t.content })),
        isFirstExtraction
      );

      yield {
        type: 'status',
        data: {
          step: 'readiness_gate',
          result: readiness.pass ? 'proceed' : 'blocked',
          reason: readiness.reason,
        },
      };

      if (!readiness.pass) {
        yield {
          type: 'skipped',
          data: { reason: readiness.reason },
        };
        return;
      }
    }

    // ── Step 3: DriftDetector ──
    if (!driftDecision && currentFlat.length > 0) {
      const extractionCount = yopsRecords.filter(
        (d) => d.source === 'pipeline' || d.source === 'llm_extraction'
      ).length;

      if (extractionCount >= 2) {
        const frameTypes = currentFlat.map((f) => f.type);
        const slotValues = currentFlat.flatMap((f) =>
          Object.values(f.slots).filter((v): v is string => typeof v === 'string')
        );
        const newTurnContent = selectedTurns
          .filter((t) => {
            if (!processedTurnCount) return true;
            return selectedTurns.indexOf(t) >= processedTurnCount;
          })
          .map((t) => t.content)
          .join(' ');

        if (newTurnContent) {
          const preFilter = preFilterDrift(newTurnContent, frameTypes, slotValues);

          if (preFilter.needsLLM) {
            try {
              const reg = await getProviderRegistry();
              const driftResult = await reg.tryWithFallback('generation', (provider) => {
                const recentTurns = selectedTurns.slice(-3).map((t) => ({
                  role: t.role,
                  content: t.content,
                }));
                const topicName = currentFlat[0]?.type ?? 'unknown';
                // biome-ignore lint/suspicious/noExplicitAny: generic provider cast
                return detectDrift(provider as any, topicName, frameTypes, recentTurns);
              });

              if (driftResult.drifted) {
                yield {
                  type: 'drift',
                  data: {
                    relation: driftResult.relationType,
                    new_topic: driftResult.newTopicName,
                    old_topic: currentFlat[0]?.type,
                    choices: ['keep_old', 'keep_new', 'keep_both_separate', 'keep_both_together'],
                  },
                };
                return;
              }
            } catch {
              // Drift detection failure -> continue with extraction (fail-safe)
            }
          }
        }
      }
    }

    // Drift check passed (or skipped) — signal to client
    yield { type: 'status', data: { step: 'drift_check', result: 'clear' } };

    // ── 3b. Build additional context from pinned sources ──
    let additionalContext: string | undefined;
    if (params.sourcePinIds && params.sourcePinIds.length > 0) {
      try {
        const pinRecords = await getPinsByIds(db, params.sourcePinIds);
        const conversations = new Map<
          string,
          { id: string; title: string; turns: Array<{ role: string; content: string }> }
        >();
        const leavesMap = new Map<string, import('@t3x-dev/core').Leaf>();

        for (const pin of pinRecords) {
          if (pin.type === 'conversation') {
            const conv = await findConversationById(db, pin.ref_id);
            if (conv) {
              const turns = await findTurnsByConversation(db, {
                conversationId: pin.ref_id,
                limit: 200,
              });
              conversations.set(pin.ref_id, {
                id: conv.id,
                title: conv.title ?? 'Untitled',
                turns: turns.map((t) => ({ role: t.role, content: t.content })),
              });
            }
          } else if (pin.type === 'leaf') {
            const leaf = await findLeafById(db, pin.ref_id);
            if (leaf) {
              leavesMap.set(pin.ref_id, leaf);
            }
          }
        }

        const builtContext = buildMemoryFromPins({
          projectPins: pinRecords,
          conversations,
          leaves: leavesMap,
        });

        if (builtContext.text.trim().length > 0) {
          additionalContext = builtContext.text;
        }
      } catch (pinErr) {
        console.warn(
          `[pipeline] Failed to load pinned context: ${pinErr instanceof Error ? pinErr.message : String(pinErr)}`
        );
        // Non-fatal — continue extraction without additional context
      }
    }

    // ── Step 4: Extractor — LLM extraction via provider registry ──
    yield { type: 'status', data: { step: 'extracting' } };

    // Record extraction.started (realtime-listener relays to WS clients)
    await recordEvent(db, {
      type: 'extraction.started',
      projectId: conversation.projectId,
      conversationId,
    });

    const reg = await getProviderRegistry();
    const trackedUsage = { inputTokens: 0, outputTokens: 0 };
    let trackedModel = 'unknown';
    const result = await reg.tryWithFallback(
      'generation',
      (provider): Promise<ExtractionResult> => {
        // biome-ignore lint/suspicious/noExplicitAny: generic provider cast
        const { provider: tracked, usage } = wrapWithUsageTracking(provider as any);
        trackedUsage.inputTokens = 0;
        trackedUsage.outputTokens = 0;
        trackedModel = tracked.id;
        const extractor = new Extractor(tracked);
        return extractor
          .extract(
            {
              turns: extractionTurns,
              snapshot: currentFlat.length > 0 ? currentSnapshot : undefined,
              processedTurnCount,
              additionalContext,
            },
            resolvedStyle
          )
          .then((r: ExtractionResult) => {
            trackedUsage.inputTokens = usage.inputTokens;
            trackedUsage.outputTokens = usage.outputTokens;
            return r;
          });
      }
    );

    // Check extraction result
    if (!result.ok) {
      yield {
        type: 'error',
        data: { code: 'EXTRACTION_FAILED', message: result.error },
      };
      return;
    }

    // Record usage (fire-and-forget)
    if (trackedUsage.inputTokens || trackedUsage.outputTokens) {
      recordUsageFireAndForget(db, {
        user_id: userId ?? undefined,
        project_id: conversation.projectId,
        endpoint: 'extract_frames',
        model: trackedModel,
        input_tokens: trackedUsage.inputTokens,
        output_tokens: trackedUsage.outputTokens,
      });
    }

    // Yield each YOp from the extraction (with index/total for client-side progress)
    // Synthesize YOp events if extractor returned empty delta but has a snapshot
    if (result.yops.length === 0 && result.snapshot.trees.length > 0) {
      // First-time tree extraction or restructure: synthesize add YOps from snapshot nodes
      // so the YOpsFeed has items to display
      const synthYops = result.snapshot.trees.flatMap((tree) => {
        const yops: Record<string, unknown>[] = [
          { define: { path: tree.key }, index: 0, total: 0 },
          {
            populate: {
              path: tree.key,
              values: Object.fromEntries(Object.entries(tree.slots).slice(0, 3)),
            },
            index: 0,
            total: 0,
          },
        ];
        for (const child of tree.children) {
          yops.push({
            define: { path: `${tree.key}/${child.key}` },
            index: 0,
            total: 0,
          });
          yops.push({
            populate: {
              path: `${tree.key}/${child.key}`,
              values: Object.fromEntries(Object.entries(child.slots).slice(0, 3)),
            },
            index: 0,
            total: 0,
          });
        }
        return yops;
      });
      // Set correct index/total
      for (let i = 0; i < synthYops.length; i++) {
        synthYops[i].index = i;
        synthYops[i].total = synthYops.length;
      }
      // Yield synthesized YOps
      for (let i = 0; i < synthYops.length; i++) {
        yield { type: 'yop' as const, data: synthYops[i] };
      }
    } else {
      for (let i = 0; i < result.yops.length; i++) {
        yield {
          type: 'yop' as const,
          data: { ...result.yops[i], index: i, total: result.yops.length },
        };
      }
    }

    // ── Step 5: Post-extraction transforms (deterministic) ──
    yield { type: 'status', data: { step: 'reorganizing' } };

    let organizedSnapshot: SemanticContent = result.snapshot;
    let changesSummary: Record<string, unknown> | undefined;

    try {
      const isIncremental = currentFlat.length > 0;
      const transformResult = runTransforms(
        result.snapshot,
        extractionTurns.map((t) => ({ role: t.role, content: t.content })),
        isIncremental ? currentSnapshot : undefined
      );
      organizedSnapshot = transformResult.content;

      // Re-apply slot_quotes and source from pre-transform snapshot.
      // Transforms strip metadata, so we match by BOTH path AND node key
      // to handle tree restructuring (nesting, renaming).
      // NOTE: EnrichedTreeNode extends the public TreeNode with extraction metadata
      // fields (source, slot_quotes) stored in the DB but not part of the core type.
      type NodeMeta = { source?: string; slot_quotes?: Record<string, string> };
      const metaByPath = new Map<string, NodeMeta>();
      const metaByKey = new Map<string, NodeMeta>();
      const collectMeta = (node: EnrichedTreeNode, prefix: string) => {
        const path = prefix ? `${prefix}/${node.key}` : node.key;
        if (node.source || node.slot_quotes) {
          const meta = { source: node.source, slot_quotes: node.slot_quotes };
          metaByPath.set(path, meta);
          // Also index by bare key for fallback matching after restructuring
          if (!metaByKey.has(node.key)) {
            metaByKey.set(node.key, meta);
          }
        }
        for (const child of node.children ?? []) collectMeta(child, path);
      };
      for (const tree of result.snapshot.trees as EnrichedTreeNode[]) collectMeta(tree, '');

      const applyMeta = (node: EnrichedTreeNode, prefix: string) => {
        const path = prefix ? `${prefix}/${node.key}` : node.key;
        // Try exact path first, then fall back to bare key
        const meta = metaByPath.get(path) ?? metaByKey.get(node.key);
        if (meta) {
          if (meta.source && !node.source) node.source = meta.source;
          if (meta.slot_quotes && !node.slot_quotes) node.slot_quotes = meta.slot_quotes;
        }
        for (const child of node.children ?? []) applyMeta(child, path);
      };
      for (const tree of organizedSnapshot.trees as EnrichedTreeNode[]) applyMeta(tree, '');

      // ── Deterministic metadata verifier ──
      // Contract: every slot quote MUST be a verbatim substring of a conversation turn.
      // No fuzzy matching, no synthesis — the audit trail must be 100% deterministic.
      // If the LLM didn't provide a verifiable quote, the slot has no source tracing
      // (slot_quote is simply absent — no guessing).
      const verifyMetadata = (trees: EnrichedTreeNode[], turns: Array<{ content: string }>) => {
        const turnsLower = turns.map((t) => t.content.toLowerCase());

        const walk = (node: EnrichedTreeNode) => {
          if (!node.slot_quotes) node.slot_quotes = {};

          const verifiedQuotes: Record<string, string> = {};
          const turnVotes: Record<number, number> = {};

          for (const [key, quote] of Object.entries(node.slot_quotes)) {
            if (typeof quote !== 'string' || !quote) continue;
            const quoteLower = quote.toLowerCase();
            // Only keep if verbatim substring of some turn
            for (let i = 0; i < turnsLower.length; i++) {
              if (turnsLower[i].includes(quoteLower)) {
                verifiedQuotes[key] = quote;
                turnVotes[i] = (turnVotes[i] ?? 0) + 1;
                break;
              }
            }
          }

          // Also try to verify slot values themselves (in case LLM skipped metadata
          // but produced verbatim values). Still 100% deterministic — substring only.
          for (const [key, val] of Object.entries(node.slots)) {
            if (verifiedQuotes[key]) continue;
            if (typeof val !== 'string') continue;
            const valLower = val.toLowerCase();
            for (let i = 0; i < turnsLower.length; i++) {
              const idx = turnsLower[i].indexOf(valLower);
              if (idx !== -1) {
                verifiedQuotes[key] = turns[i].content.slice(idx, idx + val.length);
                turnVotes[i] = (turnVotes[i] ?? 0) + 1;
                break;
              }
            }
          }

          node.slot_quotes = verifiedQuotes;

          // Verify source: must be a valid turn tag AND match a slot_quote's turn
          if (node.source) {
            const match = node.source.match(/^T(\d+)/);
            if (!match || Number(match[1]) < 1 || Number(match[1]) > turns.length) {
              node.source = undefined;
            }
          }
          if (!node.source && Object.keys(turnVotes).length > 0) {
            const bestTurn = Object.entries(turnVotes).reduce((a, b) => (b[1] > a[1] ? b : a));
            node.source = `T${Number(bestTurn[0]) + 1}`;
          }

          for (const child of node.children ?? []) walk(child);
        };

        for (const tree of trees) walk(tree);
      };

      const turnsForValidation = selectedTurns.map((t) => ({ content: t.content }));
      verifyMetadata(organizedSnapshot.trees as EnrichedTreeNode[], turnsForValidation);

      changesSummary = {
        transforms: ['consolidate', 'nest', 'flagContradictions', 'checkRegression'],
        regressionWarnings: transformResult.regressionWarnings,
      };

      if (transformResult.regressionWarnings.length > 0) {
        for (const w of transformResult.regressionWarnings) {
          console.warn(`[transforms] ${w.type}: ${w.message}`);
        }
      }
    } catch (transformErr) {
      console.warn(
        `[transforms] Error: ${transformErr instanceof Error ? transformErr.message : String(transformErr)}`
      );
      // Transforms are optional — raw extraction is still valid
    }

    // ── Code-based structure enforcement ──
    // Single-root: if multiple roots exist and no drift was detected, nest smaller roots under the largest
    // Uses move YOps so the restructuring is captured in the yops log and replayable
    if (organizedSnapshot.trees.length > 1 && !driftDecision) {
      const countSlots = (node: {
        slots: Record<string, unknown>;
        children: Array<{ slots: Record<string, unknown>; children: any[] }>;
      }): number =>
        Object.keys(node.slots).length +
        (node.children || []).reduce((sum: number, c: any) => sum + countSlots(c), 0);

      const sorted = [...organizedSnapshot.trees].sort((a, b) => countSlots(b) - countSlots(a));
      const largestKey = sorted[0].key;
      const moveOps: import('@t3x-dev/core').YOp[] = [];
      for (let i = 1; i < sorted.length; i++) {
        moveOps.push({ move: { path: sorted[i].key, to: `${largestKey}/${sorted[i].key}` } });
      }
      if (moveOps.length > 0) {
        const nestResult = applyYOps(organizedSnapshot, moveOps);
        if (nestResult.ok) {
          organizedSnapshot = { trees: nestResult.trees, relations: nestResult.relations };
          // Prepend move ops to result.yops so they're persisted
          result.yops.push(...moveOps);
        }
      }
    }

    yield {
      type: 'reorganized',
      data: { snapshot: organizedSnapshot, changes_summary: changesSummary },
    };

    // ── Step 6: VALIDATE — GateRunner + DiffCompatibilityCheck ──
    yield { type: 'status', data: { step: 'validating' } };

    let gateResult: unknown;
    try {
      const gateRunner = new GateRunner();
      const gr = await gateRunner.run(organizedSnapshot, {
        turns: extractionTurns.map((t) => ({ role: t.role, content: t.content })),
        skipSemantic: true,
        skipBusiness: true,
      });
      gateResult = gr;

      if (!gr.structure.passed) {
        yield {
          type: 'error',
          data: {
            code: 'EXTRACTION_FAILED',
            message: `Structural validation failed: ${JSON.stringify(gr.structure.checks)}`,
          },
        };
        return;
      }
    } catch (gateErr) {
      console.warn(
        `[gate] Gate check error: ${gateErr instanceof Error ? gateErr.message : String(gateErr)}`
      );
      // Gate failure is non-fatal for extraction — continue
    }

    // DiffCompatibilityCheck (non-blocking, log only)
    if (currentFlat.length > 0) {
      const diffCheck = checkDiffCompatibility(currentSnapshot, result.yops);
      if (!diffCheck.compatible) {
        console.warn(`[gate] DiffCompatibilityCheck warnings: ${diffCheck.errors.join('; ')}`);
      }
    }

    yield { type: 'gate', data: { gate_result: gateResult } };

    // ── Step 7: AmbiguityDetector (advisory-only) ──
    let advisoryQuestions: unknown[] | undefined;
    try {
      const reg3 = await getProviderRegistry();
      const ambiguityResult = await reg3.tryWithFallback('generation', (ambProvider) => {
        const recentTurns = selectedTurns.slice(-5).map((t) => ({
          role: t.role,
          content: t.content,
        }));
        // biome-ignore lint/suspicious/noExplicitAny: generic provider cast
        return detectAmbiguity(ambProvider as any, organizedSnapshot, recentTurns);
      });
      if (!ambiguityResult.clean) {
        advisoryQuestions = ambiguityResult.questions;
        pipelineEmitter.emit('question.generated', {
          conversationId,
          questions: ambiguityResult.questions,
        });
      }
    } catch {
      // Ambiguity detection failure -> continue without questions
    }

    if (advisoryQuestions && advisoryQuestions.length > 0) {
      yield { type: 'advisory', data: { questions: advisoryQuestions } };
    }

    // ── 8. Auto-create topic on first extraction if none exists ──
    let resolvedTopicId = topicId;
    if (!resolvedTopicId) {
      const existingTopics = await listTopicsByConversation(db, conversationId);
      if (existingTopics.length === 0 && organizedSnapshot.trees.length > 0) {
        const rootNode = organizedSnapshot.trees[0];
        const newTopic = await createTopic(db, {
          conversationId,
          projectId: conversation.projectId,
          name: rootNode.key,
        });
        resolvedTopicId = newTopic.id;
      } else if (existingTopics.length === 1) {
        resolvedTopicId = existingTopics[0].id;
      }
    }

    // 8b. Check for drift_detected via empty extraction result
    // Only flag drift if there was previously extracted content — on first
    // extraction, empty result means extraction failed, not drift.
    if (result.yops.length === 0 && organizedSnapshot.trees.length === 0) {
      if (currentFlat.length > 0) {
        // Existing content + empty new result → possible topic shift
        pipelineEmitter.emit('topic.changed', {
          conversationId,
          oldTopic: currentFlat[0]?.type,
          newTopic: 'unknown',
        });
        yield {
          type: 'drift',
          data: {
            old_topic: currentFlat[0]?.type,
            choices: ['keep_old', 'keep_new', 'keep_both_separate', 'keep_both_together'],
          },
        };
        return;
      }
      // First extraction returned nothing — skip, not drift
      yield {
        type: 'skipped',
        data: { reason: 'No extractable content found in the conversation.' },
      };
      return;
    }

    // ── 8c. Persist: write yops_log + sync trees atomically ──
    yield { type: 'status', data: { step: 'persisting' } };

    // biome-ignore lint/suspicious/noExplicitAny: transaction typing
    const record = await (db as any).transaction(async (tx: any) => {
      const rec = await insertYOpsLogEntry(tx, {
        conversationId,
        projectId: conversation.projectId,
        source: 'pipeline',
        yops: result.yops,
        pipelineState: 'completed',
        gateResultJson: gateResult ?? null,
        topicId: resolvedTopicId,
      });
      await rebuildTreesFromSnapshot(
        tx,
        conversationId,
        conversation.projectId,
        organizedSnapshot,
        resolvedTopicId
      );
      return rec;
    });

    // ── Step 8: Emit extraction.completed event ──
    pipelineEmitter.emit('extraction.completed', {
      conversationId,
      projectId: conversation.projectId,
      yopsLogId: record.id,
      yops: result.yops,
      snapshot: organizedSnapshot,
      topicId: resolvedTopicId,
    });

    // ── Derive alias from root tree key (no-op if already set) ──
    // Failures are logged inside maybeAssignAlias and must never block the
    // extraction.done event below. The conversations.alias UPDATE trigger
    // emits conversation.renamed automatically when the alias actually changes.
    const rootKey = organizedSnapshot.trees[0]?.key;
    if (rootKey) {
      const refreshed = await findConversationById(db, conversationId);
      if (refreshed) {
        await maybeAssignAlias({
          db,
          conversation: {
            conversationId: refreshed.conversationId,
            projectId: refreshed.projectId,
            alias: refreshed.alias,
          },
          rootKey,
          setAliasIfNull,
        });
      }
    }

    // Record extraction.done (realtime-listener relays to WS clients)
    await recordEvent(db, {
      type: 'extraction.done',
      projectId: conversation.projectId,
      conversationId,
      payload: { yops_log_id: record.id, source: 'api' },
    });

    // ── Done ──
    yield {
      type: 'done',
      data: {
        status: 'completed',
        yops_log_id: record.id,
        snapshot: organizedSnapshot,
        delta: result.yops,
        gate_result: gateResult,
        advisory_questions: advisoryQuestions,
      },
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AllProvidersFailedError') {
      yield {
        type: 'error',
        data: {
          code: 'LLM_NOT_CONFIGURED',
          message: 'No LLM provider is configured. Set ANTHROPIC_API_KEY or another provider key.',
        },
      };
      return;
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    yield {
      type: 'error',
      data: { code: 'EXTRACTION_FAILED', message },
    };
  }
}
