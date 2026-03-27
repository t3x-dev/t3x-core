/**
 * Frame Answer Routes (Step 8)
 *
 * Processes user answers to advisory questions and drift choices.
 * Generates and applies delta corrections to the YAML tree.
 *
 * Endpoint:
 * - POST /v1/extract/frames/answer
 *
 * @see https://github.com/t3x-dev/t3x-core/issues/622
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  applyAnswer,
  applyDelta,
  createMeaningPipeline,
  type ExtractionResult,
  type ExtractionTurn,
  Extractor,
  flattenTrees,
  RELATION_TYPES,
  type SemanticContent,
  type UserAnswer,
} from '@t3x-dev/core';
import {
  findConversationById,
  findTurnsByConversation,
  insertConversation,
  insertDeltaLogEntry,
  insertProject,
  insertTurn,
  listDeltaLogByConversation,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { toDeltaLogEntries } from '../lib/delta-log-utils';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { getProviderRegistry } from '../lib/provider-registry';
import { wrapWithUsageTracking } from '../lib/usage-tracking';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const frameAnswerRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Schemas
// ============================================================

const AnswerSchema = z.object({
  question_id: z.string().min(1),
  drift_choice: z
    .enum(['keep_old', 'keep_new', 'keep_both_separate', 'keep_both_together'])
    .optional(),
  answer_text: z.string().optional(),
  selected_value: z.any().optional(),
});

const FrameAnswerRequest = z.object({
  conversation_id: z.string().min(1),
  answers: z.array(AnswerSchema).min(1),
  /** Question metadata — needed to route advisory answers to correct handler */
  question_context: z
    .object({
      type: z.enum(['vagueness', 'structural']).optional(),
      frame_id: z.string().optional(),
      slot_key: z.string().optional(),
    })
    .optional(),
  /** Drift context — relation type and new topic from drift detection */
  drift_context: z
    .object({
      relation: z.string().optional(),
      new_topic: z.string().optional(),
    })
    .optional(),
});

const FrameAnswerResponse = SuccessResponseSchema(
  z.object({
    delta: z.any().optional(),
    snapshot: z.any().optional(),
    delta_log_id: z.string().optional(),
    new_project_id: z.string().optional(),
    applied: z.boolean(),
    errors: z.array(z.string()).optional(),
  })
);

// ============================================================
// Route Definition
// ============================================================

const answerRoute = createRoute({
  method: 'post',
  path: '/v1/extract/frames/answer',
  tags: ['Extract'],
  summary: 'Apply user answers to advisory questions or drift choices',
  description:
    'Processes user answers from drift detection or ambiguity detection, generates correction deltas, and applies them to the YAML tree.',
  request: {
    body: {
      content: { 'application/json': { schema: FrameAnswerRequest } },
    },
  },
  responses: {
    200: {
      description: 'Answer applied successfully',
      content: { 'application/json': { schema: FrameAnswerResponse } },
    },
    400: {
      description: 'Invalid request or answer',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Conversation not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    422: {
      description: 'Answer delta failed validation',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// ============================================================
// Route Handler
// ============================================================

frameAnswerRoutes.openapi(answerRoute, async (c) => {
  const { conversation_id, answers, question_context, drift_context } = c.req.valid('json');

  try {
    const db = await getDB();

    // 1. Validate conversation
    const conversation = await findConversationById(db, conversation_id);
    if (!conversation) {
      return errorResponse(
        c,
        'CONVERSATION_NOT_FOUND',
        `Conversation not found: ${conversation_id}`
      );
    }

    const accessResult = await assertProjectAccess(c, db, conversation.projectId);
    if (accessResult instanceof Response) return accessResult;

    // 2. Build current snapshot from delta log
    const deltaRecords = await listDeltaLogByConversation(db, conversation_id);
    const emptySnapshot: SemanticContent = { trees: [], relations: [] };
    const currentSnapshot = toDeltaLogEntries(deltaRecords).reduce(
      (snap, entry) => applyDelta(snap, entry.delta),
      emptySnapshot
    );

    // 3. Process the first answer (single answer per request for now)
    const answer: UserAnswer = answers[0];

    const result = applyAnswer(
      currentSnapshot,
      answer,
      question_context?.type,
      question_context?.frame_id,
      question_context?.slot_key
    );

    if (!result.applied) {
      // Check if this is an API-orchestration case (drift choice 3/4)
      const needsOrchestration = result.errors?.some((e) => e.includes('API-layer orchestration'));
      if (needsOrchestration) {
        // ── Drift Choice 4: keep_both_together — extract + relation ──
        if (answer.drift_choice === 'keep_both_together') {
          return await handleDriftChoice4(
            c,
            db,
            conversation,
            currentSnapshot,
            deltaRecords,
            drift_context
          );
        }
        // ── Drift Choice 3: keep_both_separate — new project ──
        if (answer.drift_choice === 'keep_both_separate') {
          return await handleDriftChoice3(c, db, conversation, drift_context);
        }
        return errorResponse(c, 'INVALID_REQUEST', `Unknown drift choice: ${answer.drift_choice}`);
      }

      return c.json(
        {
          success: true as const,
          data: {
            applied: false,
            errors: result.errors,
          },
        },
        200
      );
    }

    // 4. Persist the delta
    let deltaLogId: string | undefined;
    if (result.delta && result.delta.changes.length > 0) {
      const record = await insertDeltaLogEntry(db, {
        conversationId: conversation_id,
        projectId: conversation.projectId,
        source: answer.drift_choice ? 'collapse' : 'answer',
        delta: result.delta,
        pipelineState: 'completed',
      });
      deltaLogId = record.id;
    }

    // 5. Return result
    return c.json(
      {
        success: true as const,
        data: {
          applied: true,
          delta: result.delta,
          snapshot: result.snapshot,
          delta_log_id: deltaLogId,
        },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    // biome-ignore lint/suspicious/noExplicitAny: generic error handler
    return errorResponse(c, 'EXTRACTION_FAILED' as any, message);
  }
});

// ============================================================
// Drift Choice Handlers
// ============================================================

/**
 * Drift Choice 4: keep_both_together
 * Extract new frames from post-drift turns, add relation connecting old root → new root.
 */
async function handleDriftChoice4(
  // biome-ignore lint/suspicious/noExplicitAny: generic error handler
  c: any,
  // biome-ignore lint/suspicious/noExplicitAny: generic error handler
  db: any,
  conversation: { projectId: string; conversationId: string },
  // biome-ignore lint/suspicious/noExplicitAny: generic error handler
  currentSnapshot: any,
  // biome-ignore lint/suspicious/noExplicitAny: generic error handler
  deltaRecords: any[],
  driftContext?: { relation?: string; new_topic?: string }
) {
  // 1. Fetch turns
  const allTurns = await findTurnsByConversation(db, {
    conversationId: conversation.conversationId,
    limit: 500,
  });

  // biome-ignore lint/suspicious/noExplicitAny: generic error handler
  const extractionTurns: ExtractionTurn[] = allTurns.map((t: any) => ({
    role: t.role as ExtractionTurn['role'],
    content: t.content,
    turn_hash: t.turnHash,
  }));

  // 2. Calculate processedTurnCount
  let processedTurnCount: number | undefined;
  if (deltaRecords.length > 0) {
    const lastDelta = deltaRecords[deltaRecords.length - 1];
    const lastExtractionTime = new Date(lastDelta.createdAt).getTime();
    processedTurnCount = allTurns.filter(
      // biome-ignore lint/suspicious/noExplicitAny: generic error handler
      (t: any) => new Date(t.createdAt).getTime() <= lastExtractionTime
    ).length;
  }

  // 3. Extract frames via FrameExtractor
  const reg = await getProviderRegistry();
  const extractResult = (await reg.tryWithFallback('generation', (provider): Promise<ExtractionResult> => {
    // biome-ignore lint/suspicious/noExplicitAny: generic error handler
    const { provider: tracked } = wrapWithUsageTracking(provider as any);
    const extractor = new Extractor(tracked);
    return extractor.extract({
      turns: extractionTurns,
      snapshot: currentSnapshot.trees.length > 0 ? currentSnapshot : undefined,
      processedTurnCount,
    });
  })) as ExtractionResult;

  if (!extractResult.ok) {
    return errorResponse(c, 'EXTRACTION_FAILED', extractResult.error);
  }

  // 4. Run MeaningPipeline
  let organizedSnapshot = extractResult.snapshot;
  try {
    const pipelineResult = await reg.tryWithFallback('generation', async (pipelineProvider) => {
      // biome-ignore lint/suspicious/noExplicitAny: generic error handler
      const pipeline = createMeaningPipeline(pipelineProvider as any);
      return pipeline.run(extractResult.snapshot, extractionTurns, currentSnapshot, {
        mode: 'incremental',
      });
    });
    organizedSnapshot = (pipelineResult as any).content;
  } catch {
    // Pipeline optional — flat frames still valid
  }

  // 5. Build delta with relation connecting old root → new root
  const currentFlat = flattenTrees(currentSnapshot.trees);
  const organizedFlat = flattenTrees(organizedSnapshot.trees);
  const oldRootId = currentFlat[0]?.id;
  const newNodeIds = organizedFlat
    .filter((f) => !currentFlat.some((old) => old.id === f.id))
    .map((f) => f.id);
  const newRootId = newNodeIds[0];

  // biome-ignore lint/suspicious/noExplicitAny: generic error handler
  const relationDelta: any = {
    changes: extractResult.delta.changes,
    new_relations: [...(extractResult.delta.new_relations ?? [])],
    remove_relations: extractResult.delta.remove_relations,
  };

  // Add connecting relation if both roots exist
  if (oldRootId && newRootId) {
    const relationType =
      driftContext?.relation &&
      (RELATION_TYPES as readonly string[]).includes(driftContext.relation)
        ? driftContext.relation
        : 'follows';
    relationDelta.new_relations.push({
      from: oldRootId,
      to: newRootId,
      type: relationType,
    });
  }

  // 6. Persist
  const record = await insertDeltaLogEntry(db, {
    conversationId: conversation.conversationId,
    projectId: conversation.projectId,
    source: 'pipeline',
    delta: relationDelta,
    pipelineState: 'completed',
  });

  return c.json(
    {
      success: true as const,
      data: {
        applied: true,
        delta: relationDelta,
        snapshot: organizedSnapshot,
        delta_log_id: record.id,
      },
    },
    200
  );
}

/**
 * Drift Choice 3: keep_both_separate
 * Create new project + conversation, copy post-drift turns, return new project info.
 * Frontend triggers extraction in the new project separately.
 */
async function handleDriftChoice3(
  // biome-ignore lint/suspicious/noExplicitAny: generic error handler
  c: any,
  // biome-ignore lint/suspicious/noExplicitAny: generic error handler
  db: any,
  conversation: { projectId: string; conversationId: string },
  driftContext?: { relation?: string; new_topic?: string }
) {
  // 1. Fetch turns to identify post-drift turns
  const allTurns = await findTurnsByConversation(db, {
    conversationId: conversation.conversationId,
    limit: 500,
  });

  const deltaRecords = await listDeltaLogByConversation(db, conversation.conversationId);

  // Find post-drift turns (turns after last extraction)
  let postDriftTurns = allTurns;
  if (deltaRecords.length > 0) {
    const lastDelta = deltaRecords[deltaRecords.length - 1];
    const lastExtractionTime = new Date(lastDelta.createdAt).getTime();
    postDriftTurns = allTurns.filter(
      // biome-ignore lint/suspicious/noExplicitAny: generic error handler
      (t: any) => new Date(t.createdAt).getTime() > lastExtractionTime
    );
  }

  if (postDriftTurns.length === 0) {
    return errorResponse(c, 'INVALID_REQUEST', 'No post-drift turns found to copy');
  }

  // 2. Create new project
  const topicName = driftContext?.new_topic || 'drifted_topic';
  const newProject = await insertProject(db, {
    name: topicName.replace(/_/g, ' '),
  });

  // 3. Create new conversation in new project
  const newConversation = await insertConversation(db, {
    projectId: newProject.projectId,
    title: topicName.replace(/_/g, ' '),
  });

  // 4. Copy post-drift turns to new conversation
  for (const turn of postDriftTurns) {
    await insertTurn(db, {
      projectId: newProject.projectId,
      conversationId: newConversation.conversationId,
      role: turn.role as 'user' | 'assistant' | 'system' | 'tool',
      content: turn.content,
    });
  }

  // 5. Return new project info (frontend triggers extraction separately)
  return c.json(
    {
      success: true as const,
      data: {
        applied: true,
        new_project_id: newProject.projectId,
        new_project_url: `/project/${newProject.projectId}`,
      },
    },
    200
  );
}

export default frameAnswerRoutes;
