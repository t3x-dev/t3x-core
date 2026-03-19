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

const DELTA_SYSTEM_PROMPT = `You are a semantic extraction engine. Your task is to extract semantic CHANGES (delta) from new conversation turns — NOT re-generate everything.

## CRITICAL: Extraction Priority (MUST follow this order)
1. USER CONSTRAINTS — allergies, avoidances, rejections, hard limits, dealbreakers (confidence: 0.95)
2. USER PREFERENCES — explicitly stated wants, likes, dislikes, interests (confidence: 0.9)
3. USER FACTS — dates, group size, budget, logistics, travel method (confidence: 0.9)
4. USER OPEN QUESTIONS — things the user asked but remain unresolved (confidence: 0.7)
5. MUTUAL DECISIONS — things both parties agreed on or user confirmed (confidence: 0.8)
6. ASSISTANT SUGGESTIONS — recommendations NOT yet confirmed by user (confidence: 0.3-0.5)

Categories 1-4 MUST ALWAYS be extracted. Category 6 should ONLY be extracted if the user acknowledged or built upon it.

## Core Rules
1. Output ONLY changes (delta) — do NOT repeat unchanged frames
2. Group related items into ONE frame with array slots — do NOT create separate frames for each item
3. Keep conclusions and decisions, discard process discussion
4. Frame type uses snake_case (nouns or noun phrases)
5. Frame IDs follow pattern: f_001, f_002, ...
6. AIM FOR 3-8 FRAMES TOTAL

## CRITICAL: When to UPDATE vs ADD
- If a new turn MODIFIES information already captured in an existing frame → use "update" with only the changed slots
- If a new turn provides NEW information on a DIFFERENT topic → use "add"
- DO NOT add a new frame when an existing frame covers the same topic — UPDATE it instead
- When the user states a NEW constraint or preference → if a "constraints" or "preferences" frame already exists, UPDATE it by adding to the array; otherwise ADD a new frame

## CRITICAL: When to REMOVE
- If the user explicitly rejects, cancels, or changes their mind about something → use "remove"
- If the user replaces one option with another → REMOVE the old frame AND add/update the new one
- If the assistant's suggestion is rejected by the user → remove frames from that suggestion

## CRITICAL: New User Constraints
When the user states a new constraint (allergy, avoidance, rejection) in a later turn:
- This is HIGHEST PRIORITY — it MUST appear in the delta output
- If a "constraints" frame exists → UPDATE it with the new constraint added to the relevant array
- If no "constraints" frame exists → ADD one
- NEVER ignore a user constraint just because it appeared in a later turn

## ABSOLUTE PROHIBITION: No Fabrication
- NEVER include information that does NOT appear in the conversation
- Every slot value MUST be directly traceable to actual conversation text
- If you cannot provide a slot_quote for a slot → do NOT include that slot
- Do NOT invent specific names, prices, numbers, lists, or details that no one mentioned
- Do NOT infer quantities or amounts not stated (e.g. if user says "offered to help" do NOT add "amount: 10000")

## Frame Type Guidance
Ensure these frame types exist when relevant:
- constraints: { dietary: [...], avoid_places: [...], health: [...] }
- preferences: { accommodation: ..., interests: [...], nightlife: ... }
- logistics: { transport: ..., arrival: ..., departure: ..., dates: ... }
- open_questions: { items: ["unanswered question 1", "unanswered question 2"] }
  ONLY include questions the USER asked that remain unanswered.
  NEVER include questions the ASSISTANT asked — those are prompts, not user knowledge.

## Source Tracking
- Set the "source" field on each new/updated frame to the turn tag (e.g., "T3")
- For frames derived from multiple turns, use the most recent turn

## Confidence Scoring
- User's explicit statements → confidence: 0.9-1.0
- User's implied preferences → confidence: 0.6-0.8
- Assistant's suggestions not confirmed → confidence: 0.3-0.5

## Relation Types (pick from these 6 only)
1. causes — A causes B
2. conditions — A is a precondition for B
3. contrasts — A conflicts with or replaces B
4. follows — A happens after B (non-causal)
5. depends — A references/needs B
6. elaborates — A adds detail to B

## Source Quoting (CRITICAL for traceability)
For EACH slot, include a "slot_quotes" object that maps each slot key to the EXACT verbatim text from the conversation that this slot was extracted from. Copy the text exactly — do not paraphrase.

## JSON Output Format
\`\`\`json
{
  "changes": [
    {
      "action": "add",
      "frame": {
        "id": "f_xxx", "type": "constraints", "source": "T4", "confidence": 0.95,
        "slots": {
          "dietary": [{ "type": "peanut_allergy", "applies_to": "friend" }],
          "avoid_places": [{ "place": "Hefang Street", "reason": "too commercial" }]
        },
        "slot_quotes": {
          "dietary": "One friend is allergic to peanuts",
          "avoid_places": "avoid the Hefang Street tourist area"
        }
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
    { "from": "f_003", "to": "f_001", "type": "conditions", "confidence": 0.9 }
  ]
}
\`\`\`
Output ONLY valid JSON. No markdown fences, no explanatory text.`;

const FIRST_EXTRACTION_SYSTEM_PROMPT = `You are a semantic extraction engine. Extract the USER'S meaning from conversations into structured frames.

## CRITICAL: Extraction Priority (MUST follow this order)
1. USER CONSTRAINTS — allergies, avoidances, rejections, hard limits, dealbreakers (confidence: 0.95)
2. USER PREFERENCES — explicitly stated wants, likes, dislikes, interests (confidence: 0.9)
3. USER FACTS — dates, group size, budget, logistics, travel method (confidence: 0.9)
4. USER OPEN QUESTIONS — things the user asked but remain unresolved (confidence: 0.7)
5. MUTUAL DECISIONS — things both parties agreed on or user confirmed (confidence: 0.8)
6. ASSISTANT SUGGESTIONS — recommendations NOT yet confirmed by user (confidence: 0.3-0.5)

Categories 1-4 MUST ALWAYS be extracted. Category 6 should ONLY be extracted if the user acknowledged, discussed, or built upon the suggestion. Do NOT extract the assistant's full itinerary, budget breakdown, or recommendation list as facts — those are suggestions until the user confirms them.

## Frame Structure Rules
1. AIM FOR 3-8 FRAMES TOTAL — fewer, richer frames are better than many thin ones
2. LISTS OF SIMILAR ITEMS = ONE FRAME with an array slot, NEVER separate frames
   - 10 city recommendations = ONE frame: { type: "recommended_cities", slots: { cities: [...] } }
   - NOT 10 separate "city_recommendation" frames!
3. Each frame represents a TOPIC or CATEGORY, not an individual item
4. Use arrays for lists: cities, features, pros, cons, requirements, options
5. Frame type uses snake_case (nouns or noun phrases)
6. Frame IDs start from f_001

## Frame Type Guidance
Use these frame types when applicable:
- constraints: { dietary: [...], avoid_places: [...], health: [...] }
- preferences: { accommodation: ..., interests: [...], nightlife: ... }
- logistics: { transport: ..., arrival: ..., departure: ..., dates: ... }
- open_questions: { items: ["What's the weather like?", "Should we rent bikes?"] }
  ONLY include questions the USER asked that remain unanswered.
  NEVER include questions the ASSISTANT asked — those are prompts, not user knowledge.
- trip_plan / project_plan / ...: { destination: ..., duration: ..., group: ... }
You may create other types as needed, but constraints, preferences, and open_questions should always be separate frames when present.

## ABSOLUTE PROHIBITION: No Fabrication
- NEVER include information that does NOT appear in the conversation
- Every slot value MUST be directly traceable to actual conversation text
- If you cannot provide a slot_quote for a slot → do NOT include that slot
- Do NOT invent specific names, prices, numbers, lists, or details that no one mentioned
  BAD: { "hotels": ["Hotel Gracery", "Citadines"] }  ← nobody said these names!
  GOOD: { "accommodation_type": "mid-range" }  ← user actually said this
- Do NOT infer quantities or amounts not stated (e.g. if user says "offered to help" do NOT add "amount: 10000")
- "Common knowledge" or "reasonable inference" is NOT an excuse to fabricate details

## ANTI-PATTERNS (DO NOT DO THIS)
- Do NOT extract the assistant's detailed itinerary/schedule as facts — unless the user said "yes, let's do that"
- Do NOT create frames for the assistant's budget breakdown or cost estimates — those are suggestions
- Do NOT ignore when the user says "avoid X", "I'm allergic to X", "I don't want X" — these are HIGHEST PRIORITY
- Do NOT put constraints inside a general trip_plan frame — constraints MUST be a separate frame so they are clearly visible
- Do NOT omit open questions — if the user asked something and it wasn't resolved, capture it

## GOOD vs BAD Examples

BAD (misses user constraints, over-extracts AI suggestions):
  f_001 trip_plan: { destination: "Hangzhou", duration: "3 days" }
  f_002 itinerary: { day_1: "Lingyin Temple → Silk Museum → ...", day_2: "..." }
  f_003 budget_breakdown: { accommodation: 800, food: 900, transport: 1000 }
  // PROBLEM: user said "peanut allergy" and "avoid Hefang Street" — both missing!
  // PROBLEM: itinerary and budget are AI suggestions, not user knowledge

GOOD (captures what the user actually said):
  f_001 trip_plan: { destination: "Hangzhou", duration: "3 days", group_size: 3, budget_per_person: 3000 }
  f_002 constraints: { dietary: [{ type: "peanut_allergy", applies_to: "friend" }], avoid: [{ place: "Hefang Street", reason: "too commercial" }] }
  f_003 preferences: { accommodation: "boutique hotel or guesthouse", area: "near West Lake", interests: ["tea culture", "Longjing Village"], nightlife: "bar or live music" }
  f_004 logistics: { inbound: "high-speed train from Shanghai, arriving 10am", local_transport: "considering bike rental" }
  f_005 open_questions: { items: ["What's the weather like?", "Is Wuzhen doable as a day trip?"] }

## Source Tracking
- Set "source" field to turn tag (e.g., "T1", "T2")
- For frames derived from multiple turns, use the most recent turn

## Confidence Scoring
- User's explicit statements → 0.9-1.0
- User's implied preferences → 0.6-0.8
- Assistant's suggestions not yet confirmed → 0.3-0.5

## Relation Types (6 only): causes, conditions, contrasts, follows, depends, elaborates

## Source Quoting
For EACH slot, include "slot_quotes" mapping slot keys to EXACT verbatim text from conversation.

## JSON Output Format
\`\`\`json
{
  "frames": [
    {
      "id": "f_001", "type": "trip_plan", "source": "T1", "confidence": 0.9,
      "slots": {
        "destination": "Hangzhou",
        "duration": "3 days",
        "group_size": 3,
        "budget_per_person": 3000
      },
      "slot_quotes": {
        "destination": "planning a 3-day trip to Hangzhou",
        "budget_per_person": "Budget is around ¥3000 per person"
      }
    },
    {
      "id": "f_002", "type": "constraints", "source": "T4", "confidence": 0.95,
      "slots": {
        "dietary": [{ "type": "peanut_allergy", "applies_to": "friend", "severity": "must avoid" }],
        "avoid_places": [{ "place": "Hefang Street", "reason": "too commercial" }]
      },
      "slot_quotes": {
        "dietary": "One friend is allergic to peanuts",
        "avoid_places": "avoid the Hefang Street tourist area — heard it's too commercial"
      }
    }
  ],
  "relations": [
    { "from": "f_002", "to": "f_001", "type": "conditions", "confidence": 0.9 }
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
