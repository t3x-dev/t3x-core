/**
 * Tool-Use Extraction Strategy
 *
 * Uses LLM tool-use (function calling) for extraction.
 * Each YOp type is exposed as a tool — the LLM calls tools
 * to build the semantic tree incrementally.
 *
 * Multi-round loop: send prompt → get tool calls → validate → send tool_results back → repeat
 * until the LLM stops calling tools (end_turn with no tool calls).
 */

import type { ContentBlock, LLMPrompt, LLMProvider, ToolUseResult } from '../../llm/types';
import type { SemanticContent } from '../../semantic/types';
import { validateIntegrity } from '../../semantic/validate';
import { ylint } from '../../ylint';
import { applyYOps } from '../../yops/engine';
import type { YOp } from '../../yops/types';
import type { ExtractionStyleConfig } from '../extractionStyleConfig';
import type { ExtractionResult } from '../extractor';
import type { ExtractionInput } from '../yopsPrompt';
import { toolCallToYOps, yopToolDefinitions } from './tool-schemas';
import type { ExtractionStrategy } from './types';

const TEMPERATURE = 0.1;
const MAX_TOKENS = 8192;
const MAX_ROUNDS = 10;
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

export class ToolUseExtractionStrategy implements ExtractionStrategy {
  readonly name = 'tool-use';

  constructor(private readonly model: string = DEFAULT_MODEL) {}

  async extract(
    input: ExtractionInput,
    provider: LLMProvider,
    _style?: ExtractionStyleConfig,
  ): Promise<ExtractionResult> {
    if (!provider.generateWithTools) {
      return {
        ok: false,
        error: 'Provider does not support generateWithTools — cannot use tool-use strategy',
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }

    const baseSnapshot: SemanticContent = input.snapshot ?? { trees: [], relations: [] };
    const prompt = this.buildPrompt(input);
    const totalUsage = { inputTokens: 0, outputTokens: 0 };
    const allYOps: YOp[] = [];
    const allErrors: string[] = [];
    let totalToolCalls = 0;

    // Multi-round loop: send prompt → get tool calls → send tool_results → repeat
    const messages = [...prompt.messages] as Array<{
      role: 'user' | 'assistant';
      content: string | ContentBlock[];
    }>;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      let result: ToolUseResult;
      try {
        result = await provider.generateWithTools(
          { system: prompt.system, messages },
          yopToolDefinitions,
          { model: this.model, temperature: TEMPERATURE, maxTokens: MAX_TOKENS },
        );
      } catch (err) {
        // If we already have some YOps from previous rounds, use them
        if (allYOps.length > 0) break;
        return {
          ok: false,
          error: `LLM provider error: ${err instanceof Error ? err.message : String(err)}`,
          usage: totalUsage,
        };
      }

      totalUsage.inputTokens += result.usage.inputTokens;
      totalUsage.outputTokens += result.usage.outputTokens;

      // No tool calls → done
      if (result.tool_calls.length === 0) break;

      // Process tool calls → YOps
      totalToolCalls += result.tool_calls.length;
      const toolResults: Array<{ tool_use_id: string; content: string; is_error: boolean }> = [];

      for (const call of result.tool_calls) {
        const converted = toolCallToYOps(call.name, call.input);
        if (converted.ok) {
          allYOps.push(...converted.yops);
          toolResults.push({ tool_use_id: call.id, content: 'OK', is_error: false });
        } else {
          allErrors.push(`[${call.id}] ${converted.error}`);
          toolResults.push({ tool_use_id: call.id, content: converted.error, is_error: true });
        }
      }

      // If stop_reason is end_turn, LLM is done (even if it called tools in this response)
      if (result.stop_reason === 'end_turn') break;

      // stop_reason === 'tool_use' → LLM expects tool_results, continue loop
      // Append assistant response + tool results to messages for next round
      if (result._rawAssistantContent) {
        messages.push({ role: 'assistant', content: result._rawAssistantContent });
      }
      messages.push({
        role: 'user',
        content: toolResults.map((r) => ({
          type: 'tool_result',
          tool_use_id: r.tool_use_id,
          content: r.content,
          ...(r.is_error ? { is_error: true } : {}),
        })),
      });
    }

    // LLM called tools but all failed validation
    if (allYOps.length === 0 && totalToolCalls > 0) {
      return {
        ok: false,
        error: `No valid tool calls. Errors: ${allErrors.join('; ')}`,
        usage: totalUsage,
      };
    }

    // No tool calls at all = no extraction needed
    if (allYOps.length === 0) {
      return { ok: true, yops: [], snapshot: baseSnapshot, usage: totalUsage };
    }

    // Apply all collected YOps
    const applyResult = applyYOps(baseSnapshot, allYOps);
    if (!applyResult.ok) {
      return {
        ok: false,
        error: `Failed to apply YOps: ${applyResult.error?.message ?? 'unknown'}`,
        usage: totalUsage,
      };
    }

    const snapshot: SemanticContent = {
      trees: applyResult.trees,
      relations: applyResult.relations,
    };

    const validation = validateIntegrity(snapshot);
    if (!validation.valid) {
      return {
        ok: false,
        error: `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
        usage: totalUsage,
      };
    }

    const lintResult = ylint(snapshot);

    return { ok: true, yops: allYOps, snapshot, usage: totalUsage, lintResult };
  }

  private buildPrompt(input: ExtractionInput): LLMPrompt {
    const hasSnapshot = !!input.snapshot && input.snapshot.trees.length > 0;

    const system = `You are a knowledge extraction engine. Read the conversation and extract ALL facts into a structured tree by calling the provided tools.

## Rules
- Call yop_add to create nodes. Use parent="" for root-level, parent="node_key" to nest under existing nodes.
- Call yop_add with ONE node key per call. Example: node={"hotel": {"name": "Hilton", "stars": 5}}
- The "source" field must be an object mapping slot keys to quotes: {"name": "called Hilton", "stars": "5 stars"}
- Call yop_set to update existing slot values
- Call yop_drop/yop_unset to remove outdated information
- Every tool call MUST include "from" (turn tag like T1, T2)
- Keys use snake_case, paths use / separator
- Start with ONE root node named after the conversation topic (parent="")
- Then add child nodes under it (parent="root_key")
- Extract MORE rather than less — capture every fact, number, list item
- Values: clean data (numbers, short labels, booleans, arrays) — NOT full sentences`;

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
      messages: [{ role: 'user' as const, content: userContent }],
    };
  }
}
