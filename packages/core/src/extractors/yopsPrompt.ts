/**
 * YOps Prompt Builder
 *
 * Constructs system + user prompts for LLM-based tree-native semantic extraction.
 * Supports two modes:
 * - First extraction (no snapshot): identical to extractionPrompt.ts (full YAML tree output)
 * - Incremental mode (with snapshot): teaches LLM to output YAML yops format
 */

import type { SemanticContent, TreeNode } from '../semantic/types';
import {
  DEFAULT_STYLE,
  type ExtractionStyleConfig,
} from './extractionStyleConfig';
import {
  granularitySegment,
  quoteLengthSegment,
  tier3KeyDistinction,
  tier3Segment,
  updateStanceSegment,
} from './extractionPrompt';

// -- Re-export types that callers need --

export type { ExtractionInput, ExtractionTurn, ExtractionPromptResult } from './extractionPrompt';

import type { ExtractionInput, ExtractionPromptResult } from './extractionPrompt';

// -- Internal Helpers (same as extractionPrompt.ts) --

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

function serializeSnapshot(snapshot: SemanticContent): string {
  if (snapshot.trees.length > 0) {
    return snapshot.trees.map((tree) => serializeTreeForSnapshot(tree)).join('\n\n');
  }
  return '';
}

function formatTurns(turns: { role: string; content: string; turn_hash?: string }[]): string {
  return turns
    .map((t, i) => {
      const tag = t.turn_hash ? `[T${i + 1}:${t.turn_hash.slice(0, 8)}]` : `[T${i + 1}]`;
      return `${tag} [${t.role}]: ${t.content}`;
    })
    .join('\n');
}

// -- System Prompt Builders --

/**
 * First extraction system prompt — identical to extractionPrompt.ts.
 * LLM outputs YAML tree + --- separator + JSON metadata.
 */
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
| DO NOT EXTRACT | User explicitly rejected | Do NOT extract | — |

${tier3KeyDistinction(style.tier3)}

## What NOT to Extract
- Questions (from either side) — questions are not facts
- Meta-frames like "user_preferences" — use domain-specific types instead
- Pure conversational filler
- AI meta-commentary about its own process
- AI suggestions the user explicitly rejected

## slot_quotes Hard Binding (MANDATORY)
After the YAML tree, output a separate slot_quotes JSON mapping.
Each slot MUST have a corresponding entry with VERBATIM text from the conversation.
${quoteLengthSegment(style.quote_length)}
- slot_quotes keys use dot-path notation (e.g., "activity_plan.activities")
- Root-level slots have no prefix (e.g., "destination")
- If you cannot quote exact source text for a slot → DO NOT create that slot

${granularitySegment(style.granularity)}

## BAD vs GOOD Examples

BAD — one giant flat structure:
  trip:
    location: "Portland"
    budget: 80000
    equipment_cost: 30000
    renovation_cost: 20000
    design_aesthetic: "Scandinavian"
    baristas: 3

GOOD — tree with subtopics as children (balanced depth 2):
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
- Within a single tree, nesting IS the relationship — no explicit relations needed${updateStanceSegment(style.update_stance)}

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

/**
 * YOps incremental system prompt.
 * Replaces the JSON delta format with YAML yops operations.
 */
function buildYOpsSystemPrompt(style: ExtractionStyleConfig): string {
  return `You are a semantic extraction engine. Extract CHANGES from new conversation turns as operations on an existing topic tree.

## Three-Tier Extraction Rule

| Tier | Condition | Action | Confidence |
|------|-----------|--------|------------|
| TIER 1 | User explicitly stated a fact | Extract it | 0.85-0.95 |
| TIER 2 | User explicitly confirmed/adopted an AI suggestion | Extract it | 0.6-0.7 |
${tier3Segment(style.tier3)}
| DO NOT EXTRACT | User explicitly rejected | Do NOT extract | — |

${tier3KeyDistinction(style.tier3)}

## What NOT to Extract
- Questions, conversational filler, AI meta-commentary
- AI suggestions the user explicitly rejected

## slot_quotes Hard Binding (MANDATORY)
Each set and add operation MUST include a source field with VERBATIM text from the conversation.
${quoteLengthSegment(style.quote_length)}
- If you cannot quote exact source text for a slot → DO NOT create that slot

${granularitySegment(style.granularity)}

## YOps Output Format

Output changes as a YAML yops document. Each operation is one item in the yops list.

### Content Operations

- set: Update or create a slot value on an existing node
  Required fields: path (node_path/slot_name), value, source (verbatim quote), from (turn tag)
  Optional: confidence (0-1)

- unset: Remove a slot from an existing node
  Required fields: path (node_path/slot_name)

- add: Create a new child node with slots
  Required fields: parent (path, empty string for root), node (one YAML key with slots), source (map of slot→quote), from (turn tag)
  Optional: confidence (0-1)

- drop: Remove a node and all its children
  Required fields: path
  Optional: reason

### Output Example

yops:
  - set:
      path: trip/dining/budget
      value: 2000
      source: "let's do 2000"
      from: T5

  - add:
      parent: trip
      node:
        nightlife:
          plan: bar hopping
      source:
        plan: "check out bars near the lake"
      from: T6
      confidence: 0.7

  - drop:
      path: trip/shopping
      reason: "user cancelled"

### Rules
- Output ONLY valid YAML starting with "yops:" on the first line
- No markdown fences, no explanatory text
- Every set and add MUST include source (verbatim quote) and from (turn tag)
- If no changes needed: output "yops: []"
- Node keys use snake_case
- Paths use / separator

## Drift Detection
If new turns discuss a topic UNRELATED to the current tree:
- Output: yops: []

## Cross-Tree Relation Types (4 only): causes, contrasts, follows, depends${updateStanceSegment(style.update_stance)}`;
}

// -- Main Function --

/**
 * Build system + user prompts for semantic extraction using YOps format.
 *
 * When `snapshot` is provided, produces yops-mode prompts that ask the LLM
 * to output YAML operations relative to the existing snapshot.
 * When no snapshot, produces first-extraction prompts for full YAML tree output
 * (identical to buildExtractionPrompt).
 *
 * The optional `style` parameter controls extraction granularity, tier-3
 * behavior, quote length, and update stance. Defaults to `DEFAULT_STYLE`
 * (balanced preset) for backward compatibility.
 */
export function buildYOpsPrompt(
  input: ExtractionInput,
  style?: Partial<ExtractionStyleConfig>
): ExtractionPromptResult {
  const resolvedStyle: ExtractionStyleConfig = { ...DEFAULT_STYLE, ...style };
  const { turns, snapshot, processedTurnCount } = input;

  if (snapshot) {
    // YOps incremental mode
    const snapshotYaml = serializeSnapshot(snapshot);

    // Split turns into context (already processed) and new (to extract from)
    const splitAt = processedTurnCount ?? 0;
    const contextTurns = splitAt > 0 ? turns.slice(0, splitAt) : [];
    const newTurns = splitAt > 0 ? turns.slice(splitAt) : turns;

    let turnsSection: string;
    if (contextTurns.length > 0 && newTurns.length > 0) {
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
      turnsSection = `## Context Turns (already in snapshot — do NOT re-extract these)
${contextText}

## ★ NEW Turns (extract changes from THESE) ★
${newText}`;
    } else {
      turnsSection = `## New Conversation Turns
${formatTurns(turns)}`;
    }

    const userPrompt = `## Current Snapshot
${snapshotYaml}

${turnsSection}

## Instructions
Output yops (changes only) based on the ★ NEW turns ★ above.
CRITICAL RULES:
1. Each set and add MUST include source (verbatim quote) and from (turn tag). No quote → no operation.
2. For AI-originated information (TIER 3), quote from the assistant turn. Do NOT extract content the user explicitly rejected.
3. The context turns are for reference only — their information is already in the snapshot.
4. Use tree paths with / separator.

For each piece of new information:
- If it MODIFIES an existing node's slot → "set" with path and value
- If it REMOVES a slot → "unset" with path
- If it's a NEW subtopic → "add" with parent and new node
- If it NEGATES or CANCELS a node → "drop" with path
- If no changes needed → output "yops: []"`;

    return { systemPrompt: buildYOpsSystemPrompt(resolvedStyle), userPrompt };
  }

  // First extraction mode — identical to extractionPrompt.ts
  const turnsText = formatTurns(turns);

  const userPrompt = `## Conversation
${turnsText}

## Instructions
Extract the semantic meaning from this conversation into a YAML topic tree.
Include "source" referencing the turn tag (T1, T2, etc.) for each node.`;

  return { systemPrompt: buildFirstExtractionSystemPrompt(resolvedStyle), userPrompt };
}
