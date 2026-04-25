/**
 * Tree Answer Routes (Step 8)
 *
 * Processes user answers to advisory questions and drift choices.
 * Generates and applies delta corrections to the YAML tree.
 *
 * Endpoint:
 * - POST /v1/extract/trees/answer
 *
 * @see https://github.com/t3x-dev/t3x-core/issues/622
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  applyAnswer,
  applyYOps,
  flattenTrees,
  RELATION_TYPES,
  type RelationType,
  type UserAnswer,
} from '@t3x-dev/core';
import {
  findConversationById,
  findTurnsByConversation,
  insertConversation,
  insertProject,
  insertTurn,
  insertYOpsLogEntry,
  listYOpsLogByConversation,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { runApiExtractionV2 } from '../lib/extraction-v2';
import { assertProjectAccess, getUserId } from '../lib/project-access';
import { syncYOpsToTrees } from '../lib/tree-state-sync';
import { replayYOpsLog, toYOpsLogEntries } from '../lib/yops-log-utils';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const treeAnswerRoutes = new OpenAPIHono({
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

const TreeAnswerRequest = z.object({
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

const TreeAnswerResponse = SuccessResponseSchema(
  z.object({
    delta: z.any().optional(),
    snapshot: z.any().optional(),
    yops_log_id: z.string().optional(),
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
  path: '/v1/extract/trees/answer',
  tags: ['Extract'],
  summary: 'Apply user answers to advisory questions or drift choices',
  description:
    'Processes user answers from drift detection or ambiguity detection, generates correction deltas, and applies them to the YAML tree.',
  request: {
    body: {
      content: { 'application/json': { schema: TreeAnswerRequest } },
    },
  },
  responses: {
    200: {
      description: 'Answer applied successfully',
      content: { 'application/json': { schema: TreeAnswerResponse } },
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

treeAnswerRoutes.openapi(answerRoute, async (c) => {
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

    // 2. Build current snapshot from yops log
    const yopsRecords = await listYOpsLogByConversation(db, conversation_id);
    const currentSnapshot = replayYOpsLog(toYOpsLogEntries(yopsRecords));

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
            yopsRecords,
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

    // 4. Persist the yops + rebuild materialised trees in one transaction so
    //    reads against the trees / tree_relations tables don't lag the log.
    //    Mirrors the canonical flow in ops/yops-apply.ts.
    let yopsLogId: string | undefined;
    if (result.yops && result.yops.length > 0) {
      // biome-ignore lint/suspicious/noExplicitAny: db.transaction typing varies by adapter
      const record = await (db as any).transaction(async (tx: any) => {
        const rec = await insertYOpsLogEntry(tx, {
          conversationId: conversation_id,
          projectId: conversation.projectId,
          source: answer.drift_choice ? 'collapse' : 'answer',
          yops: result.yops,
          pipelineState: 'completed',
        });
        await syncYOpsToTrees(tx, conversation_id, conversation.projectId);
        return rec;
      });
      yopsLogId = record.id;
    }

    // 5. Return result
    return c.json(
      {
        success: true as const,
        data: {
          applied: true,
          delta: result.yops,
          snapshot: result.snapshot,
          yops_log_id: yopsLogId,
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
  yopsRecords: any[],
  driftContext?: { relation?: string; new_topic?: string }
) {
  // 1. Determine post-drift turn hashes so v2 extracts only the new material
  //    (mirrors the legacy processedTurnCount semantics: turns strictly
  //    after the last persisted extraction).
  let postDriftTurnHashes: string[] | undefined;
  if (yopsRecords.length > 0) {
    const allTurns = await findTurnsByConversation(db, {
      conversationId: conversation.conversationId,
      limit: 500,
    });
    const lastEntry = yopsRecords[yopsRecords.length - 1];
    const lastExtractionTime = new Date(lastEntry.createdAt).getTime();
    postDriftTurnHashes = allTurns
      // biome-ignore lint/suspicious/noExplicitAny: generic row type
      .filter((t: any) => new Date(t.createdAt).getTime() > lastExtractionTime)
      // biome-ignore lint/suspicious/noExplicitAny: generic row type
      .map((t: any) => t.turnHash);

    if (postDriftTurnHashes.length === 0) {
      return errorResponse(c, 'INVALID_REQUEST', 'No post-drift turns to extract');
    }
  }

  // 2. Run the shared v2 extraction pipeline. runApiExtractionV2 replays the
  //    yops log, resolves the provider, and applies the compiled ops.
  const extractResult = await runApiExtractionV2({
    db,
    conversationId: conversation.conversationId,
    turnHashes: postDriftTurnHashes,
    userId: getUserId(c) ?? undefined,
  });

  if (!extractResult.ok) {
    const code =
      extractResult.kind === 'conversation_not_found'
        ? 'CONVERSATION_NOT_FOUND'
        : 'EXTRACTION_FAILED';
    return errorResponse(c, code, extractResult.message);
  }

  const organizedSnapshot = extractResult.snapshot;

  // 3. Build connecting relation between old root → new root as a relate YOp.
  //    The new root is whatever top-level node v2 added that was not in the
  //    current snapshot.
  const currentFlat = flattenTrees(currentSnapshot.trees);
  const organizedFlat = flattenTrees(organizedSnapshot.trees);
  const oldRootId = currentFlat[0]?.id;
  const newNodeIds = organizedFlat
    .filter((f) => !currentFlat.some((old) => old.id === f.id))
    .map((f) => f.id);
  const newRootId = newNodeIds[0];

  const extractedOps = extractResult.ops;
  const allYops = [...extractedOps];
  if (oldRootId && newRootId) {
    const relationType =
      driftContext?.relation &&
      (RELATION_TYPES as readonly string[]).includes(driftContext.relation)
        ? driftContext.relation
        : 'follows';
    // The relate op is a deterministic, server-side decision triggered by
    // the user choosing keep_both_together — it is not produced by the LLM.
    // The yops_log_source_required CHECK demands a per-op source, so attach
    // a HumanSource that names the API path responsible for the choice.
    allYops.push({
      relate: {
        from: oldRootId,
        to: newRootId,
        type: relationType as RelationType,
      },
      source: {
        type: 'human',
        author: 'api:drift-keep-both-together',
        at: new Date().toISOString(),
      },
    });
  }

  // 4. Apply the appended relate op on top of the already-materialized
  //    extraction snapshot to produce the final snapshot with the relation.
  const finalResult =
    allYops.length > extractedOps.length
      ? applyYOps(organizedSnapshot, allYops.slice(extractedOps.length))
      : null;
  const finalSnapshot = finalResult?.ok
    ? { trees: finalResult.trees, relations: finalResult.relations }
    : organizedSnapshot;

  // 5. Persist the full op set (extraction + relation) as one pipeline entry,
  //    then rebuild materialised trees in the same transaction.
  // biome-ignore lint/suspicious/noExplicitAny: db.transaction typing varies by adapter
  const record = await (db as any).transaction(async (tx: any) => {
    const rec = await insertYOpsLogEntry(tx, {
      conversationId: conversation.conversationId,
      projectId: conversation.projectId,
      source: 'pipeline',
      yops: allYops,
      pipelineState: 'completed',
    });
    await syncYOpsToTrees(tx, conversation.conversationId, conversation.projectId);
    return rec;
  });

  return c.json(
    {
      success: true as const,
      data: {
        applied: true,
        delta: extractedOps,
        snapshot: finalSnapshot,
        yops_log_id: record.id,
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

  const yopsRecords = await listYOpsLogByConversation(db, conversation.conversationId);

  // Find post-drift turns (turns after last extraction)
  let postDriftTurns = allTurns;
  if (yopsRecords.length > 0) {
    const lastEntry = yopsRecords[yopsRecords.length - 1];
    const lastExtractionTime = new Date(lastEntry.createdAt).getTime();
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

export default treeAnswerRoutes;
