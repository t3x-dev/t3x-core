/**
 * Multi-Round Leaf Generation (#12)
 *
 * Progressive refinement: each round builds on the previous output.
 * - Round 1 (draft): Generate initial output from commit + constraints
 * - Round 2 (refine): Improve previous output ensuring all constraints pass
 * - Round 3 (polish): Final style and tone refinement
 *
 * Supports three generation modes:
 * - fast: Single round (default, backward-compatible)
 * - standard: Two rounds (draft + constraint refinement)
 * - thorough: Three rounds (draft + refinement + polish)
 *
 * Also supports custom rounds via the existing RoundConfig interface.
 */

import type { LLMProvider } from '../llm/types';
import type { CommitV4, Leaf } from '../types/v4';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

/** Generation mode controlling how many rounds are executed */
export type GenerationMode = 'fast' | 'standard' | 'thorough';

export interface RoundConfig {
  name: string;
  instruction: string;
}

export interface RoundResult {
  name: string;
  output: string;
  round_number: number;
  /** Constraint IDs that failed validation after this round (empty = all passed) */
  failed_constraints: string[];
  /** Whether all constraints passed after this round */
  constraints_passed: boolean;
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
  /** Total number of rounds executed */
  total_rounds: number;
  /** Generation mode used (only set when using mode-based generation) */
  mode?: GenerationMode;
}

/** Options for mode-based generation (higher-level API) */
export interface ModeGenerateOptions {
  commit: CommitV4;
  leaf: Leaf;
  provider: LLMProvider;
  mode: GenerationMode;
  /** Style preferences for Round 3 (thorough mode) */
  stylePreferences?: StylePreferences;
  temperature?: number;
  maxTokens?: number;
}

export interface StylePreferences {
  tone?: string;
  length?: string;
  formality?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Round Prompt Builders
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the Round 1 prompt: Generate structured output covering all REQUIRE constraints.
 *
 * This is the initial generation round that produces a first draft from
 * commit sentences and leaf constraints.
 */
export function buildRound1Prompt(
  sentences: Array<{ text: string }>,
  constraints: Array<{ type: string; value: string; match_mode: string }>,
  config?: { promptTemplate?: string }
): string {
  const parts: string[] = [];

  // Custom template takes precedence
  if (config?.promptTemplate) {
    parts.push(config.promptTemplate);
    parts.push('');
  }

  parts.push('## Knowledge Base');
  parts.push('');
  for (let i = 0; i < sentences.length; i++) {
    parts.push(`${i + 1}. ${sentences[i].text}`);
  }
  parts.push('');

  const requires = constraints.filter((c) => c.type === 'require');
  const excludes = constraints.filter((c) => c.type === 'exclude');

  if (requires.length > 0 || excludes.length > 0) {
    parts.push('## Constraints');
    parts.push('');

    if (requires.length > 0) {
      parts.push('### MUST include:');
      for (const c of requires) {
        const matchLabel = c.match_mode === 'exact' ? 'EXACTLY' : 'semantically';
        parts.push(`- Include ${matchLabel}: "${c.value}"`);
      }
      parts.push('');
    }

    if (excludes.length > 0) {
      parts.push('### MUST NOT include:');
      for (const c of excludes) {
        parts.push(`- Exclude: "${c.value}"`);
      }
      parts.push('');
    }
  }

  parts.push('## Task');
  parts.push(
    'Generate a structured output that covers ALL required constraints. ' +
      'Use the knowledge base as your source material. ' +
      'Ensure every REQUIRE constraint value appears in your output.'
  );

  return parts.join('\n');
}

/**
 * Build the Round 2 prompt: Refine to ensure ALL constraints are satisfied.
 *
 * Takes the Round 1 output and a list of failed constraints, asking the LLM
 * to fix specific issues while preserving overall quality.
 */
export function buildRound2Prompt(
  round1Output: string,
  failedConstraints: Array<{ type: string; value: string }>,
  allConstraints: Array<{ type: string; value: string; match_mode: string }>
): string {
  const parts: string[] = [];

  parts.push('## Previous Output');
  parts.push('');
  parts.push(round1Output);
  parts.push('');

  if (failedConstraints.length > 0) {
    parts.push('## Failed Constraints (MUST FIX)');
    parts.push('');
    for (const c of failedConstraints) {
      const action = c.type === 'require' ? 'was NOT found' : 'was FOUND (should be excluded)';
      parts.push(`- [${c.type.toUpperCase()}] "${c.value}" ${action}`);
    }
    parts.push('');
  }

  parts.push('## All Constraints (Reference)');
  parts.push('');
  for (const c of allConstraints) {
    const matchLabel = c.match_mode === 'exact' ? 'exact' : 'semantic';
    parts.push(`- [${c.type.toUpperCase()}] (${matchLabel}) "${c.value}"`);
  }
  parts.push('');

  parts.push('## Task');
  parts.push(
    'Refine the previous output to ensure ALL constraints are satisfied. ' +
      'Keep the overall structure and quality intact, but fix the specific failures listed above. ' +
      'Every REQUIRE constraint must appear in the output. ' +
      'No EXCLUDE constraint values should appear.'
  );

  return parts.join('\n');
}

/**
 * Build the Round 3 prompt: Polish tone and style.
 *
 * Final refinement pass that adjusts tone, formality, and style
 * without changing the substantive content or breaking constraints.
 */
export function buildRound3Prompt(
  round2Output: string,
  stylePreferences?: StylePreferences
): string {
  const parts: string[] = [];

  parts.push('## Current Output');
  parts.push('');
  parts.push(round2Output);
  parts.push('');

  parts.push('## Style Preferences');
  parts.push('');
  if (stylePreferences?.tone) {
    parts.push(`- Tone: ${stylePreferences.tone}`);
  }
  if (stylePreferences?.length) {
    parts.push(`- Length: ${stylePreferences.length}`);
  }
  if (stylePreferences?.formality) {
    parts.push(`- Formality: ${stylePreferences.formality}`);
  }
  if (!stylePreferences?.tone && !stylePreferences?.length && !stylePreferences?.formality) {
    parts.push('- No specific preferences. Improve overall readability and flow.');
  }
  parts.push('');

  parts.push('## Task');
  parts.push(
    'Polish the output for final publication. ' +
      'Adjust the tone and style according to the preferences above. ' +
      'Do NOT change the factual content or remove any constraint-satisfying text. ' +
      'Focus on readability, flow, and professional quality.'
  );

  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// Constraint Validation (Simple / Deterministic)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate output against constraints using simple checks.
 *
 * For `exact` match mode: case-insensitive substring check.
 * For `semantic` match mode: basic keyword overlap (word intersection).
 *
 * This is a lightweight check suitable for inter-round validation.
 * Full semantic validation (with embeddings) is handled by validate-constraints.ts.
 *
 * @returns Array of constraint IDs that failed validation
 */
export function validateConstraintsSimple(
  output: string,
  constraints: Array<{
    id: string;
    type: 'require' | 'exclude';
    value: string;
    match_mode: 'exact' | 'semantic';
  }>
): string[] {
  const failed: string[] = [];
  const outputLower = output.toLowerCase();

  for (const c of constraints) {
    if (c.match_mode === 'exact') {
      if (c.type === 'require') {
        // Must contain the value
        if (!outputLower.includes(c.value.toLowerCase())) {
          failed.push(c.id);
        }
      } else {
        // Must NOT contain the value
        if (outputLower.includes(c.value.toLowerCase())) {
          failed.push(c.id);
        }
      }
    } else {
      // Semantic: basic keyword overlap check
      const valueWords = new Set(
        c.value
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 2)
      );
      const outputWords = new Set(outputLower.split(/\s+/).filter((w) => w.length > 2));

      let matchCount = 0;
      for (const word of valueWords) {
        if (outputWords.has(word)) matchCount++;
      }

      const overlapRatio = valueWords.size > 0 ? matchCount / valueWords.size : 1;

      if (c.type === 'require') {
        // For semantic require, need >= 50% keyword overlap
        if (overlapRatio < 0.5) {
          failed.push(c.id);
        }
      } else {
        // For semantic exclude, fail if >= 70% keyword overlap
        if (overlapRatio >= 0.7) {
          failed.push(c.id);
        }
      }
    }
  }

  return failed;
}

// ═══════════════════════════════════════════════════════════════════════════
// Mode-Based Generation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate leaf output using a mode-based pipeline.
 *
 * Modes:
 * - `fast`: Single round (default). Equivalent to the original generateLeafOutput.
 * - `standard`: Two rounds. Round 1 generates, Round 2 fixes constraint failures.
 * - `thorough`: Three rounds. Adds a polish pass for style refinement.
 *
 * @returns MultiRoundResult with all round details
 */
export async function modeGenerate(options: ModeGenerateOptions): Promise<MultiRoundResult> {
  const {
    commit,
    leaf,
    provider,
    mode,
    stylePreferences,
    temperature = 0.7,
    maxTokens = 1024,
  } = options;

  const sentences = commit.content.sentences;
  const constraints = (leaf.constraints ?? []) as Array<{
    id: string;
    type: 'require' | 'exclude';
    value: string;
    match_mode: 'exact' | 'semantic';
  }>;

  const results: RoundResult[] = [];

  // ── Round 1: Initial generation ──
  const contextPrefix = `You are generating content for a "${leaf.type}" leaf titled "${leaf.title ?? 'Untitled'}".\n\n`;
  const round1Prompt =
    contextPrefix +
    buildRound1Prompt(
      sentences,
      constraints,
      leaf.config?.prompt_template
        ? { promptTemplate: leaf.config.prompt_template as string }
        : undefined
    );

  const round1Output = await provider.generate(round1Prompt, {
    temperature,
    maxTokens,
  });

  const round1Failed = validateConstraintsSimple(round1Output, constraints);

  results.push({
    name: 'draft',
    output: round1Output,
    round_number: 1,
    failed_constraints: round1Failed,
    constraints_passed: round1Failed.length === 0,
  });

  // Fast mode: return after Round 1
  if (mode === 'fast') {
    return {
      output: round1Output,
      rounds: results,
      total_rounds: 1,
      mode,
    };
  }

  // ── Round 2: Constraint refinement ──
  const failedConstraintDetails = round1Failed
    .map((id) => constraints.find((c) => c.id === id))
    .filter(Boolean) as Array<{ type: string; value: string }>;

  const round2Prompt =
    contextPrefix + buildRound2Prompt(round1Output, failedConstraintDetails, constraints);

  const round2Output = await provider.generate(round2Prompt, {
    temperature,
    maxTokens,
  });

  const round2Failed = validateConstraintsSimple(round2Output, constraints);

  results.push({
    name: 'refine',
    output: round2Output,
    round_number: 2,
    failed_constraints: round2Failed,
    constraints_passed: round2Failed.length === 0,
  });

  // Standard mode: return after Round 2
  if (mode === 'standard') {
    return {
      output: round2Output,
      rounds: results,
      total_rounds: 2,
      mode,
    };
  }

  // ── Round 3: Style polish (thorough mode) ──
  const round3Prompt = contextPrefix + buildRound3Prompt(round2Output, stylePreferences);

  const round3Output = await provider.generate(round3Prompt, {
    temperature,
    maxTokens,
  });

  const round3Failed = validateConstraintsSimple(round3Output, constraints);

  results.push({
    name: 'polish',
    output: round3Output,
    round_number: 3,
    failed_constraints: round3Failed,
    constraints_passed: round3Failed.length === 0,
  });

  return {
    output: round3Output,
    rounds: results,
    total_rounds: 3,
    mode,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Custom Round Generation (Original API)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute multi-round generation with custom round configs.
 *
 * This is the original lower-level API that accepts arbitrary round configs.
 * For mode-based generation (fast/standard/thorough), use modeGenerate().
 */
export async function multiRoundGenerate(options: MultiRoundOptions): Promise<MultiRoundResult> {
  const {
    commit,
    leaf,
    provider,
    rounds,
    earlyExit,
    temperature = 0.7,
    maxTokens = 1024,
  } = options;

  const constraints = (leaf.constraints ?? []) as Array<{
    id: string;
    type: 'require' | 'exclude';
    value: string;
    match_mode: 'exact' | 'semantic';
  }>;

  const results: RoundResult[] = [];
  let previousOutput = '';

  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];
    const prompt = buildRoundPrompt(commit, leaf, round, previousOutput, i);

    const output = await provider.generate(prompt, { temperature, maxTokens });

    const failedIds = validateConstraintsSimple(output, constraints);

    results.push({
      name: round.name,
      output,
      round_number: i + 1,
      failed_constraints: failedIds,
      constraints_passed: failedIds.length === 0,
    });

    previousOutput = output;

    if (earlyExit?.(output)) break;
  }

  return {
    output: previousOutput,
    rounds: results,
    total_rounds: results.length,
  };
}

function buildRoundPrompt(
  commit: CommitV4,
  leaf: Leaf,
  round: RoundConfig,
  previousOutput: string,
  roundIndex: number
): string {
  const sentences = commit.content.sentences.map((s) => s.text).join('\n');
  const constraints = (leaf.constraints ?? []).map((c) => `[${c.type}] ${c.value}`).join('\n');

  const parts: string[] = [];

  parts.push(
    `You are generating content for a "${leaf.type}" leaf titled "${leaf.title ?? 'Untitled'}".`
  );
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
