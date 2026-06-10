/**
 * LLM Constraint Suggester
 *
 * Given commit nodes + leaf type, uses LLM to suggest
 * require/exclude constraints. Follows the same pattern as
 * the LLM extractor (prompt → generate → parse → validate).
 */

import type { LLMProvider } from '../llm/types';
import { serializeForPrompt } from '../semantic/serialize';
import type { SemanticContent } from '../semantic/types';
import type { AnyLeafType, Constraint } from '../types';
import { ID_PREFIXES } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface SuggestedConstraint {
  type: 'require' | 'exclude';
  match_mode: 'exact' | 'semantic';
  value: string;
  reason: string;
}

export interface ConstraintSuggestionResult {
  suggestions: SuggestedConstraint[];
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface SuggestConstraintsOptions {
  /** Maximum number of suggestions (default: 10) */
  maxSuggestions?: number;
  /** Additional context or instructions */
  instructions?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Prompt Builder
// ═══════════════════════════════════════════════════════════════════════════

function buildConstraintSuggestionPrompt(
  knowledge: SemanticContent,
  leafType: AnyLeafType,
  options?: SuggestConstraintsOptions
): string {
  const maxSuggestions = options?.maxSuggestions ?? 10;

  const typeGuidance = getTypeGuidance(leafType);

  const knowledgeText = serializeForPrompt(knowledge);

  return `You are a constraint suggestion engine for a structured-state version control system.

Given a set of committed state frames and a target output type, suggest constraints that should be applied when generating output.

## Output Type: ${leafType}
${typeGuidance}

## Constraint Types

1. **require** (exact): The output MUST contain this exact phrase/keyword
2. **require** (semantic): The output MUST convey this meaning (checked via embedding similarity)
3. **exclude** (exact): The output MUST NOT contain this exact phrase/keyword
4. **exclude** (semantic): The output MUST NOT convey this meaning

## Guidelines

- Suggest REQUIRE constraints for key facts, entities, and core points from the knowledge
- Suggest EXCLUDE constraints for common pitfalls (e.g., exceeding character limits, including inappropriate content)
- Prefer "semantic" match_mode for meaning-based constraints, "exact" for keywords/names
- Each constraint should have a clear reason explaining why it matters
- Suggest at most ${maxSuggestions} constraints
${options?.instructions ? `\n## Additional Instructions\n${options.instructions}` : ''}

## Knowledge

${knowledgeText}

## Output Format

Return a JSON array:
[
  {
    "type": "require" | "exclude",
    "match_mode": "exact" | "semantic",
    "value": "the constraint value",
    "reason": "why this constraint matters"
  }
]

Return ONLY the JSON array, no other text.`;
}

function getTypeGuidance(leafType: AnyLeafType): string {
  switch (leafType) {
    case 'tweet':
      return 'Output is an X / Twitter post (max 280 characters). Focus on concise, impactful messaging. Suggest character limit exclude constraint.';
    case 'linkedin':
      return 'Output is a LinkedIn post. Focus on professional credibility, concise context, and a clear takeaway.';
    case 'reddit':
      return 'Output is a Reddit post. Focus on enough context for discussion, community fit, and avoiding marketing language.';
    case 'threads':
      return 'Output is a Threads post. Focus on short, conversational, scannable writing.';
    case 'email':
      return 'Output is an email. Should have proper greeting, body, and closing. Focus on professionalism and clarity.';
    case 'article':
      return 'Output is a blog post. Should be well-structured with clear sections. Focus on completeness and readability.';
    case 'slack':
      return 'Output is a Slack message. Should be conversational but professional. Focus on clarity and actionability.';
    case 'deploy_agent':
      return 'Output is for an AI agent deployment. Focus on accuracy and completeness of instructions.';
    default:
      return 'General output format. Focus on accuracy and completeness.';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Response Parser
// ═══════════════════════════════════════════════════════════════════════════

function parseConstraintSuggestions(raw: string): SuggestedConstraint[] {
  // Strip markdown code fences
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const results: SuggestedConstraint[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;

    // Validate required fields
    if (
      (obj.type !== 'require' && obj.type !== 'exclude') ||
      (obj.match_mode !== 'exact' && obj.match_mode !== 'semantic') ||
      typeof obj.value !== 'string' ||
      obj.value.length === 0 ||
      typeof obj.reason !== 'string'
    ) {
      continue;
    }

    results.push({
      type: obj.type,
      match_mode: obj.match_mode,
      value: obj.value,
      reason: obj.reason,
    });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// ID Generation
// ═══════════════════════════════════════════════════════════════════════════

let nanoidFn: ((size: number) => string) | null = null;

async function getNanoid(): Promise<(size: number) => string> {
  if (!nanoidFn) {
    const { nanoid } = await import('nanoid');
    nanoidFn = nanoid;
  }
  return nanoidFn;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Suggester
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Suggest constraints for a leaf based on commit nodes.
 *
 * @param provider - LLM provider to use for suggestion
 * @param knowledge - Semantic knowledge (frames + relations)
 * @param leafType - Type of the leaf (determines output format guidance)
 * @param options - Optional configuration
 * @returns Suggested constraints
 */
export async function suggestConstraints(
  provider: LLMProvider,
  knowledge: SemanticContent,
  leafType: AnyLeafType,
  options?: SuggestConstraintsOptions
): Promise<ConstraintSuggestionResult> {
  if (knowledge.trees.length === 0) {
    return { suggestions: [], model: provider.id, usage: { inputTokens: 0, outputTokens: 0 } };
  }

  const prompt = buildConstraintSuggestionPrompt(knowledge, leafType, options);
  const result = await provider.generate(prompt, { temperature: 0.3, maxTokens: 4096 });
  const suggestions = parseConstraintSuggestions(result.text);

  return {
    suggestions,
    model: provider.id,
    usage: result.usage,
  };
}

/**
 * Convert suggested constraints to proper Constraint objects with IDs.
 */
export async function suggestionsToConstraints(
  suggestions: SuggestedConstraint[]
): Promise<Constraint[]> {
  const nanoid = await getNanoid();

  return suggestions.map((s) => {
    const id = `${ID_PREFIXES.constraint}${nanoid(12)}`;
    if (s.type === 'require') {
      return {
        id,
        type: 'require' as const,
        match_mode: s.match_mode,
        value: s.value,
        description: s.reason,
      };
    }
    return {
      id,
      type: 'exclude' as const,
      match_mode: s.match_mode,
      value: s.value,
      description: s.reason,
      reason: s.reason,
    };
  });
}
