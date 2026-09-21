/**
 * Semantic Gate (Gate 2) — LLM-based semantic review
 *
 * Uses an LLM to review extraction quality across 5 dimensions:
 * completeness, accuracy, relations, granularity, hallucination.
 *
 */

import type { LLMProvider } from '../llm/types';
import { serializeForPrompt } from './serialize';
import type {
  CoverageResult,
  DimensionResult,
  GateDimension,
  SemanticContent,
  SemanticGateResult,
  SemanticIssue,
} from './types';

// ── Constants ──

const GATE_DIMENSIONS: GateDimension[] = [
  'completeness',
  'accuracy',
  'relations',
  'granularity',
  'hallucination',
];

const PASS_THRESHOLD = 0.7;

// ── Prompt Builder ──

/**
 * Build the system + user prompt for semantic gate review.
 */
export function buildSemanticGatePrompt(
  turns: { role: string; content: string }[],
  content: SemanticContent
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are a semantic extraction reviewer. You are given an original conversation and the Tree structure extracted from it.

Score the extraction on these 5 dimensions (0-1) and list any issues:

## 1. Completeness
Were important intents, decisions, facts, and constraints from the conversation extracted?
- Check: does every substantial statement have a matching tree node or slot?
- Do not extract: greetings, repetition, or process chatter

## 2. Accuracy
Do extracted slot values match the source text?
- Check: numbers, names, dates, and similar facts
- Check: inferred content has an explicit source citation

## 3. Relations
Are relation types between trees correct?
- causes: does A actually cause B?
- conditions: is A actually a precondition of B?
- contrasts: do A and B actually contradict or oppose each other?
- follows: did A actually happen before B?
- depends: does A actually depend on B?

## 4. Granularity
- Over-split: one intent broken into unnecessary tree nodes?
- Over-merged: distinct intents packed into one tree node?

## 5. Hallucination
- Does the tree contain content never mentioned in the source?
- Are inferences reasonable, or over-inferred?

Output strictly in the following JSON format (no other content):

\`\`\`json
{
  "dimensions": {
    "completeness": { "score": 0.0, "details": "..." },
    "accuracy": { "score": 0.0, "details": "..." },
    "relations": { "score": 0.0, "details": "..." },
    "granularity": { "score": 0.0, "details": "..." },
    "hallucination": { "score": 0.0, "details": "..." }
  },
  "issues": [
    { "severity": "error|warning|info", "node_path": "budget/constraints", "dimension": "accuracy", "description": "...", "suggestion": "..." }
  ]
}
\`\`\``;

  // Format turns
  const turnsText = turns.map((t) => `[${t.role}]: ${t.content}`).join('\n');

  // Format state content as readable YAML-like text
  const treesText = serializeForPrompt(content);

  const relationsText =
    content.relations.length > 0
      ? content.relations.map((r) => `  - ${r.from} --[${r.type}]--> ${r.to}`).join('\n')
      : '  (none)';

  const userPrompt = `Original conversation:
${turnsText}

Extracted trees:
${treesText}

Extracted relations:
${relationsText}

Output: a 0-1 score for each dimension plus a concrete issue list.`;

  return { systemPrompt, userPrompt };
}

// ── Response Parser ──

/**
 * Default dimension result for missing/invalid dimensions.
 */
function defaultDimensionResult(): DimensionResult {
  return { score: 0, details: '' };
}

/**
 * Parse the LLM response into a SemanticGateResult.
 * If parsing fails, returns a degraded result with score 0.
 */
export function parseSemanticGateResponse(raw: string): Omit<SemanticGateResult, 'usage'> {
  try {
    // Strategy 1: Extract from markdown code block
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    let jsonStr = jsonMatch ? jsonMatch[1].trim() : null;

    // Strategy 2: Find first { ... } block (handles LLM adding surrounding text)
    if (!jsonStr) {
      const braceStart = raw.indexOf('{');
      const braceEnd = raw.lastIndexOf('}');
      if (braceStart !== -1 && braceEnd > braceStart) {
        jsonStr = raw.slice(braceStart, braceEnd + 1);
      }
    }

    // Strategy 3: Try raw as-is
    if (!jsonStr) {
      jsonStr = raw.trim();
    }

    const parsed = JSON.parse(jsonStr);

    if (!parsed.dimensions || typeof parsed.dimensions !== 'object') {
      return buildDegradedResult('Missing dimensions in response');
    }

    // Build dimensions record with defaults for missing dimensions
    const dimensions = {} as Record<GateDimension, DimensionResult>;
    for (const dim of GATE_DIMENSIONS) {
      const raw = parsed.dimensions[dim];
      if (raw && typeof raw === 'object' && typeof raw.score === 'number') {
        dimensions[dim] = {
          score: Math.max(0, Math.min(1, raw.score)),
          details: typeof raw.details === 'string' ? raw.details : '',
        };
      } else {
        dimensions[dim] = defaultDimensionResult();
      }
    }

    // Parse issues
    const issues: SemanticIssue[] = [];
    if (Array.isArray(parsed.issues)) {
      for (const issue of parsed.issues) {
        if (issue && typeof issue === 'object' && typeof issue.description === 'string') {
          const severity =
            issue.severity === 'error' || issue.severity === 'warning' || issue.severity === 'info'
              ? issue.severity
              : 'warning';
          const dimension = GATE_DIMENSIONS.includes(issue.dimension)
            ? (issue.dimension as GateDimension)
            : 'accuracy';
          issues.push({
            severity,
            node_path:
              typeof issue.frame_id === 'string'
                ? issue.frame_id
                : typeof issue.node_path === 'string'
                  ? issue.node_path
                  : undefined,
            dimension,
            description: issue.description,
            suggestion: typeof issue.suggestion === 'string' ? issue.suggestion : undefined,
          });
        }
      }
    }

    // Calculate overall score (average of all dimensions)
    const scores = GATE_DIMENSIONS.map((d) => dimensions[d].score);
    const score = scores.reduce((sum, s) => sum + s, 0) / scores.length;

    return {
      passed: score >= PASS_THRESHOLD,
      score,
      dimensions,
      issues,
    };
  } catch {
    return buildDegradedResult('Failed to parse LLM response as JSON');
  }
}

/**
 * Build a degraded result when parsing fails.
 */
function buildDegradedResult(errorMessage: string): Omit<SemanticGateResult, 'usage'> {
  const dimensions = {} as Record<GateDimension, DimensionResult>;
  for (const dim of GATE_DIMENSIONS) {
    dimensions[dim] = defaultDimensionResult();
  }
  return {
    passed: false,
    score: 0,
    dimensions,
    issues: [
      {
        severity: 'error',
        dimension: 'accuracy',
        description: errorMessage,
      },
    ],
  };
}

// ── Coverage Prompt ──

/**
 * Build the system + user prompt for coverage checking.
 */
export function buildCoveragePrompt(
  turns: { role: string; content: string }[],
  content: SemanticContent
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are a semantic extraction coverage reviewer. You are given an original conversation and the Tree structure extracted from it.

Your task: check whether important information in the original conversation was omitted and is not covered by any tree node.

## Criteria
- Important: intents, decisions, facts, constraints, numbers, times, names, concrete needs
- Unimportant (ignore): greetings, repetition, filler, process chatter (for example "um", "okay", "let me think")

## Output format
Output strictly in the following JSON format (no other content):

\`\`\`json
{
  "coverage_ratio": 0.85,
  "uncovered_segments": ["important uncovered source fragment 1", "important uncovered source fragment 2"]
}
\`\`\`

- coverage_ratio: 0-1, the share of important information that is covered
- uncovered_segments: important source fragments that were not covered (quote the source directly)
- If everything is covered, return coverage_ratio: 1.0, uncovered_segments: []`;

  const turnsText = turns.map((t) => `[${t.role}]: ${t.content}`).join('\n');

  const treesText = serializeForPrompt(content);

  const userPrompt = `Original conversation:
${turnsText}

Extracted trees:
${treesText}

Judge coverage and output JSON.`;

  return { systemPrompt, userPrompt };
}

// ── Coverage Parser ──

/**
 * Parse the LLM response into a CoverageResult.
 * Returns zero coverage if parsing fails.
 */
export function parseCoverageResponse(raw: string): Omit<CoverageResult, 'usage'> {
  try {
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    let jsonStr = jsonMatch ? jsonMatch[1].trim() : null;

    if (!jsonStr) {
      const braceStart = raw.indexOf('{');
      const braceEnd = raw.lastIndexOf('}');
      if (braceStart !== -1 && braceEnd > braceStart) {
        jsonStr = raw.slice(braceStart, braceEnd + 1);
      }
    }

    if (!jsonStr) {
      jsonStr = raw.trim();
    }

    const parsed = JSON.parse(jsonStr);

    const ratio =
      typeof parsed.coverage_ratio === 'number'
        ? Math.max(0, Math.min(1, parsed.coverage_ratio))
        : 0;

    const segments = Array.isArray(parsed.uncovered_segments)
      ? parsed.uncovered_segments.filter((s: unknown) => typeof s === 'string')
      : [];

    return { coverage_ratio: ratio, uncovered_segments: segments };
  } catch {
    return { coverage_ratio: 0, uncovered_segments: [] };
  }
}

// ── SemanticGate Class ──

/**
 * Semantic Gate (Gate 2) — LLM-based extraction quality review.
 *
 * Scoring thresholds:
 * - >= 0.9: auto pass
 * - 0.7-0.9: pass with warnings
 * - 0.5-0.7: pause, needs user attention
 * - < 0.5: reject
 */
export class SemanticGate {
  constructor(
    private readonly provider: LLMProvider,
    private readonly isFatalProviderError?: (error: unknown) => boolean
  ) {}

  /**
   * Review state content extracted from conversation turns.
   *
   * @param turns - The original conversation turns
   * @param content - The extracted state content (frames + relations)
   * @returns Semantic gate result with scores and issues
   */
  async review(
    turns: { role: string; content: string }[],
    content: SemanticContent
  ): Promise<SemanticGateResult> {
    const { systemPrompt, userPrompt } = buildSemanticGatePrompt(turns, content);
    const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

    try {
      const result = await this.provider.generate(fullPrompt, {
        temperature: 0.1,
        maxTokens: 2000,
      });
      const parsed = parseSemanticGateResponse(result.text);
      return { ...parsed, usage: result.usage };
    } catch (error) {
      if (this.isFatalProviderError?.(error)) throw error;
      return {
        ...buildDegradedResult('LLM provider call failed'),
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }
  }

  /**
   * Check coverage of extracted frames against original conversation.
   *
   * @param turns - The original conversation turns
   * @param content - The extracted state content (frames + relations)
   * @returns Coverage result with ratio and uncovered segments
   */
  async checkCoverage(
    turns: { role: string; content: string }[],
    content: SemanticContent
  ): Promise<CoverageResult> {
    const { systemPrompt, userPrompt } = buildCoveragePrompt(turns, content);
    const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

    try {
      const result = await this.provider.generate(fullPrompt, {
        temperature: 0.1,
        maxTokens: 1500,
      });
      const parsed = parseCoverageResponse(result.text);
      return { ...parsed, usage: result.usage };
    } catch (error) {
      if (this.isFatalProviderError?.(error)) throw error;
      return {
        coverage_ratio: 0,
        uncovered_segments: [],
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }
  }
}
