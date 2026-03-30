/**
 * Tree Extraction Prompt Builder
 *
 * Constructs system + user prompts for LLM-based tree-native semantic extraction.
 * Supports two modes:
 * - First extraction (no snapshot): asks LLM for full YAML tree output
 * - Incremental mode (with snapshot): asks LLM for incremental changes only
 */

import type { SemanticContent, TreeNode } from '../semantic/types';
import {
  DEFAULT_STYLE,
  type ExtractionStyleConfig,
  type Granularity,
  type QuoteLength,
  type Tier3Behavior,
  type UpdateStance,
} from './extractionStyleConfig';

// -- Input Types --

export interface ExtractionTurn {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  turn_hash?: string; // Source tracking -- which turn this is
}

export interface ExtractionInput {
  turns: ExtractionTurn[];
  snapshot?: SemanticContent;
  /** Number of turns already processed by previous extractions (from the start). Used in incremental mode to split context vs new turns. */
  processedTurnCount?: number;
}

// -- Output Type --

export interface ExtractionPromptResult {
  systemPrompt: string;
  userPrompt: string;
}

// -- Internal Helpers --

/**
 * Serialize a TreeNode to a YAML-like readable text for the snapshot section.
 */
function serializeTreeForSnapshot(node: TreeNode, indent = 0): string {
  const pad = '  '.repeat(indent);
  const lines: string[] = [];
  lines.push(`${pad}${node.key}:`);
  for (const [key, value] of Object.entries(node.slots)) {
    lines.push(`${pad}  ${key}: ${JSON.stringify(value)}`);
  }
  for (const child of node.children) {
    lines.push(serializeTreeForSnapshot(child, indent + 1));
  }
  return lines.join('\n');
}

/**
 * Serialize a snapshot to a YAML-like readable text format.
 */
function serializeSnapshot(snapshot: SemanticContent): string {
  // Serialize trees as YAML
  if (snapshot.trees.length > 0) {
    return snapshot.trees.map((tree) => serializeTreeForSnapshot(tree)).join('\n\n');
  }

  // Empty content
  return '';
}

/**
 * Format conversation turns for prompt inclusion.
 * Includes turn_hash as [T1], [T2], etc. for source tracking.
 */
function formatTurns(turns: ExtractionTurn[]): string {
  return turns
    .map((t, i) => {
      const tag = t.turn_hash ? `[T${i + 1}:${t.turn_hash.slice(0, 8)}]` : `[T${i + 1}]`;
      return `${tag} [${t.role}]: ${t.content}`;
    })
    .join('\n');
}

// -- Segment Functions --

/** Returns the TIER 3 row for the Three-Tier Extraction Rule table. */
export function tier3Segment(t3: Tier3Behavior): string {
  switch (t3) {
    case 'extract':
      return `| TIER 3 | Assistant's direct answer to a user question \u2014 factual content the user requested | Extract it | 0.7-0.85 |
| TIER 4 | AI-provided tangential information (unsolicited tips, suggestions, opinions) | Extract it | 0.4-0.5 |`;
    case 'skip':
      return '| TIER 3 | AI provided information and user did NOT object (silence, moved on, or continued without contradicting) | Do NOT extract | \u2014 |';
    default:
      return tier3Segment('extract');
  }
}

/** Returns the key distinction line that follows the Three-Tier table. */
export function tier3KeyDistinction(t3: Tier3Behavior): string {
  switch (t3) {
    case 'extract':
      return 'Key distinction: When the user asks a question and the assistant answers, the answer content is TIER 3 (0.7-0.85) \u2014 this IS the knowledge the user came for. Only unsolicited AI additions are TIER 4 (0.4-0.5). Explicit rejection = never extract.';
    case 'skip':
      return 'Key distinction: Only extract information the user explicitly stated (TIER 1) or explicitly confirmed (TIER 2). Do NOT extract unconfirmed AI suggestions.';
    default:
      return tier3KeyDistinction('extract');
  }
}

/** Returns the Tree Depth guidance based on granularity. */
export function granularitySegment(g: Granularity): string {
  switch (g) {
    case 'concise':
      return `## Tree Depth: 1 Level (Root Only)
- The tree has ONE level: the root node with flat slots only
- Do NOT create child nodes \u2014 all information goes into root-level slots
- 3-5 slots total. Prefer fewer, high-confidence slots.`;
    case 'balanced':
      return `## Tree Depth: 3 Levels (Root + Children + Grandchildren)
- The tree has up to THREE levels: root, children, and grandchildren
- Group related slots into child nodes when a subtopic has 2+ related slots
- Use grandchildren for detailed breakdowns (hero list \u2192 individual heroes)
- Root: 2-5 slots. Children: 2-6 slots. Grandchildren: 1-4 slots.
- IMPORTANT: Extract ALL substantive information from the conversation, not just highlights`;
    case 'detailed':
      return `## Tree Depth: 3 Levels (Root + Children + Grandchildren)
- The tree has at most THREE levels: root, children, and grandchildren
- Use grandchildren when a child node has a complex subtopic worth breaking out
- Root: 1-3 slots. Children: 1-4 slots. Grandchildren: 1-3 slots.`;
    default:
      return granularitySegment('balanced');
  }
}

/** Returns the quote length guidance for slot_quotes sections. */
export function quoteLengthSegment(ql: QuoteLength): string {
  switch (ql) {
    case 'minimal':
      return `- Keep quotes MINIMAL: extract only the shortest substring that contains the slot value
  BAD:  "We're vegetarian and my partner is allergic to peanuts" (entire clause)
  GOOD: "vegetarian" (just the value)
  GOOD: "allergic to peanuts" (just the relevant part)`;
    case 'contextual':
      return `- Include enough context in quotes to make the slot value unambiguous
  BAD:  "vegetarian" (too short, loses context)
  GOOD: "We're vegetarian" (includes context for clarity)
  GOOD: "allergic to peanuts" (sufficient context)`;
    default:
      return quoteLengthSegment('minimal');
  }
}

/** Returns an optional update stance section to append to the prompt. */
export function updateStanceSegment(us: UpdateStance): string {
  switch (us) {
    case 'balanced':
      return '';
    case 'conservative':
      return `
## Update Stance: Conservative
- Only update existing nodes when the user EXPLICITLY provides new information
- Prefer adding new child nodes over modifying existing ones
- When in doubt, keep the existing node unchanged`;
    case 'aggressive':
      return `
## Update Stance: Aggressive
- Actively update existing nodes when new information is available
- Merge related slots into existing nodes when possible
- Prefer updating existing nodes over creating new ones for the same subtopic`;
    default:
      return '';
  }
}

// -- System Prompt Builders --

function buildIncrementalSystemPrompt(style: ExtractionStyleConfig): string {
  return `You are a semantic extraction engine. Extract CHANGES from new conversation turns as updates to an existing topic tree.

## Three-Tier Extraction Rule

| Tier | Condition | Action | Confidence |
|------|-----------|--------|------------|
| TIER 1 | User explicitly stated a fact | Extract it | 0.85-0.95 |
| TIER 2 | User explicitly confirmed/adopted an AI suggestion | Extract it | 0.6-0.7 |
${tier3Segment(style.tier3)}
| DO NOT EXTRACT | User explicitly rejected | Do NOT extract | \u2014 |

${tier3KeyDistinction(style.tier3)}

## What NOT to Extract
- Questions, conversational filler, AI meta-commentary
- AI suggestions the user explicitly rejected

## slot_quotes Hard Binding (MANDATORY)
Each slot in your changes MUST have a corresponding slot_quotes entry with VERBATIM text from the conversation.
${quoteLengthSegment(style.quote_length)}
- slot_quotes keys use dot-path notation relative to tree root
- If you cannot quote exact source text for a slot \u2192 DO NOT create that slot

${granularitySegment(style.granularity)}

## Tree Change Actions

| Action | When | Fields |
|--------|------|--------|
| add | New subtopic info | parent_path, node (YAML object), slot_quotes |
| update | Modify existing fact | target_path, slots (changed values only), slot_quotes |
| remove | Negate/cancel content | target_path, reason |

## FORBIDDEN Operations
- Moving nodes (changes tree structure)
- Merging nodes (combines subtrees)
- Splitting nodes (divides a node)
- Renaming nodes (changes the node key)

If new info doesn't fit an existing node \u2192 add a new child at the nearest suitable parent.

## Core Rules
1. Output ONLY changes \u2014 do NOT repeat unchanged tree nodes
2. Node keys use snake_case (e.g., "dietary_restrictions")
3. Paths use / separator (e.g., "hangzhou_trip/dining")

## Drift Detection
If new turns discuss a topic UNRELATED to the current tree:
- Output: { "changes": [], "drift_detected": true }

## Cross-Tree Relation Types (4 only): causes, contrasts, follows, depends${updateStanceSegment(style.update_stance)}

## JSON Output Format
\`\`\`json
{
  "changes": [
    {
      "action": "add",
      "parent_path": "hangzhou_trip",
      "node": {
        "transportation": {
          "mode": "high-speed rail",
          "duration": "1.5 hours"
        }
      },
      "slot_quotes": {
        "transportation.mode": "take the high-speed rail",
        "transportation.duration": "about an hour and a half"
      },
      "source": "T4",
      "confidence": 0.9
    },
    {
      "action": "update",
      "target_path": "hangzhou_trip/dining",
      "slots": { "budget": 800 },
      "slot_quotes": { "dining.budget": "increase the budget to 800" }
    },
    {
      "action": "remove",
      "target_path": "hangzhou_trip/shopping",
      "reason": "user cancelled shopping plan"
    }
  ],
  "drift_detected": false
}
\`\`\`
Output ONLY valid JSON. No markdown fences, no explanatory text.`;
}

function buildFirstExtractionSystemPrompt(style: ExtractionStyleConfig): string {
  return `You are a semantic extraction engine. Extract meaning from conversations into a YAML topic tree.

## YAML Tree Structure
- Produce ONE root node named after the main topic (snake_case)
- The root key IS the topic name (e.g., hangzhou_trip, product_requirements)
- Child nodes represent subtopics (object values under the root)
- Leaf values (strings, numbers, booleans, arrays) are slot values
- Object values at any level are child nodes, NOT slot values

## Three-Tier Extraction Rule

| Tier | Condition | Action | Confidence |
|------|-----------|--------|------------|
| TIER 1 | User explicitly stated a fact | Extract it | 0.85-0.95 |
| TIER 2 | User explicitly confirmed/adopted an AI suggestion | Extract it | 0.6-0.7 |
${tier3Segment(style.tier3)}
| DO NOT EXTRACT | User explicitly rejected | Do NOT extract | \u2014 |

${tier3KeyDistinction(style.tier3)}

## What NOT to Extract
- Questions (from either side) \u2014 questions are not facts
- Meta-frames like "user_preferences" \u2014 use domain-specific types instead
- Pure conversational filler
- AI meta-commentary about its own process
- AI suggestions the user explicitly rejected

## slot_quotes Hard Binding (MANDATORY)
After the YAML tree, output a separate slot_quotes JSON mapping.
Each slot MUST have a corresponding entry with VERBATIM text from the conversation.
${quoteLengthSegment(style.quote_length)}
- slot_quotes keys use dot-path notation (e.g., "activity_plan.activities")
- Root-level slots have no prefix (e.g., "destination")
- If you cannot quote exact source text for a slot \u2192 DO NOT create that slot

${granularitySegment(style.granularity)}

## BAD vs GOOD Examples

BAD \u2014 one giant flat structure:
  trip:
    location: "Portland"
    budget: 80000
    equipment_cost: 30000
    renovation_cost: 20000
    design_aesthetic: "Scandinavian"
    baristas: 3

GOOD \u2014 tree with subtopics as children (balanced depth 2):
  coffee_shop:
    location: "Portland"
    budget: 80000
    budget_allocation:
      equipment: 30000
      renovation: 20000
    design_concept:
      aesthetic: "Scandinavian"
    staffing_plan:
      baristas: 3
      manager: 1

## Source Tracking
- Include "source" as a special comment or metadata for each node referencing the turn tag (T1, T2, etc.)

## Cross-Tree Relation Types (4 only): causes, contrasts, follows, depends
- These are ONLY for relationships between DIFFERENT topic trees
- Within a single tree, nesting IS the relationship \u2014 no explicit relations needed${updateStanceSegment(style.update_stance)}

## Output Format
First output the YAML tree, then a --- separator, then slot_quotes as JSON:

\`\`\`
hangzhou_trip:
  destination: "Hangzhou"
  dates: "May 1-3"
  activity_plan:
    activities: ["West Lake", "hiking"]
    duration: "2 days"
  dining:
    cuisine: "local Hangzhou cuisine"
    budget: 500
---
{
  "slot_quotes": {
    "destination": "going to Hangzhou",
    "dates": "May 1st to 3rd",
    "activity_plan.activities": "visit West Lake and go hiking",
    "activity_plan.duration": "spend two days on activities",
    "dining.cuisine": "try local Hangzhou food",
    "dining.budget": "around 500 for meals"
  },
  "source_map": {
    "hangzhou_trip": "T1",
    "activity_plan": "T2",
    "dining": "T3"
  },
  "confidence_map": {
    "hangzhou_trip": 0.95,
    "activity_plan": 0.85,
    "dining": 0.9
  }
}
\`\`\`
Output the YAML tree first (no fences), then --- on its own line, then the JSON block (no fences). No other text.`;
}

// -- Main Function --

/**
 * Build system + user prompts for semantic extraction.
 *
 * When `snapshot` is provided, produces incremental-mode prompts that ask the LLM
 * to output only changes relative to the existing snapshot.
 * When no snapshot, produces first-extraction prompts for full output.
 *
 * The optional `style` parameter controls extraction granularity, tier-3
 * behavior, quote length, and update stance. Defaults to `DEFAULT_STYLE`
 * (balanced preset) for backward compatibility.
 */
export function buildExtractionPrompt(
  input: ExtractionInput,
  style: ExtractionStyleConfig = DEFAULT_STYLE
): ExtractionPromptResult {
  const { turns, snapshot, processedTurnCount } = input;

  if (snapshot) {
    // Incremental mode
    const snapshotYaml = serializeSnapshot(snapshot);

    // Split turns into context (already processed) and new (to extract from)
    const splitAt = processedTurnCount ?? 0;
    const contextTurns = splitAt > 0 ? turns.slice(0, splitAt) : [];
    const newTurns = splitAt > 0 ? turns.slice(splitAt) : turns;

    let turnsSection: string;
    if (contextTurns.length > 0 && newTurns.length > 0) {
      // Two-section layout: context + new
      const contextText = formatTurns(contextTurns);
      const newText =
        contextTurns.length > 0
          ? newTurns
              .map((t, i) => {
                const idx = contextTurns.length + i;
                const tag = t.turn_hash
                  ? `[T${idx + 1}:${t.turn_hash.slice(0, 8)}]`
                  : `[T${idx + 1}]`;
                return `${tag} [${t.role}]: ${t.content}`;
              })
              .join('\n')
          : formatTurns(newTurns);
      turnsSection = `## Context Turns (already in snapshot \u2014 do NOT re-extract these)
${contextText}

## \u2605 NEW Turns (extract changes from THESE) \u2605
${newText}`;
    } else {
      // No split info -- treat all as new (backward compatible)
      turnsSection = `## New Conversation Turns
${formatTurns(turns)}`;
    }

    const userPrompt = `## Current Snapshot
${snapshotYaml}

${turnsSection}

## Instructions
Output the changes only based on the \u2605 NEW turns \u2605 above.
CRITICAL RULES:
1. Each slot in your changes MUST have a corresponding slot_quotes entry pointing to VERBATIM text from the conversation. No quote \u2192 no slot.
2. For AI-originated information (TIER 3), quote from the assistant turn. Do NOT extract content the user explicitly rejected.
3. The context turns are for reference only \u2014 their information is already in the snapshot.
4. Use tree paths with / separator for parent_path and target_path.

For each piece of new information:
- If it MODIFIES an existing node's slot \u2192 "update" with target_path and changed slots
- If it's a NEW subtopic \u2192 "add" with parent_path and new node
- If it NEGATES or REPLACES something \u2192 "remove" with target_path
- If the user explicitly rejected all new AI content \u2192 output empty changes: { "changes": [], "drift_detected": false }
Include "source" field referencing the turn tag (T1, T2, etc.).`;

    return { systemPrompt: buildIncrementalSystemPrompt(style), userPrompt };
  }

  // First extraction mode
  const turnsText = formatTurns(turns);

  const userPrompt = `## Conversation
${turnsText}

## Instructions
Extract the semantic meaning from this conversation into a YAML topic tree.
Include "source" referencing the turn tag (T1, T2, etc.) for each node.`;

  return { systemPrompt: buildFirstExtractionSystemPrompt(style), userPrompt };
}
