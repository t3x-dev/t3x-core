/**
 * Tool-Use Extraction Strategy
 *
 * Uses LLM tool-use (function calling) for extraction.
 * Each YOp type is exposed as a tool -- the LLM calls tools
 * to build the semantic tree incrementally.
 */

import type { LLMPrompt, LLMProvider } from '../../llm/types';
import type { SemanticContent } from '../../semantic/types';
import { validateIntegrity } from '../../semantic/validate';
import { ylint } from '../../ylint';
import { applyYOps } from '../../yops/engine';
import type { YOp } from '../../yops/types';
import type { ExtractionStyleConfig } from '../extractionStyleConfig';
import type { ExtractionResult } from '../extractor';
import type { ExtractionInput } from '../yopsPrompt';
import { toolCallToYOp, yopToolDefinitions } from './tool-schemas';
import type { ExtractionStrategy } from './types';

const TEMPERATURE = 0.1;
const MAX_TOKENS = 8192;
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

export class ToolUseExtractionStrategy implements ExtractionStrategy {
  readonly name = 'tool-use';

  constructor(private readonly model: string = DEFAULT_MODEL) {}

  async extract(
    input: ExtractionInput,
    provider: LLMProvider,
    _style?: ExtractionStyleConfig
  ): Promise<ExtractionResult> {
    if (!provider.generateWithTools) {
      return {
        ok: false,
        error: 'Provider does not support generateWithTools -- cannot use tool-use strategy',
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }

    const baseSnapshot: SemanticContent = input.snapshot ?? { trees: [], relations: [] };
    const prompt = this.buildPrompt(input);

    let result;
    try {
      result = await provider.generateWithTools(prompt, yopToolDefinitions, {
        model: this.model,
        temperature: TEMPERATURE,
        maxTokens: MAX_TOKENS,
      });
    } catch (err) {
      return {
        ok: false,
        error: `LLM provider error: ${err instanceof Error ? err.message : String(err)}`,
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }

    // No tool calls = no extraction needed
    if (result.tool_calls.length === 0) {
      return {
        ok: true,
        yops: [],
        snapshot: baseSnapshot,
        usage: result.usage,
      };
    }

    // Convert tool calls to YOps, collecting valid ones
    const validYOps: YOp[] = [];
    const errors: string[] = [];

    for (const call of result.tool_calls) {
      const converted = toolCallToYOp(call.name, call.input);
      if (converted.ok) {
        validYOps.push(converted.yop);
      } else {
        errors.push(`[${call.id}] ${converted.error}`);
      }
    }

    // All invalid
    if (validYOps.length === 0 && errors.length > 0) {
      return {
        ok: false,
        error: `No valid tool calls. Errors: ${errors.join('; ')}`,
        usage: result.usage,
      };
    }

    // Apply valid YOps
    const applyResult = applyYOps(baseSnapshot, validYOps);
    if (!applyResult.ok) {
      return {
        ok: false,
        error: `Failed to apply YOps: ${applyResult.error?.message ?? 'unknown'}`,
        usage: result.usage,
      };
    }

    const snapshot: SemanticContent = {
      trees: applyResult.trees,
      relations: applyResult.relations,
    };

    // Validate integrity
    const validation = validateIntegrity(snapshot);
    if (!validation.valid) {
      return {
        ok: false,
        error: `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
        usage: result.usage,
      };
    }

    const lintResult = ylint(snapshot);

    return {
      ok: true,
      yops: validYOps,
      snapshot,
      usage: result.usage,
      lintResult,
    };
  }

  private buildPrompt(input: ExtractionInput): LLMPrompt {
    const hasSnapshot = !!input.snapshot && input.snapshot.trees.length > 0;

    const system = `You are a knowledge extraction engine. Read the conversation and extract ALL facts into a structured tree by calling the provided tools.

## Rules
- Call yop_add to create nodes with slots and source quotes
- Call yop_set to update existing slots
- Call yop_drop/yop_unset to remove outdated information
- Use other tools (rename, move, nest, split, fold, merge, relate, unrelate) for tree reorganization
- Every tool call MUST include "source" (short verbatim phrase) and "from" (turn tag like T1, T2)
- Keys use snake_case, paths use / separator
- One root node named after the conversation topic
- Extract MORE rather than less -- capture every fact, number, list item
- Values: clean data (numbers, short labels, booleans, arrays) -- NOT full sentences`;

    const turns = input.turns
      .map((t, i) => {
        const tag = t.turn_hash ? `[T${i + 1}:${t.turn_hash.slice(0, 8)}]` : `[T${i + 1}]`;
        return `${tag} [${t.role}]: ${t.content}`;
      })
      .join('\n');

    let userContent: string;
    if (hasSnapshot) {
      const snapshotDesc = JSON.stringify(input.snapshot, null, 2);
      userContent = `## Current Tree\n${snapshotDesc}\n\n## Conversation\n${turns}\n\nExtract changes from the conversation using the tools.`;
    } else {
      userContent = `## Conversation\n${turns}\n\nExtract ALL knowledge into a tree using the tools. Capture EVERY fact.`;
    }

    return {
      system,
      messages: [{ role: 'user', content: userContent }],
    };
  }
}
