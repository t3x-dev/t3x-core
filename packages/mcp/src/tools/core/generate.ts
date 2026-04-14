/**
 * t3x_generate — generate leaf output with constraint validation.
 *
 * A leaf defines constraints on committed knowledge. This tool:
 *   1. Fetches the leaf (with its constraints) and its linked commit
 *   2. Optionally collects lessons from historical leaves on the same commit
 *   3. Calls generateLeafOutput (from @t3x-dev/core) using a direct Anthropic provider
 *   4. Persists the output and auto-validation assertions to the leaf record
 *   5. Returns output + per-constraint assertion results + score summary
 *
 * This is a simplified version of the full API leaf-gen pipeline
 * (packages/api/src/ops/leaf-gen.ts). It omits:
 *   - Multi-round generation modes (standard / thorough)
 *   - Leaf history recording
 *   - Usage token metering
 *   - Webhook / push-notification dispatch
 *
 * These features require API-layer infrastructure (provider registry singleton,
 * webhook dispatcher, usage tracking). A future refactor could expose them via
 * shared library functions usable both by the API and by MCP.
 */

import {
  collectLessonsFromAssertions,
  createClaudeProvider,
  createProviderRegistry,
  generateLeafOutput,
  type LLMProvider,
} from '@t3x-dev/core';
import {
  findLeafById,
  findLeavesByCommit,
  getCommitUnified,
  updateLeaf,
  updateLeafOutput,
} from '@t3x-dev/storage';

import { getDB } from '../../db.js';
import { fail, ok, type ToolDef, type ToolHandler } from '../types.js';

// ── Tool definition ──

export const generateDef: ToolDef = {
  name: 't3x_generate',
  description: [
    'Generate leaf output and run constraint validation. Uses server-side LLM.',
    '',
    'A leaf is a constrained output target attached to a commit. This tool:',
    '  1. Loads the leaf and its linked commit knowledge',
    "  2. Runs LLM generation respecting the leaf's require/exclude constraints",
    '  3. Validates the output against constraints (auto-retry up to 3x on failure)',
    '  4. Persists output + assertion results to the leaf record',
    '  5. Returns output, per-constraint assertions, and a pass/fail score summary',
    '',
    'Requires ANTHROPIC_API_KEY to be set in the MCP server environment.',
    '',
    'Example:',
    '  { "leaf_id": "leaf_abc123" }',
    '  { "leaf_id": "leaf_abc123", "model": "claude-opus-4-20250514", "max_tokens": 2048 }',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      leaf_id: {
        type: 'string',
        description: 'ID of the leaf to generate output for (e.g. "leaf_abc123").',
      },
      model: {
        type: 'string',
        description:
          'Optional. LLM model to use for generation. ' + 'Defaults to "claude-sonnet-4-20250514".',
      },
      max_tokens: {
        type: 'number',
        description:
          'Optional. Maximum tokens for the generated output. ' +
          'Defaults to 4096 (or per-type defaults: tweet=256, article=4096, etc.).',
      },
    },
    required: ['leaf_id'],
  },
  annotations: {
    readOnlyHint: false,
    idempotentHint: false,
  },
};

// ── Helpers ──

/**
 * Build a minimal provider registry wired to the Anthropic API key.
 * Mirrors the same pattern used by extract.ts.
 */
function buildRegistry() {
  const reg = createProviderRegistry();

  reg.register({
    id: 'anthropic',
    name: 'Anthropic Claude',
    role: 'generation',
    requiredEnvKeys: ['ANTHROPIC_API_KEY'],
    defaultModel: 'claude-sonnet-4-20250514',
    factory: (config) =>
      createClaudeProvider({
        apiKey: config.ANTHROPIC_API_KEY!,
        baseUrl: process.env.ANTHROPIC_BASE_URL,
      }),
  });

  reg.autoConfigureFromEnv();
  return reg;
}

// ── Handler ──

export const generateHandler: ToolHandler = async (args) => {
  const leafId = args.leaf_id as string | undefined;
  const model = args.model as string | undefined;
  const maxTokens = args.max_tokens as number | undefined;

  // ── Validate required params ──
  if (!leafId) {
    return fail('"leaf_id" is required.\nProvide the ID of the leaf to generate output for.');
  }

  // ── Check LLM availability ──
  if (!process.env.ANTHROPIC_API_KEY) {
    return fail(
      'ANTHROPIC_API_KEY is not set.\n\n' +
        'Leaf generation requires a configured LLM provider. Set the ANTHROPIC_API_KEY ' +
        'environment variable to enable generation.\n\n' +
        'Example: export ANTHROPIC_API_KEY=sk-ant-...'
    );
  }

  const db = await getDB();

  // ── Step 1: Fetch the leaf ──
  const leaf = await findLeafById(db, leafId);
  if (!leaf) {
    return fail(`Leaf not found: ${leafId}`);
  }

  // ── Step 2: Fetch the linked commit ──
  const unifiedCommit = await getCommitUnified(db, leaf.commit_hash);
  if (!unifiedCommit) {
    return fail(
      `Source commit not found for leaf ${leafId}.\n` + `Commit hash: ${leaf.commit_hash}`
    );
  }
  const knowledge = unifiedCommit.content;

  // ── Step 3: Collect lessons from historical leaves (optional improvement) ──
  let lessons: string[] | undefined;
  try {
    const historicalLeaves = await findLeavesByCommit(db, leaf.commit_hash);
    const collected = collectLessonsFromAssertions(
      historicalLeaves.map((l) => ({ id: l.id, assertions: l.assertions }))
    );
    if (collected.length > 0) {
      lessons = collected;
    }
  } catch {
    // Lessons are optional — proceed without them
  }

  // ── Step 4: Run generation via provider registry ──
  const registry = buildRegistry();
  let result: Awaited<ReturnType<typeof generateLeafOutput>>;

  try {
    result = await registry.tryWithFallback<
      LLMProvider,
      Awaited<ReturnType<typeof generateLeafOutput>>
    >('generation', (provider) =>
      generateLeafOutput({
        knowledge,
        leaf,
        provider,
        lessons,
        ...(model ? { model } : {}),
        ...(maxTokens ? { maxTokens } : {}),
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`Generation failed: ${message}`);
  }

  // ── Step 5: Persist output to the leaf ──
  let updatedLeaf = await updateLeafOutput(db, leafId, result.output);
  if (!updatedLeaf) {
    return fail('Failed to persist generated output to leaf record.');
  }

  // ── Step 6: Persist assertions if validation ran ──
  if (result.validation?.assertions) {
    const leafWithAssertions = await updateLeaf(db, leafId, {
      assertions: result.validation.assertions,
    });
    if (leafWithAssertions) {
      updatedLeaf = leafWithAssertions;
    }
  }

  // ── Build response ──
  const validation = result.validation;
  const assertions = validation?.assertions ?? [];

  return ok({
    leaf_id: leafId,
    output: result.output,
    generated_at: updatedLeaf.generated_at ?? new Date().toISOString(),
    model: result.model,
    attempts: result.attempts,
    score: {
      all_passed: validation?.allPassed ?? true,
      passed: validation?.passedCount ?? 0,
      failed: validation?.failedCount ?? 0,
      total: assertions.length,
    },
    assertions: assertions.map((a) => ({
      id: a.id,
      constraint_id: a.constraint_id,
      passed: a.passed,
      details: a.details,
      ...(a.lesson ? { lesson: a.lesson } : {}),
    })),
    usage: {
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
    },
  });
};
