/**
 * YOps Prompt Builder
 *
 * Constructs system + user prompts for LLM-based semantic extraction.
 * UNIFIED: always outputs YOps format — both first extraction and incremental.
 * First extraction = add operations. Incremental = set/add/drop operations.
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

// -- Internal Helpers --

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

// -- Unified System Prompt --

function buildSystemPrompt(style: ExtractionStyleConfig, hasSnapshot: boolean): string {
  const modeIntro = hasSnapshot
    ? 'Extract CHANGES from new conversation turns as operations on an existing topic tree.'
    : 'Extract meaning from a conversation into a knowledge tree using add operations.';

  return `You are a semantic extraction engine. ${modeIntro}

## Three-Tier Extraction Rule

| Tier | Condition | Action | Confidence |
|------|-----------|--------|------------|
| TIER 1 | User explicitly stated a fact | Extract it | 0.85-0.95 |
| TIER 2 | User explicitly confirmed/adopted an AI suggestion | Extract it | 0.6-0.7 |
${tier3Segment(style.tier3)}
| DO NOT EXTRACT | User explicitly rejected | Do NOT extract | — |

${tier3KeyDistinction(style.tier3)}

## Extract From BOTH Sides
- Extract facts and structured information from BOTH user messages AND assistant responses
- When the assistant provides categories, lists, explanations, or structured answers, extract them
- User's question defines the TOPIC; assistant's response provides the CONTENT
${style.tier3 === 'extract' ? '- Even if the user hasn\'t confirmed the information yet, extract it at Tier 3 confidence (0.4-0.5)' : '- Only extract information the user has explicitly stated or confirmed'}
- The goal: after extraction, the tree should capture ALL knowledge from the conversation

## What NOT to Extract
- Pure conversational filler ("sure!", "let me help", "here you go")
- AI meta-commentary about its own process ("I'll organize this into...")
- AI suggestions the user explicitly rejected
- Generic greetings without topical content

## slot_quotes Hard Binding (MANDATORY)
Every add and set operation MUST include source with VERBATIM text from the conversation.
${quoteLengthSegment(style.quote_length)}
- If you cannot quote exact source text for a slot → DO NOT create that slot

${granularitySegment(style.granularity)}

## YOps Output Format

Output as a YAML yops document. Each operation is one item in the yops list.

### Operations

- add: Create a new node with slots
  Required: parent (path, empty string "" for root), node (one YAML key with its slots), source (map slot→verbatim quote), from (turn tag)
  Optional: confidence (0-1)

- set: Update or create a slot value on an existing node
  Required: path (node_path/slot_name), value, source (verbatim quote), from (turn tag)
  Optional: confidence (0-1)

- drop: Remove a node and all its children
  Required: path
  Optional: reason

- unset: Remove a slot from an existing node
  Required: path (node_path/slot_name)

### Tree Structure Rules
- ONE root node per topic, named with snake_case (e.g., australian_beef, travel_plan)
- Child nodes represent subtopics — use nesting for structure
- Leaf values (strings, numbers, booleans, arrays) are slot values
- Keep depth ≤ 3 levels. Deeper = more specific

### Example${hasSnapshot ? ' (incremental)' : ' (first extraction)'}

${hasSnapshot ? `yops:
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
      reason: "user cancelled"` : `yops:
  - add:
      parent: ""
      node:
        australian_beef:
          overview: "grass-fed, high quality"
          major_regions:
            queensland: largest producer
            new_south_wales: significant cattle country
          export_markets:
            japan: largest export destination
            united_states: growing market
      source:
        overview: "Australian beef is known for being predominantly grass-fed and high quality"
        major_regions.queensland: "Queensland is the largest beef-producing state"
        major_regions.new_south_wales: "New South Wales has significant cattle country"
        export_markets.japan: "Japan is Australia's largest beef export market"
        export_markets.united_states: "The US is a growing market for Australian beef"
      from: T2
      confidence: 0.45`}

### Rules
- Output ONLY valid YAML starting with "yops:" on the first line
- No markdown fences, no explanatory text
- Every set and add MUST include source (verbatim quote) and from (turn tag)
- If no meaningful content to extract: output "yops: []"
- Node keys use snake_case
- Paths use / separator
${hasSnapshot ? `
## Drift Detection
If new turns discuss a topic UNRELATED to the current tree:
- Output: yops: []` : ''}

## Cross-Tree Relation Types (4 only): causes, contrasts, follows, depends${updateStanceSegment(style.update_stance)}`;
}

// -- Main Function --

/**
 * Build system + user prompts for semantic extraction using YOps format.
 *
 * UNIFIED: both first extraction and incremental mode output YOps.
 * First extraction = add operations to build tree from scratch.
 * Incremental = set/add/drop operations to update existing tree.
 */
export function buildYOpsPrompt(
  input: ExtractionInput,
  style?: Partial<ExtractionStyleConfig>
): ExtractionPromptResult {
  const resolvedStyle: ExtractionStyleConfig = { ...DEFAULT_STYLE, ...style };
  const { turns, snapshot, processedTurnCount } = input;
  const hasSnapshot = !!snapshot && snapshot.trees.length > 0;

  const systemPrompt = buildSystemPrompt(resolvedStyle, hasSnapshot);

  if (hasSnapshot) {
    // Incremental mode
    const snapshotYaml = serializeSnapshot(snapshot!);
    const splitAt = processedTurnCount ?? 0;
    const contextTurns = splitAt > 0 ? turns.slice(0, splitAt) : [];
    const newTurns = splitAt > 0 ? turns.slice(splitAt) : turns;

    let turnsSection: string;
    if (contextTurns.length > 0 && newTurns.length > 0) {
      const contextText = formatTurns(contextTurns);
      const newText = newTurns
        .map((t, i) => {
          const idx = contextTurns.length + i;
          const tag = t.turn_hash ? `[T${idx + 1}:${t.turn_hash.slice(0, 8)}]` : `[T${idx + 1}]`;
          return `${tag} [${t.role}]: ${t.content}`;
        })
        .join('\n');
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

    return { systemPrompt, userPrompt };
  }

  // First extraction mode — also uses YOps (add operations)
  const turnsText = formatTurns(turns);

  const userPrompt = `## Conversation
${turnsText}

## Instructions
Extract ALL knowledge from this conversation using yops add operations.
Build a structured tree: one root node per topic, with child nodes for subtopics.

CRITICAL RULES:
1. Use "add" operations to create the tree. Start with parent: "" for root nodes.
2. Each add MUST include source (verbatim quote from the conversation) and from (turn tag like T1, T2).
3. Extract from BOTH user messages AND assistant responses. The assistant's detailed answers are valuable content.
4. Structure the tree with meaningful nesting — group related facts under subtopic nodes.
5. If the conversation has no extractable content, output "yops: []"`;

  return { systemPrompt, userPrompt };
}
