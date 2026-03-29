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

import {
  checkDiffCompatibility,
  checkReadiness,
  computeSessionContext,
  createMeaningPipeline,
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
  type LLMCallLogger,
  pipelineEmitter,
  preFilterDrift,
  type SemanticContent,
} from '@t3x-dev/core';
import {
  createTopic,
  findConversationById,
  findProjectById,
  findTurnsByConversation,
  findUserById,
  insertYOpsLogEntry,
  listTopicsByConversation,
  listYOpsLogByConversation,
  listYOpsLogByTopic,
} from '@t3x-dev/storage';
import { ExtractionStyleSchema } from '../schemas/contracts';
import { getDB } from './db';
import { getProviderRegistry } from './provider-registry';
import { rebuildTreesFromSnapshot } from './tree-state-sync';
import { recordUsageFireAndForget, wrapWithUsageTracking } from './usage-tracking';
import { replayYOpsLog, toYOpsLogEntries } from './yops-log-utils';

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
  const { conversationId, turnHashes, driftDecision, topicId, forceExtract, userId } = params;

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

    // ── 3. Resolve extraction style: project -> user -> default ──
    const projectRecord = await findProjectById(db, conversation.projectId);
    let resolvedStyle: ExtractionStyleConfig = DEFAULT_STYLE;
    if (projectRecord?.extractionStyle) {
      const parsed = ExtractionStyleSchema.safeParse(projectRecord.extractionStyle);
      if (parsed.success) {
        resolvedStyle = parsed.data;
      }
    }
    if (resolvedStyle === DEFAULT_STYLE && !projectRecord?.extractionStyle) {
      if (userId) {
        const user = await findUserById(db, userId);
        if (user?.default_extraction_style) {
          const parsed = ExtractionStyleSchema.safeParse(user.default_extraction_style);
          if (parsed.success) {
            resolvedStyle = parsed.data;
          }
        }
      }
    }

    // ── 4. Fetch existing yops log and build current snapshot ──
    const yopsRecords = topicId
      ? await listYOpsLogByTopic(db, conversationId, topicId)
      : await listYOpsLogByConversation(db, conversationId);
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
        data: { step: 'readiness_gate', result: readiness.pass ? 'proceed' : 'blocked', reason: readiness.reason },
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

    // ── Step 4: Extractor — LLM extraction via provider registry ──
    yield { type: 'status', data: { step: 'extracting' } };

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
    console.log(`[extraction-pipeline] result.yops.length = ${result.yops.length}, snapshot.trees = ${result.snapshot.trees.length}`);
    if (result.yops.length === 0 && result.snapshot.trees.length > 0) {
      // First-time tree extraction or restructure: synthesize add YOps from snapshot nodes
      // so the YOpsFeed has items to display
      const synthYops = result.snapshot.trees.flatMap((tree) => {
        const yops: Record<string, unknown>[] = [
          { add: { parent: '', node: { [tree.key]: Object.fromEntries(Object.entries(tree.slots).slice(0, 3)) }, source: {}, from: tree.source ?? 'T1' }, index: 0, total: 0 },
        ];
        for (const child of tree.children) {
          yops.push({
            add: { parent: tree.key, node: { [child.key]: Object.fromEntries(Object.entries(child.slots).slice(0, 3)) }, source: {}, from: child.source ?? 'T1' },
            index: 0, total: 0,
          });
        }
        return yops;
      });
      // Set correct index/total
      for (let i = 0; i < synthYops.length; i++) {
        synthYops[i].index = i;
        synthYops[i].total = synthYops.length;
      }
      console.log(`[extraction-pipeline] Synthesized ${synthYops.length} YOps from snapshot`);
      for (let i = 0; i < synthYops.length; i++) {
        yield { type: 'yop' as const, data: synthYops[i] };
      }
    } else {
      for (let i = 0; i < result.yops.length; i++) {
        yield { type: 'yop' as const, data: { ...result.yops[i], index: i, total: result.yops.length } };
      }
    }

    // ── Step 5: MeaningPipeline — multi-agent post-processing ──
    yield { type: 'status', data: { step: 'reorganizing' } };

    const debugPipeline = process.env.PIPELINE_DEBUG === 'true';
    const llmLogger: LLMCallLogger | undefined = debugPipeline
      ? (log) => {
          console.info(
            `[llm:${log.agent}] tokens: in=${log.usage.inputTokens} out=${log.usage.outputTokens} | ${log.durationMs}ms`
          );
          console.debug(`[llm:${log.agent}] prompt: ${log.prompt.slice(0, 200)}...`);
          console.debug(`[llm:${log.agent}] response: ${log.response.slice(0, 300)}...`);
        }
      : undefined;

    let organizedSnapshot: SemanticContent = result.snapshot;
    let changesSummary: Record<string, unknown> | undefined;

    try {
      const pipelineReg = await getProviderRegistry();
      const pipelineResult = await pipelineReg.tryWithFallback(
        'generation',
        async (pipelineProvider) => {
          // biome-ignore lint/suspicious/noExplicitAny: generic provider cast
          const pipeline = createMeaningPipeline(pipelineProvider as any);
          const isIncremental = currentFlat.length > 0;
          return pipeline.run(
            result.snapshot,
            extractionTurns,
            isIncremental ? currentSnapshot : undefined,
            {
              mode: isIncremental ? 'incremental' : 'full',
              debug: debugPipeline,
              llmLogger,
            }
          );
        }
      );
      organizedSnapshot = pipelineResult.content;

      // Record pipeline usage
      const pu = pipelineResult.meta.totalUsage;
      if (pu.inputTokens || pu.outputTokens) {
        recordUsageFireAndForget(db, {
          user_id: userId ?? undefined,
          project_id: conversation.projectId,
          endpoint: 'meaning_pipeline',
          model: trackedModel,
          input_tokens: pu.inputTokens,
          output_tokens: pu.outputTokens,
        });
      }

      // Build changes summary
      changesSummary = {
        completedAgents: pipelineResult.meta.completedAgents,
        quality: pipelineResult.quality,
        agentErrors: pipelineResult.meta.agentErrors,
      };

      // Log agent results
      const completed = pipelineResult.meta.completedAgents;
      const errors = pipelineResult.meta.agentErrors;
      const snapshots = pipelineResult.meta.stepSnapshots;
      const q = pipelineResult.quality;
      console.info(`[meaning-pipeline] Completed: ${completed.join(' → ')}`);
      console.info(
        `[meaning-pipeline] Quality: score=${q.score} frames=${q.frameCount} depth=${q.maxDepth} dupes=${q.duplicateTypes}`
      );
      for (const snap of snapshots) {
        console.info(
          `[meaning-pipeline] Step "${snap.agent}": ${snap.frameCount} frames, score=${snap.quality.score}`
        );
      }
      if (errors.length > 0) {
        for (const ae of errors) {
          console.warn(`[meaning-pipeline] Agent "${ae.agent}": ${ae.error}`);
        }
      }
    } catch (pipelineErr) {
      console.warn(
        `[meaning-pipeline] Pipeline error: ${pipelineErr instanceof Error ? pipelineErr.message : String(pipelineErr)}`
      );
      // Pipeline is optional — flat frames are still valid
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
    if (result.yops.length === 0 && organizedSnapshot.trees.length === 0) {
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
