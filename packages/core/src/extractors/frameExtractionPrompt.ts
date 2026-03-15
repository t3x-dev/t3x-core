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
  return turns.map((t, i) => {
    const tag = t.turn_hash ? `[T${i + 1}:${t.turn_hash.slice(0, 8)}]` : `[T${i + 1}]`;
    return `${tag} [${t.role}]: ${t.content}`;
  }).join('\n');
}

// ── System Prompts ──

const DELTA_SYSTEM_PROMPT = `You are a semantic extraction engine. Your task is to extract semantic CHANGES (delta) from new conversation turns — NOT re-generate everything.

## Core Rules
1. Output ONLY changes (delta) — do NOT repeat unchanged frames
2. Group related items into ONE frame with array slots — do NOT create separate frames for each item (e.g., 10 city recommendations = ONE frame with a "cities" array, NOT 10 separate frames)
3. Keep conclusions and decisions, discard process discussion
4. Frame type uses snake_case (nouns or noun phrases)
5. Frame IDs follow pattern: f_001, f_002, ...
6. AIM FOR 3-8 FRAMES TOTAL — if you have more than 8, you're probably creating separate frames for items that should be arrays within one frame

## CRITICAL: When to UPDATE vs ADD
- If a new turn MODIFIES information already captured in an existing frame → use "update" with only the changed slots
- If a new turn provides NEW information on a DIFFERENT topic → use "add"
- DO NOT add a new frame when an existing frame covers the same topic — UPDATE it instead
- Examples of updates: price changes, preference changes, plan modifications, corrected information

## CRITICAL: When to REMOVE
- If the user explicitly rejects, cancels, or changes their mind about something → use "remove"
- If the user replaces one option with another (e.g., "actually, let's skip Kyoto") → REMOVE the old frame AND add/update the new one
- If the assistant's suggestion is rejected by the user → remove frames from that suggestion

## Source Tracking
- Set the "source" field on each new/updated frame to the turn tag (e.g., "T3") where the information came from
- For frames derived from multiple turns, use the most recent turn

## Confidence Scoring
- User's explicit statements → confidence: 0.9-1.0
- User's implied preferences → confidence: 0.6-0.8
- LLM suggestions the user hasn't confirmed → confidence: 0.3-0.5
- LLM questions (options not yet chosen) → confidence: 0.2-0.3

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
        "id": "f_xxx", "type": "...", "source": "T3", "confidence": 0.9,
        "slots": { "destination": "Tokyo", "budget": 7000 },
        "slot_quotes": { "destination": "I want to travel to Tokyo", "budget": "budget is around $7000" }
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
    { "from": "f_001", "to": "f_003", "type": "causes", "confidence": 0.8 }
  ]
}
\`\`\`
Output ONLY valid JSON. No markdown fences, no explanatory text.`;

const FIRST_EXTRACTION_SYSTEM_PROMPT = `You are a semantic extraction engine. Your task is to extract ALL semantic frames and relations from a conversation.

## Core Rules
1. One independent intent/conclusion/fact = one frame
2. Keep conclusions and decisions, discard process discussion
3. Frame type uses snake_case (nouns or noun phrases)
4. Frame IDs start from f_001

## Source Tracking
- Set the "source" field on each frame to the turn tag (e.g., "T1", "T2") where the information originated
- For frames synthesized from multiple turns, use the most recent turn

## Confidence Scoring
- User's explicit statements → confidence: 0.9-1.0
- User's implied preferences → confidence: 0.6-0.8
- LLM suggestions the user hasn't confirmed → confidence: 0.3-0.5
- LLM questions (options not yet chosen) → confidence: 0.2-0.3

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
  "frames": [
    {
      "id": "f_001", "type": "...", "source": "T1", "confidence": 0.9,
      "slots": { "destination": "Tokyo", "budget": 7000 },
      "slot_quotes": { "destination": "I want to travel to Tokyo", "budget": "budget is around $7000" }
    }
  ],
  "relations": [
    { "from": "f_001", "to": "f_002", "type": "causes", "confidence": 0.8 }
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
  const { turns, snapshot } = input;

  if (snapshot) {
    // Delta mode
    const nextId = calcNextFrameId(snapshot.frames);
    const snapshotYaml = serializeSnapshot(snapshot);
    const turnsText = formatTurns(turns);

    const userPrompt = `## Current Snapshot
${snapshotYaml}

## New Conversation Turns
${turnsText}

## Instructions
Output the delta (changes only). For each piece of new information:
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
