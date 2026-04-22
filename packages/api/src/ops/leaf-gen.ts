/**
 * leafGenerateOp — unified pipeline operation for leaf generation.
 *
 * Steps:
 *   load      — fetch leaf, commit, historical leaves
 *   analyze   — collect lessons from assertions, prepare generation inputs
 *   transform — LLM generation via provider registry (fast / standard / thorough)
 *   validate  — run constraint validation on output (fast mode only)
 *   persist   — update leaf output, create leaf history entry
 */

import type { GenerationMode, Operation, PipelineEvent } from '@t3x-dev/core';
import { collectLessonsFromAssertions, generateLeafOutput, modeGenerate } from '@t3x-dev/core';
import {
  createLeafHistory,
  findLeafById,
  findLeavesByCommit,
  getCommitUnified,
  updateLeaf,
  updateLeafOutput,
} from '@t3x-dev/storage';
import { createModelBoundProvider, resolveProviderAndModel } from '../lib/provider-resolver';
import { recordUsageFireAndForget } from '../lib/usage-tracking';
import { pinoLogger } from '../middleware/logger';
import type { ApiPipelineContext } from './context';

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface LeafGenInput {
  leafId: string;
  mode: GenerationMode;
  userId?: string;
  stylePreferences?: {
    tone?: string;
    length?: string;
    formality?: string;
  };
}

export interface LeafGenOutput {
  output: string;
  generated_at: string;
  validation?: {
    all_passed: boolean;
    passed_count: number;
    failed_count: number;
    attempts: number;
  };
  rounds?: Array<{
    name: string;
    round_number: number;
    constraints_passed: boolean;
    failed_constraints: string[];
  }>;
  total_rounds?: number;
  mode: GenerationMode;
  /** The updated leaf record (after output + assertions persisted). */
  leaf: Awaited<ReturnType<typeof findLeafById>>;
}

// ---------------------------------------------------------------------------
// Operation
// ---------------------------------------------------------------------------

export const leafGenerateOp: Operation<LeafGenInput, LeafGenOutput> = {
  name: 'leaf-generate',
  async *run(input: LeafGenInput, ctx): AsyncGenerator<PipelineEvent, LeafGenOutput> {
    const { db } = ctx as ApiPipelineContext;
    const { leafId, mode, userId, stylePreferences } = input;

    // ---- load ----
    yield { type: 'step_start', step: 'load' };

    const leaf = await findLeafById(db, leafId);
    if (!leaf) {
      throw new Error(`Leaf not found: ${leafId}`);
    }

    const unifiedCommit = await getCommitUnified(db, leaf.commit_hash);
    if (!unifiedCommit) {
      throw new Error(`Source commit not found: ${leaf.commit_hash}`);
    }
    const knowledge = unifiedCommit.content;

    const historicalLeaves = await findLeavesByCommit(db, leaf.commit_hash);

    yield { type: 'step_done', step: 'load' };

    // ---- analyze ----
    yield { type: 'step_start', step: 'analyze' };

    const lessons = collectLessonsFromAssertions(
      historicalLeaves.map((l) => ({ id: l.id, assertions: l.assertions }))
    );

    yield { type: 'step_done', step: 'analyze' };

    // ---- transform ----
    yield { type: 'step_start', step: 'transform' };

    let finalOutput: string;
    let generationModel = 'unknown';
    let validationData:
      | {
          allPassed: boolean;
          passedCount: number;
          failedCount: number;
          attempts: number;
          assertions?: Array<{
            id: string;
            constraint_id: string;
            passed: boolean;
            details: string;
            lesson?: string;
          }>;
        }
      | undefined;
    let multiRoundResult:
      | {
          output: string;
          rounds: Array<{
            name: string;
            round_number: number;
            constraints_passed: boolean;
            failed_constraints: string[];
          }>;
          total_rounds: number;
          mode: GenerationMode;
        }
      | undefined;

    const providerResolution = await resolveProviderAndModel({
      db,
      projectId: leaf.project_id,
      userId,
      unavailableMessage: 'No configured generation provider is available',
    });
    if (!providerResolution.ok) {
      throw new Error(providerResolution.message);
    }

    const boundProvider = await createModelBoundProvider(providerResolution.model);
    if (!boundProvider) {
      throw new Error(`Provider ${providerResolution.providerId} is unavailable`);
    }

    if (mode !== 'fast') {
      multiRoundResult = await modeGenerate({
        knowledge,
        leaf,
        provider: boundProvider,
        mode,
        stylePreferences: stylePreferences
          ? {
              tone: stylePreferences.tone,
              length: stylePreferences.length,
              formality: stylePreferences.formality,
            }
          : undefined,
      });
      finalOutput = multiRoundResult.output;
      generationModel = providerResolution.model;

      // Record multi-round usage (fire-and-forget)
      // biome-ignore lint/suspicious/noExplicitAny: usage shape varies by provider
      const mrUsage = (multiRoundResult as any).usage;
      if (mrUsage?.inputTokens || mrUsage?.outputTokens) {
        recordUsageFireAndForget(db, {
          user_id: userId,
          project_id: leaf.project_id,
          endpoint: 'leaf_generate',
          model: generationModel,
          input_tokens: mrUsage.inputTokens,
          output_tokens: mrUsage.outputTokens,
        });
      }
    } else {
      const result = await generateLeafOutput({
        knowledge,
        leaf,
        model: providerResolution.model,
        provider: boundProvider,
        lessons: lessons.length > 0 ? lessons : undefined,
        additionalInstructions:
          typeof leaf.config?.user_instruction === 'string'
            ? leaf.config.user_instruction
            : undefined,
      });
      finalOutput = result.output;
      generationModel = result.model;

      // Record single-round usage (fire-and-forget)
      if (result.usage.inputTokens || result.usage.outputTokens) {
        recordUsageFireAndForget(db, {
          user_id: userId,
          project_id: leaf.project_id,
          endpoint: 'leaf_generate',
          model: generationModel,
          input_tokens: result.usage.inputTokens,
          output_tokens: result.usage.outputTokens,
        });
      }

      if (result.validation) {
        validationData = {
          allPassed: result.validation.allPassed,
          passedCount: result.validation.passedCount,
          failedCount: result.validation.failedCount,
          attempts: result.attempts,
          assertions: result.validation.assertions,
        };
      }
    }

    yield { type: 'step_done', step: 'transform' };

    // ---- validate ----
    // Auto-validation assertions are produced during fast-mode transform.
    // This step stores them if present.
    if (validationData?.assertions) {
      yield { type: 'step_start', step: 'validate' };
      // Assertions will be persisted in the persist step alongside the output.
      yield { type: 'step_done', step: 'validate' };
    }

    // ---- persist ----
    yield { type: 'step_start', step: 'persist' };

    const updatedLeaf = await updateLeafOutput(db, leafId, finalOutput);
    if (!updatedLeaf) {
      throw new Error('Failed to update leaf with generated output');
    }

    // Store auto-validation assertions on the leaf
    let finalLeaf = updatedLeaf;
    if (validationData?.assertions) {
      const leafWithAssertions = await updateLeaf(db, leafId, {
        assertions: validationData.assertions,
      });
      if (leafWithAssertions) {
        finalLeaf = leafWithAssertions;
      }
    }

    // Save to generation history (non-blocking)
    try {
      await createLeafHistory(db, {
        leaf_id: leafId,
        output: finalOutput,
        config: { ...(leaf.config ?? {}), generation_mode: mode },
        model: generationModel,
      });
    } catch (historyErr) {
      pinoLogger.warn({ err: historyErr }, 'failed to save generation history');
    }

    yield { type: 'step_done', step: 'persist' };

    // ---- build result ----
    return {
      output: finalOutput,
      generated_at: updatedLeaf.generated_at ?? new Date().toISOString(),
      mode,
      leaf: finalLeaf,
      ...(validationData
        ? {
            validation: {
              all_passed: validationData.allPassed,
              passed_count: validationData.passedCount,
              failed_count: validationData.failedCount,
              attempts: validationData.attempts ?? 1,
            },
          }
        : {}),
      ...(multiRoundResult
        ? {
            rounds: multiRoundResult.rounds.map((r) => ({
              name: r.name,
              round_number: r.round_number,
              constraints_passed: r.constraints_passed,
              failed_constraints: r.failed_constraints,
            })),
            total_rounds: multiRoundResult.total_rounds,
          }
        : {}),
    };
  },
};
