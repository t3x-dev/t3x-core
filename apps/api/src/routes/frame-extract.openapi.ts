/**
 * Frame Extraction Routes
 *
 * LLM-based frame semantic extraction from conversation turns.
 * Integrates FrameExtractor (Track A) with the delta log (Track C).
 *
 * Endpoints:
 * - POST /v1/extract/frames - Extract semantic frames from a conversation
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  buildDraft,
  checkDiffCompatibility,
  checkReadiness,
  computeSessionContext,
  createMeaningPipeline,
  decideAction,
  DEFAULT_STYLE,
  detectAmbiguity,
  detectDrift,
  type ExtractionStyleConfig,
  type FrameExtractionTurn,
  FrameExtractor,
  fuzzyLocate,
  GateRunner,
  type LLMCallLogger,
  pipelineEmitter,
  preFilterDrift,
  type SlotQuotesMap,
} from '@t3x-dev/core';
import {
  createTopic,
  findConversationById,
  findProjectById,
  findTurnsByConversation,
  findUserById,
  insertDeltaLogEntry,
  listDeltaLogByConversation,
  listDeltaLogByTopic,
  listTopicsByConversation,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { toDeltaLogEntries } from '../lib/delta-log-utils';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { syncDeltaToFrames } from '../lib/frame-state-sync';
import { assertProjectAccess } from '../lib/project-access';
import { getProviderRegistry } from '../lib/provider-registry';
import { getUserId, recordUsageFireAndForget, wrapWithUsageTracking } from '../lib/usage-tracking';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const frameExtractRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Schemas
// ============================================================

const DriftDecisionSchema = z.object({
  choice: z.enum(['keep_old', 'keep_new', 'keep_both_separate', 'keep_both_together']),
  relation: z.string().optional(),
  new_topic: z.string().optional(),
});

const FrameExtractRequest = z.object({
  conversation_id: z.string().min(1),
  turn_hashes: z.array(z.string().min(1)).optional(),
  drift_decision: DriftDecisionSchema.optional(),
  topic_id: z.string().optional(),
  force_extract: z.boolean().optional(),
});

const DeltaResponseSchema = z.object({
  changes: z.array(z.any()),
  new_relations: z.array(z.any()).optional(),
  remove_relations: z.array(z.any()).optional(),
});

const SnapshotResponseSchema = z.object({
  frames: z.array(z.any()),
  relations: z.array(z.any()),
});

const FrameExtractResponse = SuccessResponseSchema(
  z.object({
    delta: DeltaResponseSchema.optional(),
    snapshot: SnapshotResponseSchema.optional(),
    delta_log_id: z.string().optional(),
    status: z.enum(['completed', 'drift_detected', 'skipped']),
    drift: z
      .object({
        relation: z.string().optional(),
        new_topic: z.string().optional(),
        old_topic: z.string().optional(),
      })
      .optional(),
    choices: z.array(z.string()).optional(),
    gate_result: z.any().optional(),
    advisory_questions: z.array(z.any()).optional(),
    reason: z.string().optional(),
  })
);

// ============================================================
// Route Definition
// ============================================================

const extractFramesRoute = createRoute({
  method: 'post',
  path: '/v1/extract/frames',
  tags: ['Extract'],
  summary: 'Extract semantic frames from a conversation using LLM',
  description:
    'Runs FrameExtractor on conversation turns, appends the resulting delta to the delta log, and returns the delta with the updated snapshot.',
  request: {
    body: {
      content: { 'application/json': { schema: FrameExtractRequest } },
    },
  },
  responses: {
    200: {
      description: 'Frames extracted successfully',
      content: { 'application/json': { schema: FrameExtractResponse } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Conversation not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    503: {
      description: 'LLM provider not configured',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Extraction or server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// ============================================================
// Route Handler
// ============================================================

frameExtractRoutes.openapi(extractFramesRoute, async (c) => {
  const { conversation_id, turn_hashes, drift_decision, topic_id, force_extract } =
    c.req.valid('json');

  try {
    const db = await getDB();

    // 1. Validate conversation exists and get project_id
    const conversation = await findConversationById(db, conversation_id);
    if (!conversation) {
      return errorResponse(
        c,
        'CONVERSATION_NOT_FOUND',
        `Conversation not found: ${conversation_id}`
      );
    }

    // 1b. Verify project access
    const accessResult = await assertProjectAccess(c, db, conversation.projectId);
    if (accessResult instanceof Response) return accessResult;

    // 2. Fetch conversation turns
    const allTurns = await findTurnsByConversation(db, {
      conversationId: conversation_id,
      limit: 500,
    });

    if (allTurns.length === 0) {
      return errorResponse(c, 'CONVERSATION_NOT_FOUND', 'No turns found for this conversation');
    }

    // Filter to specific turn hashes if provided
    const selectedTurns = turn_hashes
      ? allTurns.filter((t) => turn_hashes.includes(t.turnHash))
      : allTurns;

    if (selectedTurns.length === 0) {
      return errorResponse(c, 'INVALID_REQUEST', 'None of the specified turn_hashes were found');
    }

    // 3. Resolve extraction style: project → user → default
    const projectRecord = await findProjectById(db, conversation.projectId);
    let resolvedStyle: ExtractionStyleConfig = DEFAULT_STYLE;
    if (projectRecord?.extractionStyle) {
      resolvedStyle = projectRecord.extractionStyle as ExtractionStyleConfig;
    } else {
      const userId = getUserId(c);
      if (userId) {
        const user = await findUserById(db, userId);
        if (user?.default_extraction_style) {
          resolvedStyle = user.default_extraction_style as ExtractionStyleConfig;
        }
      }
    }

    // 4. Fetch existing delta log and build current snapshot
    // When topic_id is provided, only load deltas for that topic
    const deltaRecords = topic_id
      ? await listDeltaLogByTopic(db, conversation_id, topic_id)
      : await listDeltaLogByConversation(db, conversation_id);
    const currentSnapshot = buildDraft(toDeltaLogEntries(deltaRecords));

    // 5. Convert turns to FrameExtractionTurn format (include turn_hash for source tracking)
    const extractionTurns: FrameExtractionTurn[] = selectedTurns.map((t) => ({
      role: t.role as FrameExtractionTurn['role'],
      content: t.content,
      turn_hash: t.turnHash,
    }));

    // 5b. Calculate processedTurnCount — how many turns were present at the last extraction
    let processedTurnCount: number | undefined;
    if (deltaRecords.length > 0 && currentSnapshot.frames.length > 0) {
      const lastDelta = deltaRecords[deltaRecords.length - 1];
      const lastExtractionTime = new Date(lastDelta.createdAt).getTime();
      processedTurnCount = selectedTurns.filter(
        (t) => new Date(t.createdAt).getTime() <= lastExtractionTime
      ).length;
    }

    // ── Step 1: SessionStateManager ──
    // Returns 'skipped' early only for ReadinessGate failures (content quality).
    // SessionStateManager 'wait'/'skip' are logged but do NOT block — the caller
    // explicitly requested extraction and we respect that intent.
    if (!drift_decision && !force_extract) {
      const sessionCtx = computeSessionContext(
        deltaRecords.map((d) => d.source),
        processedTurnCount ?? 0,
        selectedTurns.length
      );
      const decision = decideAction(sessionCtx);
      if (decision === 'wait') {
        return c.json(
          {
            success: true as const,
            data: { status: 'skipped' as const, reason: 'wait' },
          },
          200
        );
      }
      // 'skip' (no new turns) is advisory — log but don't block
      // The API caller may have valid reasons to re-extract
    }

    // ── Step 2: ReadinessGate ──
    if (!drift_decision && !force_extract) {
      const isFirstExtraction = currentSnapshot.frames.length === 0;
      const readiness = checkReadiness(
        selectedTurns.map((t) => ({ role: t.role, content: t.content })),
        isFirstExtraction
      );
      if (!readiness.pass) {
        return c.json(
          {
            success: true as const,
            data: { status: 'skipped' as const, reason: readiness.reason },
          },
          200
        );
      }
    }

    // ── Step 3: DriftDetector ──
    if (!drift_decision && currentSnapshot.frames.length > 0) {
      // Only run drift detection when there's existing content (steady phase)
      const extractionCount = deltaRecords.filter(
        (d) => d.source === 'pipeline' || d.source === 'llm_extraction'
      ).length;

      if (extractionCount >= 2) {
        // Collect existing frame info for pre-filter
        const frameTypes = currentSnapshot.frames.map((f) => f.type);
        const slotValues = currentSnapshot.frames.flatMap((f) =>
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
                const topicName = currentSnapshot.frames[0]?.type ?? 'unknown';
                // biome-ignore lint/suspicious/noExplicitAny: generic error handler
                return detectDrift(provider as any, topicName, frameTypes, recentTurns);
              });

              if (driftResult.drifted) {
                return c.json(
                  {
                    success: true as const,
                    data: {
                      status: 'drift_detected' as const,
                      drift: {
                        relation: driftResult.relationType,
                        new_topic: driftResult.newTopicName,
                        old_topic: currentSnapshot.frames[0]?.type,
                      },
                      choices: ['keep_old', 'keep_new', 'keep_both_separate', 'keep_both_together'],
                    },
                  },
                  200
                );
              }
            } catch {
              // Drift detection failure → continue with extraction (fail-safe)
            }
          }
        }
      }
    }

    // 6. Call FrameExtractor via provider registry with fallback (usage tracked)
    const reg = await getProviderRegistry();
    const trackedUsage = { inputTokens: 0, outputTokens: 0 };
    let trackedModel = 'unknown';
    const result = await reg.tryWithFallback('generation', (provider) => {
      // biome-ignore lint/suspicious/noExplicitAny: generic error handler
      const { provider: tracked, usage } = wrapWithUsageTracking(provider as any);
      trackedUsage.inputTokens = 0;
      trackedUsage.outputTokens = 0;
      trackedModel = tracked.id;
      const extractor = new FrameExtractor(tracked);
      return extractor
        .extract(
          {
            turns: extractionTurns,
            snapshot: currentSnapshot.frames.length > 0 ? currentSnapshot : undefined,
            processedTurnCount,
          },
          resolvedStyle
        )
        .then((r) => {
          trackedUsage.inputTokens = usage.inputTokens;
          trackedUsage.outputTokens = usage.outputTokens;
          return r;
        });
    });

    // 7. Check extraction result
    if (!result.ok) {
      return errorResponse(c, 'EXTRACTION_FAILED', result.error);
    }

    // Record usage (fire-and-forget)
    if (trackedUsage.inputTokens || trackedUsage.outputTokens) {
      recordUsageFireAndForget(db, {
        user_id: getUserId(c) ?? undefined,
        project_id: conversation.projectId,
        endpoint: 'extract_frames',
        model: trackedModel,
        input_tokens: trackedUsage.inputTokens,
        output_tokens: trackedUsage.outputTokens,
      });
    }

    // 7b. Resolve slot quotes into character offsets using fuzzyLocate
    const slotQuotes: SlotQuotesMap = result.slotQuotes ?? new Map();
    console.info(`[slot-sources] slotQuotes from LLM: ${slotQuotes.size} changes have quotes`);

    if (slotQuotes.size > 0) {
      // Build turn content lookup: try all turns for each quote
      const turnInfoList = selectedTurns.map((t, i) => ({
        tag: `T${i + 1}`,
        content: t.content,
        turnHash: t.turnHash,
      }));

      for (let i = 0; i < result.delta.changes.length; i++) {
        const quotes = slotQuotes.get(i);
        if (!quotes) continue;

        const change = result.delta.changes[i];
        console.info(
          `[slot-sources] change[${i}] action=${change.action} slots=[${Object.keys(quotes).join(', ')}]`
        );
        const slotSources: Record<
          string,
          { turn: string; turn_hash?: string; start_char: number; end_char: number; quote?: string }
        > = {};

        for (const [slotKey, quote] of Object.entries(quotes)) {
          if (typeof quote !== 'string' || !quote) continue;

          // Try matching the quote against all turns (best match wins)
          for (const turnInfo of turnInfoList) {
            const located = fuzzyLocate(turnInfo.content, quote);
            if (located && located.score >= 0.6) {
              console.info(
                `[slot-sources]   ${slotKey}: matched in ${turnInfo.tag} score=${located.score.toFixed(2)} [${located.start}:${located.end}]`
              );
              slotSources[slotKey] = {
                turn: turnInfo.tag,
                turn_hash: turnInfo.turnHash,
                start_char: located.start,
                end_char: located.end,
                quote,
              };
              break;
            }
          }
        }

        console.info(
          `[slot-sources] change[${i}] resolved ${Object.keys(slotSources).length}/${Object.keys(quotes).length} slots`
        );

        if (Object.keys(slotSources).length > 0) {
          if (change.action === 'add') {
            change.frame.slot_sources = slotSources;
          } else if (change.action === 'update') {
            // Merge new slot_sources into the existing frame in the snapshot
            const targetFrame = result.snapshot.frames.find(
              (f: { id: string }) => f.id === change.target
            );
            if (targetFrame) {
              targetFrame.slot_sources = { ...targetFrame.slot_sources, ...slotSources };
            }
          }
        }
      }
    }

    // 7c. Run Meaning Pipeline — multi-agent post-processing
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

    let organizedSnapshot = result.snapshot;
    try {
      const pipelineReg = await getProviderRegistry();
      const pipelineResult = await pipelineReg.tryWithFallback(
        'generation',
        async (pipelineProvider) => {
          // biome-ignore lint/suspicious/noExplicitAny: generic error handler
          const pipeline = createMeaningPipeline(pipelineProvider as any);
          const isIncremental = currentSnapshot.frames.length > 0;
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
          user_id: getUserId(c) ?? undefined,
          project_id: conversation.projectId,
          endpoint: 'meaning_pipeline',
          model: trackedModel,
          input_tokens: pu.inputTokens,
          output_tokens: pu.outputTokens,
        });
      }

      // Log agent results with quality metrics
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

    // ── Step 6: VALIDATE — GateRunner + DiffCompatibilityCheck ──
    let gateResult: unknown;
    try {
      const gateRunner = new GateRunner();
      // Gate 1 (structure) always runs, Gate 2 (semantic) needs provider
      // Use skipSemantic if no provider available to avoid failure
      const gr = await gateRunner.run(organizedSnapshot, {
        turns: extractionTurns.map((t) => ({ role: t.role, content: t.content })),
        skipSemantic: true, // Gate 2 is expensive; run only on commit for now
        skipBusiness: true, // Gate 3 only at commit time
      });
      gateResult = gr;

      if (!gr.structure.passed) {
        return errorResponse(
          c,
          // biome-ignore lint/suspicious/noExplicitAny: generic error handler
          'EXTRACTION_FAILED' as any,
          `Structural validation failed: ${JSON.stringify(gr.structure.checks)}`
        );
      }
    } catch (gateErr) {
      console.warn(
        `[gate] Gate check error: ${gateErr instanceof Error ? gateErr.message : String(gateErr)}`
      );
      // Gate failure is non-fatal for extraction — continue
    }

    // DiffCompatibilityCheck (non-blocking, log only)
    if (currentSnapshot.frames.length > 0) {
      const diffCheck = checkDiffCompatibility(currentSnapshot, result.delta);
      if (!diffCheck.compatible) {
        console.warn(`[gate] DiffCompatibilityCheck warnings: ${diffCheck.errors.join('; ')}`);
      }
    }

    // ── Step 7: AmbiguityDetector (advisory-only) ──
    let advisoryQuestions: unknown[] | undefined;
    try {
      const reg3 = await getProviderRegistry();
      const ambiguityResult = await reg3.tryWithFallback('generation', (ambProvider) => {
        const recentTurns = selectedTurns.slice(-5).map((t) => ({
          role: t.role,
          content: t.content,
        }));
        // biome-ignore lint/suspicious/noExplicitAny: generic error handler
        return detectAmbiguity(ambProvider as any, organizedSnapshot, recentTurns);
      });
      if (!ambiguityResult.clean) {
        advisoryQuestions = ambiguityResult.questions;
        pipelineEmitter.emit('question.generated', {
          conversationId: conversation_id,
          questions: ambiguityResult.questions,
        });
      }
    } catch {
      // Ambiguity detection failure → continue without questions
    }

    // 8. Auto-create topic on first extraction if none exists
    let resolvedTopicId = topic_id;
    if (!resolvedTopicId) {
      const existingTopics = await listTopicsByConversation(db, conversation_id);
      if (existingTopics.length === 0 && organizedSnapshot.frames.length > 0) {
        const rootFrame = organizedSnapshot.frames[0];
        const newTopic = await createTopic(db, {
          conversationId: conversation_id,
          projectId: conversation.projectId,
          name: rootFrame.type,
        });
        resolvedTopicId = newTopic.id;
      } else if (existingTopics.length === 1) {
        resolvedTopicId = existingTopics[0].id;
      }
    }

    // 8b. Check for drift_detected in extraction result
    const extractionDelta = result.delta as {
      drift_detected?: boolean;
      changes: unknown[];
      new_topic?: string;
    };
    if (extractionDelta.drift_detected && extractionDelta.changes.length === 0) {
      pipelineEmitter.emit('topic.changed', {
        conversationId: conversation_id,
        oldTopic: currentSnapshot.frames[0]?.type,
        newTopic: extractionDelta.new_topic ?? 'unknown',
      });
      return c.json(
        {
          success: true as const,
          data: {
            status: 'drift_detected' as const,
            drift: {
              old_topic: currentSnapshot.frames[0]?.type,
            },
            choices: ['keep_old', 'keep_new', 'keep_both_separate', 'keep_both_together'],
          },
        },
        200
      );
    }

    // 8c. Write delta_log + sync frames atomically
    const record = await (db as any).transaction(async (tx: any) => {
      const rec = await insertDeltaLogEntry(tx, {
        conversationId: conversation_id,
        projectId: conversation.projectId,
        source: 'pipeline',
        delta: result.delta,
        pipelineState: 'completed',
        gateResultJson: gateResult ?? null,
        topicId: resolvedTopicId,
      });
      await syncDeltaToFrames(
        tx,
        conversation_id,
        conversation.projectId,
        result.delta,
        'pipeline',
        {
          topicId: resolvedTopicId,
        }
      );
      return rec;
    });

    // ── Step 8: Emit extraction.completed event ──
    pipelineEmitter.emit('extraction.completed', {
      conversationId: conversation_id,
      projectId: conversation.projectId,
      deltaLogId: record.id,
      delta: result.delta,
      snapshot: organizedSnapshot,
      topicId: resolvedTopicId,
    });

    // 9. Return delta + updated snapshot + delta_log_id
    return c.json(
      {
        success: true as const,
        data: {
          status: 'completed' as const,
          delta: result.delta,
          snapshot: organizedSnapshot,
          delta_log_id: record.id,
          gate_result: gateResult,
          advisory_questions: advisoryQuestions,
        },
      },
      200
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'AllProvidersFailedError') {
      return c.json(
        {
          success: false as const,
          error: {
            code: 'LLM_NOT_CONFIGURED',
            message:
              'No LLM provider is configured. Set ANTHROPIC_API_KEY or another provider key.',
          },
        },
        503
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'EXTRACTION_FAILED', message);
  }
});

export default frameExtractRoutes;
