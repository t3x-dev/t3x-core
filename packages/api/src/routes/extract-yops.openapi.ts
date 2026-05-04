/**
 * POST /v1/extract-yops
 *
 * Server-validated extraction endpoint. Takes turns, calls the LLM via
 * the provider registry, runs the v2 pipeline (parse → schema validate
 * → compile → source-quote validate), and returns an `ExtractionOutcome`.
 *
 * Does NOT persist to yops_log. Does NOT do drift detection.
 *
 * Wire contract (canonical envelope):
 *   - 200 = "extraction domain outcome delivered". Body:
 *       `{ success: true, data: ExtractionOutcome }` where
 *       `ExtractionOutcome.kind ∈ { 'ok', 'partial', 'failed' }`.
 *     This includes pipeline failures that exhausted retries — they
 *     ride as `kind:'failed'` inside a 200, NOT as a 4xx error code.
 *   - 4xx/5xx = transport / configuration / auth / rate failures that
 *     prevented the extraction domain process from running:
 *       PROVIDER_KEY_MISSING (400)
 *       AUTH_ERROR (401)
 *       CONVERSATION_NOT_FOUND (404)
 *       RATE_LIMITED (429)
 *       INTERNAL_ERROR (500)
 *       PROVIDER_UNAVAILABLE (502)
 *
 * Retry policy:
 *   - The pipeline owns ALL reask budget. Draft schema, provenance,
 *     compile, AND source-quote validation each get their own targeted
 *     reask attempts inside `runExtractionV2Pipeline` before the route
 *     ever returns.
 *   - On `kind:'ok'` every op carries a verbatim-substring quote from
 *     the named turn. Clients trust this contract and do not re-validate.
 *   - On `kind:'partial'` the pipeline salvaged a usable subset after
 *     reask exhaustion (compile failure). Clients render the warning +
 *     partial ops; they SHOULD NOT silently re-call with the same
 *     payload — same predictable failure.
 *   - Clients SHOULD NOT retry `kind:'failed'` for the same reason.
 *     Transport-class 4xx/5xx (rate-limit, provider 5xx) remain
 *     client-retryable per their HTTP semantics.
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: extract-yops route queries provider registry through a dynamic runtime surface pending shared provider interfaces */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { extractAndApply, extractToOutcome, PRESETS, type PresetName } from '@t3x-dev/core';
import { findConversationById } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { getUserId } from '../lib/project-access';
import { resolveProviderAndModel } from '../lib/provider-resolver';
import { replayActiveDraftOnBaseline } from '../lib/yops-log-utils';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const extractYopsRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ── Request schema ──

const TurnInput = z.object({
  turn_hash: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system', 'tool']).optional(),
  content: z.string(),
});

const ExtractYopsRequest = z.object({
  conversation_id: z.string().min(1),
  turns: z.array(TurnInput),
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  /**
   * Extraction style preset. Drives a granularity-aware system prompt
   * (concise: hard 6-item budget + single-tree shape; detailed: capture
   * nuance under existing paths). Omitted = no style guidance, which
   * keeps the historical "balanced-ish, no budget" prompt.
   *
   * Only the preset names are accepted on the wire; custom configs go
   * through `extractAndApply` directly. Mapping uses `PRESETS[name]`
   * from `@t3x-dev/core`.
   */
  preset: z.enum(['concise', 'balanced', 'detailed']).optional(),
});

// Response schema — `data` is the canonical ExtractionOutcome envelope.
// `ops` and `variants` are opaque (YOp shape lives in core); OpenAPI
// describes the discriminator + the always-present fields and leaves the
// op shape as z.any() to avoid duplicating the YOps schema here.
const ExtractionOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ok'),
    ops: z.array(z.any()),
    warnings: z.array(z.object({ message: z.string() })),
    variants: z.record(z.string(), z.array(z.any())).optional(),
  }),
  z.object({
    kind: z.literal('partial'),
    ops: z.array(z.any()),
    warnings: z.array(z.object({ message: z.string() })),
    dropped: z.array(z.object({ item_id: z.string(), reason: z.string() })),
    reason: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    kind: z.literal('failed'),
    reason: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
]);

/**
 * Reclassify a pipeline `transport` failure into the appropriate HTTP
 * error code. Non-transport failures never reach this — they ride as
 * `kind:'failed'` inside a 200 ExtractionOutcome.
 *
 * Returns `null` when the transport failure is non-specific (no usable
 * statusCode) — caller falls back to PROVIDER_UNAVAILABLE 502.
 */
function classifyTransportFailure(failure: {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}): { code: 'RATE_LIMITED' | 'AUTH_ERROR'; details: Record<string, unknown> } | null {
  const statusCode =
    typeof failure.details?.statusCode === 'number' ? failure.details.statusCode : undefined;

  if (statusCode === 429) {
    return {
      code: 'RATE_LIMITED',
      details: { failure_code: failure.code, ...failure.details },
    };
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      code: 'AUTH_ERROR',
      details: { failure_code: failure.code, ...failure.details },
    };
  }

  return null;
}

// ── Route ──

const route = createRoute({
  method: 'post',
  path: '/v1/extract-yops',
  tags: ['Extraction'],
  summary: 'Produce server-validated YOps from turns via LLM',
  description:
    'Runs the v2 extraction pipeline end-to-end (LLM call → schema validate → compile → source-quote validate). A 200 response carries an `ExtractionOutcome` with `kind: "ok" | "partial" | "failed"` — domain failures (compile, unverifiable_quote, ...) are reported in the 200 envelope, NOT as 4xx. Only transport / configuration / auth / rate failures use 4xx/5xx. The pipeline owns all reask budget; clients SHOULD NOT silently retry `partial` or `failed` outcomes for the same payload.',
  request: {
    body: {
      content: { 'application/json': { schema: ExtractYopsRequest } },
    },
  },
  responses: {
    200: {
      description: 'Extraction domain outcome delivered (ok | partial | failed)',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ExtractionOutcomeSchema),
        },
      },
    },
    400: {
      description: 'Provider key missing or other request-level failure',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Provider authentication failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Conversation not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    429: {
      description: 'Provider rate-limited the request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Internal server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    502: {
      description: 'Upstream LLM provider unavailable',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// ── Handler ──

extractYopsRoutes.openapi(route, async (c) => {
  const {
    conversation_id,
    turns,
    provider: requestedProvider,
    model: requestedModel,
    preset,
  } = c.req.valid('json');

  try {
    const db = await getDB();

    // Verify conversation exists
    const conversation = await findConversationById(db, conversation_id);
    if (!conversation) {
      return errorResponse(
        c,
        'CONVERSATION_NOT_FOUND',
        `Conversation not found: ${conversation_id}`
      );
    }

    // Short-circuit: empty turns → no LLM call needed. Travels as a
    // clean `kind:'ok'` outcome with no warnings so clients consume the
    // same envelope on every code path.
    if (turns.length === 0) {
      return c.json(
        {
          success: true as const,
          data: { kind: 'ok' as const, ops: [], warnings: [] },
        },
        200
      );
    }

    // Snapshot must match the workspace's active applied tree. Apply for
    // staged Extract drafts is append-oriented, so re-extract should
    // extend the current active yops_log replay instead of compiling
    // against only the committed baseline. Otherwise the LLM can return
    // duplicate bootstrap ops that the web worker rejects against the
    // already-applied materialized tree.
    const baselineSnapshot = await replayActiveDraftOnBaseline(db, conversation_id);
    const mode = baselineSnapshot.trees.length > 0 ? 'incremental' : 'bootstrap';

    // Call the LLM via the unified provider/model selection chain.
    try {
      const resolution = await resolveProviderAndModel({
        db,
        requestedProvider,
        requestedModel,
        conversationId: conversation_id,
        userId: getUserId(c),
        unavailableMessage: 'No configured extraction provider is available',
      });
      if (!resolution.ok) {
        // Resolver distinguishes "no usable key configured" (`unavailable`)
        // from genuine bad-request shapes (unknown provider, unknown
        // model, provider/model mismatch). Collapsing them all onto
        // PROVIDER_KEY_MISSING would mislead a caller who typo'd a
        // provider name into thinking they need to set an API key.
        const errorCode =
          resolution.code === 'unavailable' ? 'PROVIDER_KEY_MISSING' : 'INVALID_REQUEST';
        return errorResponse(c, errorCode, resolution.message);
      }

      // Map the wire-level preset name to the full ExtractionStyleConfig
      // the core pipeline expects. Omitted preset → undefined → core
      // emits the historical no-style prompt.
      const style = preset ? PRESETS[preset as PresetName] : undefined;

      const pipelineResult = await extractAndApply({
        turns: turns.map((turn) => ({
          turn_hash: turn.turn_hash,
          role: turn.role ?? 'user',
          content: turn.content,
        })),
        mode,
        providerId: resolution.providerId,
        provider: resolution.provider,
        model: resolution.model,
        snapshot: baselineSnapshot.trees.length > 0 ? baselineSnapshot : undefined,
        style,
      });

      // Transport failures (rate-limit, auth, upstream 5xx) carry HTTP
      // semantics in their own right and must not be buried inside a
      // 200 `kind:'failed'` envelope — generic client error handlers
      // (retry-after, re-auth flow) depend on the HTTP status.
      if (!pipelineResult.ok && pipelineResult.failure.code === 'transport') {
        const transport = classifyTransportFailure(pipelineResult.failure);
        if (transport) {
          return errorResponse(
            c,
            transport.code,
            pipelineResult.failure.message,
            transport.details
          );
        }
        // Non-specific transport failure — upstream provider unavailable.
        return errorResponse(c, 'PROVIDER_UNAVAILABLE', pipelineResult.failure.message, {
          failure_code: pipelineResult.failure.code,
          ...pipelineResult.failure.details,
        });
      }

      // Every other outcome — clean ok, salvaged partial, exhausted
      // domain failure — is the extraction process *delivering* a
      // verdict. Travel as a 200 ExtractionOutcome so clients branch on
      // `data.kind` rather than HTTP status.
      const outcome = extractToOutcome(pipelineResult);
      return c.json({ success: true as const, data: outcome }, 200);
    } catch (err) {
      // Unexpected error from the LLM/provider call path. The pipeline
      // is supposed to convert provider errors to typed failures, so
      // landing here means something genuinely unexpected happened.
      const message = err instanceof Error ? err.message : 'LLM provider error';
      return errorResponse(c, 'INTERNAL_ERROR', message);
    }
  } catch (err) {
    // Outer catch: failures from getDB / findConversationById /
    // replayActiveDraftOnBaseline. Genuine infrastructure errors.
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'INTERNAL_ERROR', message);
  }
});

export default extractYopsRoutes;
