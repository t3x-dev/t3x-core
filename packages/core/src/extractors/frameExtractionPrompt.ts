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

## What to Extract
Extract from ALL participants:
- User statements: confidence 0.85-0.95
- AI suggestions the user acknowledged or built upon: confidence 0.7-0.8
- AI substantive responses (facts, knowledge, detailed information): confidence 0.5-0.7
- Mutual decisions: confidence 0.8

## What NOT to Extract
- Questions (from either side) — questions are not facts
- Meta-frames like "user_preferences", "user_interests" — use domain-specific types instead
- Pure conversational filler ("Sure!", "Let me help with that")
- AI meta-commentary about its own process ("I'll organize this by...")

## Core Rules
1. Output ONLY changes (delta) — do NOT repeat unchanged frames
2. ONE frame per topic — no fragmentation
3. Extract substantive content — facts, conclusions, knowledge, recommendations
4. Frame type uses snake_case domain nouns (e.g., "dietary_restrictions", not "constraints")
5. Frame IDs follow pattern: f_001, f_002, ...
6. AIM FOR 3-5 FRAMES TOTAL per extraction

## When to UPDATE vs ADD
- MODIFIES existing frame topic → "update" with only changed slots
- NEW subtopic of root → "add" + relation { from: new_id, to: root_id, type: "elaborates" }
- Completely UNRELATED topic → output "drift_detected" status (see below)

## When to REMOVE
- User explicitly rejects or cancels something → "remove"
- User replaces one option with another → "remove" old + "add"/"update" new

## ABSOLUTE PROHIBITION: No Fabrication
- Every slot value MUST trace to actual conversation text
- Include slot_quotes for traceability
- Do NOT invent names, prices, numbers, or details not mentioned

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

## Source Quoting
For EACH slot, include "slot_quotes" mapping slot keys to EXACT verbatim text from the conversation.

## JSON Output Format
\`\`\`json
{
  "changes": [
    {
      "action": "add",
      "frame": {
        "id": "f_xxx", "type": "dietary_restrictions", "source": "T4", "confidence": 0.9,
        "slots": { "allergies": [{ "type": "peanut", "applies_to": "friend" }] },
        "slot_quotes": { "allergies": "One friend is allergic to peanuts" }
      }
    },
    {
      "action": "update", "target": "f_001",
      "slots": { "budget": 5000 },
      "slot_quotes": { "budget": "actually let's keep it under $5000" }
    },
    { "action": "remove", "target": "f_002", "reason": "user changed mind" }
  ],
  "new_relations": [
    { "from": "f_003", "to": "f_001", "type": "elaborates", "confidence": 0.9 }
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

## What to Extract
Extract from ALL participants:
- User statements: confidence 0.85-0.95
- AI suggestions the user acknowledged or built upon: confidence 0.7-0.8
- AI substantive responses (facts, knowledge, detailed information): confidence 0.5-0.7
- Mutual decisions (both agreed): confidence 0.8

## What NOT to Extract
- Questions (from either side) — questions are not facts
- Meta-frames like "user_preferences", "user_interests" — use domain-specific types instead
  BAD: f_001 user_preferences: { ... }
  GOOD: f_002 accommodation: { style: "boutique", area: "near West Lake" }
- Pure conversational filler ("Sure!", "Let me help with that")
- AI meta-commentary about its own process ("I'll organize this by...")

## Frame Structure Rules
1. AIM FOR 3-5 FRAMES TOTAL — fewer, richer frames are better
2. ONE frame per topic — no fragmentation
3. LISTS OF SIMILAR ITEMS = ONE FRAME with array slots
4. Frame type uses snake_case domain nouns (NOT generic labels)
5. Frame IDs start from f_001

## ABSOLUTE PROHIBITION: No Fabrication
- Every slot value MUST trace to actual conversation text
- Include slot_quotes for traceability
- Do NOT invent names, prices, numbers, or details not mentioned
- Do NOT infer quantities or amounts not stated

## GOOD vs BAD Examples

BAD (meta-frames, over-extraction):
  f_001 user_preferences: { accommodation: "boutique", interests: ["tea"] }
  f_002 user_interests: { items: ["tea culture", "hiking"] }
  f_003 itinerary: { day_1: "Lingyin Temple", day_2: "..." }

GOOD (domain-specific, topic tree):
  f_001 hangzhou_trip: { destination: "Hangzhou", duration: "3 days", group_size: 3 }
  f_002 accommodation: { style: "boutique hotel", area: "near West Lake" }
  f_003 dietary_restrictions: { allergies: [{ type: "peanut", applies_to: "friend" }] }
  relations: [
    { from: "f_002", to: "f_001", type: "elaborates" },
    { from: "f_003", to: "f_001", type: "elaborates" }
  ]

## Source Tracking
- Set "source" field to turn tag (e.g., "T1", "T2")
- For frames derived from multiple turns, use the most recent turn

## Confidence Scoring
- User's explicit statements: 0.85-0.95
- Mutual decisions: 0.8
- AI suggestions user acknowledged: 0.5-0.7

## Relation Types (6 only): causes, conditions, contrasts, follows, depends, elaborates
Use "elaborates" for all subtopic relationships.

## Source Quoting
For EACH slot, include "slot_quotes" mapping slot keys to EXACT verbatim text from conversation.

## JSON Output Format
\`\`\`json
{
  "frames": [
    {
      "id": "f_001", "type": "hangzhou_trip", "source": "T1", "confidence": 0.9,
      "slots": { "destination": "Hangzhou", "duration": "3 days", "group_size": 3 },
      "slot_quotes": { "destination": "planning a 3-day trip to Hangzhou" }
    },
    {
      "id": "f_002", "type": "dietary_restrictions", "source": "T4", "confidence": 0.9,
      "slots": { "allergies": [{ "type": "peanut", "applies_to": "friend" }] },
      "slot_quotes": { "allergies": "One friend is allergic to peanuts" }
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
Output the delta (changes only) based on the NEW turns above.
IMPORTANT: The context turns are provided for reference only — their information is already in the snapshot. Focus on NEW turns.
However, if you notice the snapshot is MISSING important user points from context turns (constraints, preferences, facts), ADD them as new frames.
For each piece of new information:
- If it MODIFIES an existing frame → "update" with only changed slots
- If it's a NEW topic → "add" a new frame
- If it NEGATES or REPLACES something → "remove" the old frame
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
