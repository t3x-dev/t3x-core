/**
 * Extraction Benchmark
 *
 * Runs YAML and tool-use strategies on the same input,
 * collects metrics for A/B comparison.
 */

import type { LLMProvider } from '../llm/types';
import type { SemanticContent, TreeNode } from '../semantic/types';
import type { ExtractionStyleConfig } from './extractionStyleConfig';
import type { ExtractionResult } from './extractor';
import { ToolUseExtractionStrategy } from './strategies/tool-use-strategy';
import { YamlExtractionStrategy } from './strategies/yaml-strategy';
import type { ExtractionInput } from './yopsPrompt';

// ── Metrics Helpers ──

function countNodes(trees: TreeNode[]): number {
  let count = 0;
  for (const tree of trees) {
    count += 1;
    count += countNodes(tree.children);
  }
  return count;
}

function countSlots(trees: TreeNode[]): number {
  let count = 0;
  for (const tree of trees) {
    count += Object.keys(tree.slots).length;
    count += countSlots(tree.children);
  }
  return count;
}

function totalTokens(usage: { inputTokens: number; outputTokens: number }): number {
  return usage.inputTokens + usage.outputTokens;
}

// ── Types ──

export interface BenchmarkComparison {
  yamlTotalTokens: number;
  toolUseTotalTokens: number;
  /** tool-use tokens / yaml tokens (< 3 is acceptable) */
  tokenRatio: number;
  yamlNodeCount: number;
  toolUseNodeCount: number;
  yamlSlotCount: number;
  toolUseSlotCount: number;
  yamlYopCount: number;
  toolUseYopCount: number;
}

export interface BenchmarkResult {
  yaml: ExtractionResult;
  toolUse: ExtractionResult;
  comparison: BenchmarkComparison;
  yamlDurationMs: number;
  toolUseDurationMs: number;
}

// ── Runner ──

export async function runBenchmark(
  input: ExtractionInput,
  provider: LLMProvider,
  style?: ExtractionStyleConfig,
  model?: string
): Promise<BenchmarkResult> {
  const yamlStrategy = new YamlExtractionStrategy();
  const toolUseStrategy = new ToolUseExtractionStrategy(model);

  // Run YAML strategy
  const yamlStart = Date.now();
  const yamlResult = await yamlStrategy.extract(input, provider, style);
  const yamlDurationMs = Date.now() - yamlStart;

  // Run tool-use strategy
  const toolUseStart = Date.now();
  const toolUseResult = await toolUseStrategy.extract(input, provider, style);
  const toolUseDurationMs = Date.now() - toolUseStart;

  // Compute comparison metrics
  const yamlTokens = totalTokens(yamlResult.usage);
  const toolUseTokens = totalTokens(toolUseResult.usage);

  const yamlSnapshot: SemanticContent = yamlResult.ok
    ? yamlResult.snapshot
    : { trees: [], relations: [] };
  const toolUseSnapshot: SemanticContent = toolUseResult.ok
    ? toolUseResult.snapshot
    : { trees: [], relations: [] };

  const comparison: BenchmarkComparison = {
    yamlTotalTokens: yamlTokens,
    toolUseTotalTokens: toolUseTokens,
    tokenRatio: yamlTokens > 0 ? toolUseTokens / yamlTokens : 0,
    yamlNodeCount: countNodes(yamlSnapshot.trees),
    toolUseNodeCount: countNodes(toolUseSnapshot.trees),
    yamlSlotCount: countSlots(yamlSnapshot.trees),
    toolUseSlotCount: countSlots(toolUseSnapshot.trees),
    yamlYopCount: yamlResult.ok ? yamlResult.yops.length : 0,
    toolUseYopCount: toolUseResult.ok ? toolUseResult.yops.length : 0,
  };

  return {
    yaml: yamlResult,
    toolUse: toolUseResult,
    comparison,
    yamlDurationMs,
    toolUseDurationMs,
  };
}
