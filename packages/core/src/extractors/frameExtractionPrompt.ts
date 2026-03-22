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

const DELTA_SYSTEM_PROMPT = `You are a semantic extraction engine. Your task is to extract semantic CHANGES (delta) from new conversation turns into a TOPIC TREE — NOT re-generate everything.

## CRITICAL: Topic Tree Structure
The existing snapshot is a SINGLE TOPIC TREE with one root frame. All new information MUST be added under the existing tree — NEVER create a new root frame.
- New subtopics → add as child frames with "elaborates" relation to their parent
- More detail on existing topic → update existing frame's slots
- Cross-cutting concerns (constraints, preferences) → add as child frames of the root

## CRITICAL: Root Evolution (NOT Drift)
If the conversation narrows or refines the topic (e.g., "arts" → "Russian arts" → "ballet"), this is NOT a new topic. Update the ROOT FRAME's type and slots to reflect the refined topic. Do NOT create a new root.

## Confidence Scoring
- User's explicit statements → 0.9-1.0
- User's implied preferences → 0.6-0.8
- Assistant's proposals not yet confirmed → 0.4-0.6
- User confirms assistant's proposal → upgrade to 0.8-0.9

## CRITICAL: Questions vs Statements
- User ASKING a question ("can I use 0W-20?") → do NOT create a frame for the question itself
- The ANSWER to the question is what matters — extract the answer as knowledge
- Only extract from user turns when the user STATES facts, preferences, constraints, or CONFIRMS something
- A question reveals the user's TOPIC OF INTEREST but not a decision or fact

Examples:
  User: "can I use 0W-20 oil?" → do NOT create a frame like { alternative_oil: "0W-20" }
  AI: "No, diesels need 5W-30, 0W-20 is too thin" → extract: { recommended: "5W-30", not_recommended: "0W-20" }
  User: "ok I'll go with 5W-30" → upgrade confidence to 0.9

## CRITICAL: No Meta-Frames About the User
- NEVER create frames like "user_preferences", "user_interests", "user_questions", "user_context"
- When user states a preference (e.g., "I prefer Shell"), UPDATE the relevant topic frame — don't create a separate preferences frame
- The YAML is a KNOWLEDGE DOCUMENT, not a conversation transcript — no one reading it needs to know "the user said X"
- User preferences should FILTER and PRIORITIZE the existing knowledge, not be a separate category

BAD: user_preferences: { preferred_brands: ["Shell", "Mobil"], quality: "premium" }
GOOD: update oil_brands frame → recommended: ["Mobil 1 0W-20", "Shell Helix Ultra 0W-20"]

BAD: user_context: { vehicle: "2020 CX-5", engine: "2.0L" }
GOOD: put vehicle/engine info in the ROOT frame slots

## CRITICAL: Conclusions Only — No Explanations
- Extract CONCLUSIONS and DECISIONS, never explanations or reasoning
- Slot values should be SHORT — a fact, a name, a number, a short phrase
- Do NOT create slots that explain WHY — the conversation has the explanation
- Do NOT duplicate information across slots
- Merge related information into fewer, denser slots

BAD (verbose):
  diesel_engine_characteristics:
    compression_ratios: "higher compression ratios"
    combustion_pressures: "greater combustion pressures"
  wrong_oil_risks:
    engine_damage: "potential engine wear"

GOOD (concise):
  not_recommended: "0W-20 (too thin for diesel)"

## CRITICAL: One Frame Per Topic — No Fragmentation
- Pros and cons of the SAME THING = ONE frame with separate slots, NOT two frames
- Different perspectives on the same topic = ONE frame, NOT multiple frames
- Use "contrasts" relation ONLY for genuinely opposing TOPICS, not for pros/cons within a topic
- If you're about to create a frame that is the opposite of an existing frame, UPDATE the existing frame with the contrasting slots instead

BAD (fragmented — same topic split into 3 frames):
  f_002 uk_university_criticisms: { issues: ["expensive", "grade inflation"] }
  f_003 uk_university_strengths: { points: ["prestige", "research quality"] }
  f_004 overrated_arguments: { reasons: [...] }

GOOD (one frame, dense):
  f_002 uk_universities: { criticisms: ["expensive", "grade inflation"], strengths: ["prestige", "research quality"] }

## Core Rules
1. Output ONLY changes (delta) — do NOT repeat unchanged frames
2. NEVER create a second root frame — add under the existing root
3. Group related items into ONE frame with array slots
4. Frame type uses snake_case — descriptive topic nouns (e.g., "ballet", "dietary_constraints")
5. Frame IDs follow pattern: f_001, f_002, ...
6. Extract from ALL participants — user statements at high confidence, AI answers at lower confidence
7. Do NOT create frames for user questions — only for statements, facts, preferences, constraints, and confirmations
8. Keep slots CONCISE — facts and decisions, not explanations
9. AIM FOR 3-5 TOTAL FRAMES — fewer, denser frames are better
10. ONE frame per topic — never split pros/cons or perspectives into separate frames

## When to UPDATE vs ADD
- New turn MODIFIES existing frame → "update" with only changed slots
- New turn adds a NEW SUBTOPIC → "add" a new child frame + "elaborates" relation to parent
- User CONFIRMS an AI proposal → "update" the frame's confidence to 0.8-0.9
- Topic narrows/refines → "update" the root frame's type

## When to REMOVE
- User explicitly rejects something → "remove" that frame
- User replaces one option with another → "remove" old + "add"/"update" new
- User narrows scope away from a subtopic → "remove" the irrelevant subtree

## ABSOLUTE PROHIBITION: No Fabrication
- NEVER include information not in the conversation
- Every slot value MUST be traceable to actual conversation text
- If you cannot provide a slot_quote → do NOT include that slot

## Relation Types (only "elaborates" for tree hierarchy, others for cross-links)
1. elaborates — A is a subtopic/child of B (PRIMARY — builds the tree)
2. conditions — A is a precondition for B
3. contrasts — A conflicts with or replaces B
4. causes — A causes B
5. depends — A references/needs B
6. follows — A happens after B

## Source Quoting (CRITICAL for traceability)
For EACH slot, include "slot_quotes" mapping each slot key to the EXACT verbatim text from the conversation. Copy text exactly — do not paraphrase.

## CRITICAL: Topic Drift Detection
Before extracting, check: are the new turns about the SAME topic as the root frame?
- Narrowing or deepening the topic (e.g., "universities" → "UK universities") = NOT drift. Proceed normally.
- Completely UNRELATED topic (e.g., "universities" → "car maintenance") = DRIFT.

If drift is detected, output ONLY this instead of a changes array:
{
  "status": "drift_detected",
  "current_topic": "<current root frame type>",
  "new_topic": "<short snake_case name for what the new turns are about>",
  "confidence": <0.0-1.0 how confident this is a real topic change>
}

Only flag drift when confidence >= 0.8. When in doubt, extract normally.

## JSON Output Format
\`\`\`json
{
  "changes": [
    {
      "action": "add",
      "frame": {
        "id": "f_003", "type": "art_values", "source": "T4", "confidence": 0.5,
        "slots": {
          "emotional_expression": "storytelling without words",
          "technical_perfection": "years of disciplined training"
        },
        "slot_quotes": {
          "emotional_expression": "ballet tells stories without words through pure movement",
          "technical_perfection": "dancers train for years to achieve technical perfection"
        }
      }
    },
    {
      "action": "update", "target": "f_001",
      "slots": { "focus": "ballet" },
      "slot_quotes": { "focus": "I'm most interested in ballet" }
    },
    { "action": "remove", "target": "f_004", "reason": "user not interested in literature" }
  ],
  "new_relations": [
    { "from": "f_003", "to": "f_002", "type": "elaborates", "confidence": 0.9 }
  ]
}
\`\`\`
Output ONLY valid JSON. No markdown fences, no explanatory text.`;

const FIRST_EXTRACTION_SYSTEM_PROMPT = `You are a semantic extraction engine. Extract meaning from conversations into a TOPIC TREE — a single hierarchical structure organized by what the conversation is about.

## CRITICAL: Topic Tree Rules
1. Create exactly ONE root frame named after the conversation's main topic
2. Root type = descriptive snake_case noun (e.g., "russian_arts", "japan_trip", "product_roadmap")
3. Subtopics become CHILD frames connected to the root (or to other children) via "elaborates" relations
4. Cross-cutting concerns (constraints, preferences, open questions) are CHILD frames of the root — not separate top-level frames
5. The tree should be 2-4 levels deep, with 3-8 total frames

## CRITICAL: Conclusions Only — No Explanations
- Extract CONCLUSIONS and DECISIONS, never explanations or reasoning
- Slot values should be SHORT — a fact, a name, a number, a short phrase
- Do NOT create slots that explain WHY — the conversation has the explanation
- Merge related information into fewer, denser slots

## CRITICAL: One Frame Per Topic — No Fragmentation
- Pros and cons of the SAME THING = ONE frame with separate slots, NOT two frames
- Different perspectives on the same topic = ONE frame, NOT multiple frames
- If something has advantages AND disadvantages, put BOTH in the same frame

BAD (fragmented):
  f_002 uk_criticisms: { issues: ["expensive"] }
  f_003 uk_strengths: { points: ["prestige"] }

GOOD (dense):
  f_002 uk_universities: { criticisms: ["expensive"], strengths: ["prestige"] }

## Frame Structure Rules
1. Each frame is a TOPIC NODE in the tree — named by what it's about
2. LISTS OF SIMILAR ITEMS = ONE frame with array slots, NEVER separate frames
3. Use arrays for lists: items, options, features, requirements
4. Frame type uses snake_case (descriptive topic nouns)
5. Frame IDs start from f_001 (root) and increment
6. AIM FOR 3-5 TOTAL FRAMES — fewer, denser frames are better
7. ONE frame per topic — never split perspectives into separate frames

## Extract from ALL Participants
- User statements, facts, preferences, constraints → high confidence (0.9-1.0)
- User implied preferences → medium confidence (0.6-0.8)
- Assistant answers and structured knowledge → lower confidence (0.4-0.6)
- Assistant knowledge is valuable domain structure — extract it so the user can review and confirm

## CRITICAL: Questions vs Statements
- User ASKING a question → do NOT create a frame for the question itself
- The ANSWER contains the knowledge — capture the answer, not the question
- A question can refine the root topic but is NOT a fact or decision

## CRITICAL: No Meta-Frames About the User
- NEVER create frames like "user_preferences", "user_interests", "user_questions", "user_context"
- When user states a preference, UPDATE the relevant topic frame — don't create a separate category
- The YAML is a KNOWLEDGE DOCUMENT — no one reading it needs to know who said what
- User preferences should FILTER and PRIORITIZE existing knowledge, not be a separate section

BAD: user_preferences: { preferred_brands: ["Shell", "Mobil"] }
GOOD: update the brands/recommendations frame with the preferred brands at higher confidence

## ABSOLUTE PROHIBITION: No Fabrication
- NEVER include information not in the conversation
- Every slot value MUST be traceable to actual conversation text
- If you cannot provide a slot_quote → do NOT include that slot
- Do NOT invent names, prices, numbers, or details nobody mentioned

## GOOD vs BAD Examples

BAD (flat categories, not a tree):
  f_001 inquiry_topic: { subject: "Russian arts" }
  f_002 assistant_proposals: { categories: ["ballet", "literature", "music"] }
  // PROBLEM: organized by WHO said it, not WHAT it's about

BAD (multiple roots):
  f_001 russian_ballet: { ... }
  f_002 russian_literature: { ... }
  // PROBLEM: two root frames — should be one tree

GOOD (concise topic tree):
  f_001 russian_arts: { subject: "arts and culture" }                           // root
  f_002 ballet: { significance: "imperial patronage", works: ["Swan Lake"] }    // child
  relations: f_002 elaborates f_001
  // 2 frames, dense slots, no explanations

GOOD (trip planning — concise):
  f_001 hangzhou_trip: { duration: "3 days", group_size: 3 }                   // root
  f_002 constraints: { dietary: ["peanut allergy"], avoid: ["Hefang Street"] }  // child
  f_003 logistics: { transport: "high-speed train", accommodation: "boutique hotel" }
  relations: f_002 elaborates f_001, f_003 elaborates f_001
  // 3 frames total — clean and scannable

GOOD (car maintenance — concise, no user-meta):
  f_001 cx5_oil_maintenance: { vehicle: "2020 CX-5 2.0L gas" }                // root
  f_002 engine_oil: { viscosity: "0W-20", type: "full synthetic", capacity: "4.2-4.5 quarts", interval: "7,500-10,000 miles" }
  f_003 recommended_brands: { top: ["Mobil 1 0W-20", "Shell Helix Ultra 0W-20"], others: ["Castrol GTX", "Valvoline MaxLife"] }
  relations: f_002 elaborates f_001, f_003 elaborates f_001
  // 3 frames — user's brand preference is reflected IN the brands frame (not a separate "user_preferences" frame)

## Relation Types
1. elaborates — A is a subtopic/child of B (PRIMARY — builds the tree)
2. conditions — A constrains B
3. contrasts — A conflicts with B
4. causes / depends / follows — causal/temporal links

## Source Quoting
For EACH slot, include "slot_quotes" mapping slot keys to EXACT verbatim text from conversation.

## JSON Output Format
\`\`\`json
{
  "frames": [
    {
      "id": "f_001", "type": "russian_arts", "source": "T1", "confidence": 0.9,
      "slots": { "subject": "arts and culture" },
      "slot_quotes": { "subject": "quetion regarding russian arts" }
    },
    {
      "id": "f_002", "type": "ballet", "source": "T2", "confidence": 0.5,
      "slots": {
        "significance": "imperial patronage, national pride",
        "key_works": ["Swan Lake", "The Nutcracker", "Sleeping Beauty"]
      },
      "slot_quotes": {
        "significance": "Russia has an incredibly rich artistic tradition",
        "key_works": "Swan Lake, The Nutcracker, Sleeping Beauty"
      }
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
