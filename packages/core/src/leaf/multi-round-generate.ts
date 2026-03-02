/**
 * Multi-Round Leaf Generation (#12)
 *
 * Progressive refinement: each round builds on the previous output.
 * - Round 1 (draft): Generate initial output from commit + constraints
 * - Round 2+ (refine): Improve previous output with round-specific instructions
 *
 * Supports early exit when output meets quality criteria.
 */

import type { LLMProvider } from '../llm/types';
import type { CommitV4, Leaf } from '../types/v4';
import { buildLeafPrompt } from './build-prompt';
import type { GenerateOptions } from './types';

export interface RoundConfig {
  name: string;
  instruction: string;
}

export interface RoundResult {
  name: string;
  output: string;
  round_number: number;
}

export interface MultiRoundOptions {
  commit: CommitV4;
  leaf: Leaf;
  provider: LLMProvider;
  rounds: RoundConfig[];
  earlyExit?: (output: string) => boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface MultiRoundResult {
  output: string;
  rounds: RoundResult[];
}

export async function multiRoundGenerate(
  options: MultiRoundOptions,
): Promise<MultiRoundResult> {
  const {
    commit,
    leaf,
    provider,
    rounds,
    earlyExit,
    temperature = 0.7,
    maxTokens = 1024,
  } = options;

  const results: RoundResult[] = [];
  let previousOutput = '';

  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];
    const prompt = buildRoundPrompt(commit, leaf, round, previousOutput, i);

    const output = await provider.generate(prompt, { temperature, maxTokens });

    results.push({
      name: round.name,
      output,
      round_number: i + 1,
    });

    previousOutput = output;

    if (earlyExit?.(output)) break;
  }

  return {
    output: previousOutput,
    rounds: results,
  };
}

function buildRoundPrompt(
  commit: CommitV4,
  leaf: Leaf,
  round: RoundConfig,
  previousOutput: string,
  roundIndex: number,
): string {
  const sentences = commit.content.sentences.map((s) => s.text).join('\n');
  const constraints = (leaf.constraints ?? [])
    .map((c) => `[${c.type}] ${c.value}`)
    .join('\n');

  const parts: string[] = [];

  parts.push(`You are generating content for a "${leaf.type}" leaf titled "${leaf.title ?? 'Untitled'}".`);
  parts.push(`\nKnowledge base:\n${sentences}`);

  if (constraints) {
    parts.push(`\nConstraints:\n${constraints}`);
  }

  parts.push(`\nRound ${roundIndex + 1} instruction: ${round.instruction}`);

  if (previousOutput) {
    parts.push(`\nPrevious output:\n${previousOutput}`);
    parts.push('\nImprove the previous output according to the round instruction.');
  } else {
    parts.push('\nGenerate the initial output.');
  }

  return parts.join('\n');
}
