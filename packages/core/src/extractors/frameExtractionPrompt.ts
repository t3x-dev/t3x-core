/**
 * Frame Extraction Prompt Builder
 *
 * Constructs system + user prompts for LLM-based frame semantic extraction.
 * Supports two modes:
 * - First extraction (no snapshot): asks LLM for full frames + relations output
 * - Delta mode (with snapshot): asks LLM for incremental changes only
 */

import type { Frame, SemanticContent } from '../semantic/types';

// ── Input Types ──

export interface FrameExtractionTurn {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  turn_hash?: string; // Source tracking — which turn this is
}

export interface FrameExtractionInput {
  turns: FrameExtractionTurn[];
  snapshot?: SemanticContent;
  /** Number of turns already processed by previous extractions (from the start). Used in delta mode to split context vs new turns. */
  processedTurnCount?: number;
}

// ── Output Type ──

export interface FrameExtractionPromptResult {
  systemPrompt: string;
  userPrompt: string;
}

// ── Internal Helpers ──

/**
 * Calculate the next frame ID from existing frames.
 * Frame IDs follow the pattern f_001, f_002, ...
 */
function calcNextFrameId(frames: Frame[]): string {
  if (frames.length === 0) return 'f_001';
  let max = 0;
  for (const f of frames) {
    const match = f.id.match(/^f_(\d+)$/);
    if (match) {
      const num = Number.parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }
  return `f_${String(max + 1).padStart(3, '0')}`;
}

/**
 * Serialize a snapshot to a YAML-like readable text format.
 */
function serializeSnapshot(snapshot: SemanticContent): string {
  const lines: string[] = [];

  lines.push('frames:');
  for (const frame of snapshot.frames) {
    lines.push(`  - id: ${frame.id}`);
    lines.push(`    type: ${frame.type}`);
    lines.push('    slots:');
    for (const [key, value] of Object.entries(frame.slots)) {
      lines.push(`      ${key}: ${JSON.stringify(value)}`);
    }
    if (frame.confidence !== undefined) {
      lines.push(`    confidence: ${frame.confidence}`);
    }
    if (frame.source !== undefined) {
      lines.push(`    source: ${frame.source}`);
    }
  }

  if (snapshot.relations.length > 0) {
    lines.push('relations:');
    for (const rel of snapshot.relations) {
      lines.push(`  - from: ${rel.from}`);
      lines.push(`    to: ${rel.to}`);
      lines.push(`    type: ${rel.type}`);
      if (rel.confidence !== undefined) {
        lines.push(`    confidence: ${rel.confidence}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format conversation turns for prompt inclusion.
 * Includes turn_hash as [T1], [T2], etc. for source tracking.
 */
function formatTurns(turns: FrameExtractionTurn[]): string {
  return turns
    .map((t, i) => {
      const tag = t.turn_hash ? `[T${i + 1}:${t.turn_hash.slice(0, 8)}]` : `[T${i + 1}]`;
      return `${tag} [${t.role}]: ${t.content}`;
    })
    .join('\n');
}

// ── System Prompts ──

const DELTA_SYSTEM_PROMPT = `You are a semantic extraction engine. Extract CHANGES (delta) from new conversation turns into a topic tree.

## Topic Tree Structure
- Each extraction produces ONE root frame representing the main topic
- Subtopics become child frames connected via "elaborates" relations
- The root frame type IS the topic name (e.g., "hangzhou_trip", "product_requirements")

## Three-Tier Extraction Rule (STRICT)

| Tier | Condition | Action | Confidence |
|------|-----------|--------|------------|
| MUST extract | User explicitly stated a fact | Extract it | 0.85-0.95 |
| MAY extract | AI suggestion that user explicitly confirmed/adopted | Extract it | 0.5-0.7 |
| MUST NOT extract | AI suggestion/advice user never responded to | Do NOT extract | — |

Key distinction: The user must have EXPLICITLY confirmed or adopted an AI suggestion for it to be extractable. Silence or moving to a different topic does NOT count as confirmation.

## What NOT to Extract
- Questions (from either side) — questions are not facts
- Meta-frames like "user_preferences", "user_interests" — use domain-specific types instead
- Pure conversational filler ("Sure!", "Let me help with that")
- AI meta-commentary about its own process ("I'll organize this by...")
- AI suggestions, recommendations, or knowledge the user did NOT confirm

## slot_quotes Hard Binding (MANDATORY)
Each slot in your delta MUST have a corresponding "slot_quotes" entry pointing to VERBATIM text from the ★ NEW Turns ★ section.
- If you cannot quote exact source text from the NEW turns for a slot → DO NOT create that slot
- slot_quotes values must be actual substrings from the conversation, not paraphrased
- Do NOT add slots based on AI responses unless the user explicitly confirmed them in the NEW turns
- This is a hard constraint — zero exceptions

## Slot Nesting Limit: Maximum 1 Level
- ALLOWED: simple values ("Portland"), numbers (80000), arrays of strings
- ALLOWED: arrays of 1-level objects ([{ "type": "peanut" }])
- FORBIDDEN: nested objects ({ budget: { materials: [...] } }) — 2+ levels deep
- If a subtopic has more than 2-3 slots → it MUST be a separate frame with "elaborates" relation

## Frame Count: 3-8 Frames Total (Hard Limit)
- Fewer than 3 = subtopics not properly split out from root
- More than 8 = over-fragmentation
- Each frame should have 1-4 flat slots

## Delta Action Mapping (from NEW turns ONLY)

| User action in new turns | Delta action |
|--------------------------|-------------|
| New subtopic info (e.g., equipment details) | "add" new frame + "elaborates" relation |
| Modify existing fact (e.g., budget 80k → 100k) | "update" existing frame's slot |
| Negate/cancel previous content | "remove" target frame |
| Nothing new said (AI expanded on its own) | **No action — output empty changes** |

## Core Rules
1. Output ONLY changes (delta) — do NOT repeat unchanged frames
2. Frame type uses snake_case domain nouns (e.g., "dietary_restrictions", not "constraints")
3. Frame IDs follow pattern: f_001, f_002, ...

## BAD vs GOOD Delta Examples

BAD — extracting AI suggestions from new turns:
  ★ NEW Turn: AI says "You might want to consider Stumptown for beans"
  ★ NEW Turn: User says "What about the interior design?"

  WRONG delta: { action: "update", target: "f_001", slots: { suppliers: ["Stumptown"] } }
  ← User never confirmed Stumptown. AI suggested it, user ignored it.

GOOD — only extracting user-stated facts from new turns:
  ★ NEW Turn: User says "Actually, let's increase the budget to $100,000"

  CORRECT delta: { action: "update", target: "f_001", slots: { budget: 100000 }, slot_quotes: { budget: "increase the budget to $100,000" } }

## Drift Detection
If the new turns discuss a topic UNRELATED to the current root frame:
- Output: { "changes": [], "drift_detected": true }
- Do NOT extract anything — let the caller decide how to handle the new topic

## Source Tracking
- Set "source" field to turn tag (e.g., "T3")

## Relation Types (6 only)
1. causes — A causes B
2. conditions — A is a precondition for B
3. contrasts — A conflicts with or replaces B
4. follows — A happens after B (non-causal)
5. depends — A references/needs B
6. elaborates — A adds detail to B (USE THIS for subtopics)

## JSON Output Format
\`\`\`json
{
  "changes": [
    {
      "action": "add",
      "frame": {
        "id": "f_xxx", "type": "equipment_plan", "source": "T4", "confidence": 0.9,
        "slots": { "espresso_machine": "La Marzocca", "grinder": "Mazzer" },
        "slot_quotes": { "espresso_machine": "I want a La Marzocca machine", "grinder": "and a Mazzer grinder" }
      }
    },
    {
      "action": "update", "target": "f_001",
      "slots": { "budget": 100000 },
      "slot_quotes": { "budget": "increase the budget to $100,000" }
    },
    { "action": "remove", "target": "f_002", "reason": "user changed mind" }
  ],
  "new_relations": [
    { "from": "f_004", "to": "f_001", "type": "elaborates", "confidence": 0.9 }
  ],
  "drift_detected": false
}
\`\`\`
Output ONLY valid JSON. No markdown fences, no explanatory text.`;

const FIRST_EXTRACTION_SYSTEM_PROMPT = `You are a semantic extraction engine. Extract meaning from conversations into a topic tree.

## Topic Tree Structure
- Produce ONE root frame representing the main topic of the conversation
- Subtopics become child frames connected to the root via "elaborates" relations
- The root frame type IS the topic name (e.g., "hangzhou_trip", "product_requirements")

## Three-Tier Extraction Rule (STRICT)

| Tier | Condition | Action | Confidence |
|------|-----------|--------|------------|
| MUST extract | User explicitly stated a fact | Extract it | 0.85-0.95 |
| MAY extract | AI suggestion that user explicitly confirmed/adopted | Extract it | 0.5-0.7 |
| MUST NOT extract | AI suggestion/advice user never responded to | Do NOT extract | — |

Key distinction: The user must have EXPLICITLY confirmed or adopted an AI suggestion for it to be extractable. Silence or moving to a different topic does NOT count as confirmation.

## What NOT to Extract
- Questions (from either side) — questions are not facts
- Meta-frames like "user_preferences", "user_interests" — use domain-specific types instead
- Pure conversational filler ("Sure!", "Let me help with that")
- AI meta-commentary about its own process ("I'll organize this by...")
- AI suggestions, recommendations, or knowledge the user did NOT confirm

## slot_quotes Hard Binding (MANDATORY)
Every slot MUST have a corresponding entry in "slot_quotes" with VERBATIM text copied from the conversation.
- If you cannot quote the exact source text for a slot → DO NOT create that slot
- slot_quotes values must be actual substrings from the conversation, not paraphrased
- This is a hard constraint — zero exceptions

## Slot Nesting Limit: Maximum 1 Level
- ALLOWED: simple values ("Portland"), numbers (80000), arrays of strings
- ALLOWED: arrays of 1-level objects ([{ "type": "peanut" }])
- FORBIDDEN: nested objects ({ budget: { materials: [...] } }) — 2+ levels deep
- If a subtopic has more than 2-3 slots → it MUST be a separate frame with "elaborates" relation

## Frame Count: 3-8 Frames (Hard Limit)
- Fewer than 3 = subtopics not properly split out from root
- More than 8 = over-fragmentation
- Each frame should have 1-4 flat slots

## Frame Structure Rules
1. Frame type uses snake_case domain nouns (NOT generic labels)
2. Frame IDs start from f_001
3. LISTS OF SIMILAR ITEMS = ONE FRAME with array slots

## BAD vs GOOD Examples

BAD — extracting AI suggestions as user facts:
  User: "I want to open a coffee shop in Portland"
  AI: "I recommend partnering with Stumptown for beans and using birch plywood for interiors"
  User: "What about the budget?"

  WRONG extraction:
    suppliers: ["Stumptown"]          ← user never confirmed this
    materials: ["birch plywood"]      ← AI invented, user never said this
    design_aesthetic: "Scandinavian"  ← AI suggested, user never confirmed

BAD — one giant nested frame (FORBIDDEN):
  f_001 coffee_shop:
    slots: {
      location: "Portland",
      budget: 80000,
      budget_breakdown: { equipment: 30000, renovation: 20000 },
      design: { aesthetic: "Scandinavian", materials: ["birch", "pine"] },
      staffing: { baristas: 3, manager: 1, hourly_wage_range: "$15-18" }
    }

GOOD — multiple flat frames + relations:
  f_001 coffee_shop: { location: "Portland", budget: 80000 }
  f_002 budget_allocation: { equipment: 30000, renovation: 20000 }
  f_003 design_concept: { aesthetic: "Scandinavian" }
  f_004 staffing_plan: { baristas: 3, manager: 1 }
  relations: [
    { from: "f_002", to: "f_001", type: "elaborates" },
    { from: "f_003", to: "f_001", type: "elaborates" },
    { from: "f_004", to: "f_001", type: "elaborates" }
  ]
  (Note: each frame has flat slots, no nesting beyond 1 level)

## Source Tracking
- Set "source" field to turn tag (e.g., "T1", "T2")
- For frames derived from multiple turns, use the most recent turn

## Confidence Scoring
- User's explicit statements: 0.85-0.95
- Mutual decisions (both agreed): 0.8
- AI suggestions user explicitly confirmed: 0.5-0.7

## Relation Types (6 only): causes, conditions, contrasts, follows, depends, elaborates
Use "elaborates" for all subtopic relationships.

## JSON Output Format
\`\`\`json
{
  "frames": [
    {
      "id": "f_001", "type": "coffee_shop", "source": "T1", "confidence": 0.9,
      "slots": { "location": "Portland", "budget": 80000 },
      "slot_quotes": { "location": "coffee shop in downtown Portland", "budget": "my budget is around $80,000" }
    },
    {
      "id": "f_002", "type": "design_concept", "source": "T3", "confidence": 0.85,
      "slots": { "aesthetic": "Scandinavian" },
      "slot_quotes": { "aesthetic": "I want a Scandinavian aesthetic" }
    }
  ],
  "relations": [
    { "from": "f_002", "to": "f_001", "type": "elaborates", "confidence": 0.9 }
  ]
}
\`\`\`
Output ONLY valid JSON. No markdown fences, no explanatory text.`;

// ── Main Function ──

/**
 * Build system + user prompts for frame semantic extraction.
 *
 * When `snapshot` is provided, produces delta-mode prompts that ask the LLM
 * to output only changes relative to the existing snapshot.
 * When no snapshot, produces first-extraction prompts for full output.
 */
export function buildFrameExtractionPrompt(
  input: FrameExtractionInput
): FrameExtractionPromptResult {
  const { turns, snapshot, processedTurnCount } = input;

  if (snapshot) {
    // Delta mode
    const nextId = calcNextFrameId(snapshot.frames);
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
      turnsSection = `## Context Turns (already in snapshot — do NOT re-extract these)
${contextText}

## ★ NEW Turns (extract delta from THESE) ★
${newText}`;
    } else {
      // No split info — treat all as new (backward compatible)
      turnsSection = `## New Conversation Turns
${formatTurns(turns)}`;
    }

    const userPrompt = `## Current Snapshot
${snapshotYaml}

${turnsSection}

## Instructions
Output the delta (changes only) based on the ★ NEW turns ★ above.
CRITICAL RULES:
1. Each slot in your delta MUST have a corresponding slot_quotes entry pointing to VERBATIM text from the ★ NEW Turns ★ section. No quote from new turns → no slot.
2. Do NOT add slots based on AI responses unless the user explicitly confirmed them in the new turns.
3. The context turns are for reference only — their information is already in the snapshot.
4. Keep all slots flat (max 1 level nesting). If a subtopic needs 3+ slots → add a new frame with "elaborates" relation.

For each piece of new USER-STATED information:
- If it MODIFIES an existing frame → "update" with only changed slots
- If it's a NEW subtopic → "add" a new frame + "elaborates" relation
- If it NEGATES or REPLACES something → "remove" the old frame
- If the user said nothing new (AI expanded on its own) → output empty changes: { "changes": [], "drift_detected": false }
New frame IDs start from ${nextId}.
Include "source" field referencing the turn tag (T1, T2, etc.).`;

    return { systemPrompt: DELTA_SYSTEM_PROMPT, userPrompt };
  }

  // First extraction mode
  const turnsText = formatTurns(turns);

  const userPrompt = `## Conversation
${turnsText}

## Instructions
Extract all semantic frames and relations from this conversation.
Include "source" field referencing the turn tag (T1, T2, etc.) for each frame.`;

  return { systemPrompt: FIRST_EXTRACTION_SYSTEM_PROMPT, userPrompt };
}
