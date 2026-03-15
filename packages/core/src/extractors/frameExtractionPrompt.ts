/**
 * Frame Extraction Prompt Builder
 *
 * Constructs system + user prompts for LLM-based frame semantic extraction.
 *
 * Design philosophy: ONE conversation = ONE knowledge document.
 * The LLM acts as a "knowledge editor" maintaining a well-organized, deeply
 * nested YAML-like structure — not a fact extractor producing scattered frames.
 *
 * Supports two modes:
 * - First extraction (no snapshot): creates the document structure
 * - Delta mode (with snapshot): updates the existing document
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
 * Shows nested structure for readability.
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

const DOCUMENT_SYSTEM_PROMPT = `You are a knowledge document editor. Your job is to organize knowledge from conversations into a clean, well-structured YAML document.

## The Golden Rule: ONE Document, Deeply Nested

A conversation has ONE main topic. Your output should have:
- **1 root frame** (the main topic, e.g., "japan_trip", "product_design", "hiring_plan")
- **Deep nesting via slot values** — sub-topics are nested objects, NOT separate frames
- **Maximum 2-3 top-level frames** — only if the conversation genuinely covers unrelated topics

Think of it like writing a well-organized document outline:
\`\`\`yaml
japan_trip:                          # ONE root topic
  destination: "Tokyo"
  budget:                            # nested object for sub-topic
    total: 5000
    daily: 50
    accommodation: 2800
  accommodation:                     # another sub-topic
    type: "ryokan"
    location: "Asakusa"
    requirements:
      - "private onsen"
      - "traditional room"
  itinerary:
    main_cities:
      - name: "Tokyo"
        duration: "3-4 days"
        activities: ["temple visits", "cooking classes"]
      - name: "Kyoto"
        duration: "2-3 days"
\`\`\`

## Structure Rules

1. **Root frame type** = the conversation topic (e.g., "japan_trip", "app_redesign", "team_hiring")
2. **Sub-topics become nested objects** in slots — NOT separate frames
   - budget details → nest under \`budget: { total: ..., daily: ... }\`
   - accommodation → nest under \`accommodation: { type: ..., location: ... }\`
3. **Lists of similar items** → use arrays of objects
   - Cities to visit → \`cities: [{ name: "Tokyo", duration: "3 days" }, ...]\`
4. **Simple values stay flat** — don't over-nest single values
   - \`destination: "Tokyo"\` (not \`destination: { name: "Tokyo" }\`)
5. **Keep it scannable** — a human should understand the entire document in 5 seconds

## What to Extract

- **Decisions and conclusions** — what was decided (high confidence)
- **User preferences and requirements** — what they want (high confidence)
- **Plans and intentions** — what they plan to do (medium confidence)
- **Open questions** — things not yet decided (low confidence, marked clearly)

## What to SKIP

- Process discussion ("let me think about this...")
- LLM reasoning or explanations (unless user confirmed it)
- Greetings, pleasantries, meta-conversation

## Confidence Scoring
- User's explicit statements → confidence: 0.9-1.0
- User's implied preferences → confidence: 0.6-0.8
- LLM suggestions the user hasn't confirmed → confidence: 0.3-0.5
- Unresolved questions → confidence: 0.1-0.2

## Source Tracking
- Set "source" field on each frame to the turn tag (e.g., "T3")
- For nested objects, source goes on the root frame

## Source Quoting (CRITICAL)
For EACH slot (including nested ones), include a "slot_quotes" object mapping each slot key to the EXACT verbatim text from the conversation. Copy text exactly — do not paraphrase. For nested objects, use dot notation: \`"budget.total": "budget of $5000"\`.

## Relations — Use Sparingly
Relations connect SEPARATE top-level frames (rare). Do NOT create relations between a parent and its nested content. Only use when two genuinely independent topics are connected:
- causes, conditions, contrasts, follows, depends, elaborates

Output ONLY valid JSON. No markdown fences, no explanatory text.`;

const FIRST_EXTRACTION_JSON_FORMAT = `## JSON Output Format
\`\`\`json
{
  "frames": [
    {
      "id": "f_001",
      "type": "japan_trip",
      "source": "T1",
      "confidence": 0.9,
      "slots": {
        "destination": "Tokyo",
        "budget": {
          "type": "budget_breakdown",
          "slots": {
            "total": 5000,
            "daily": 50
          }
        },
        "activities": ["temple visits", "cooking classes"],
        "accommodation": {
          "type": "accommodation_preference",
          "slots": {
            "style": "ryokan",
            "requirements": ["private onsen"]
          }
        }
      },
      "slot_quotes": {
        "destination": "I want to travel to Tokyo",
        "budget.total": "budget of around $5000",
        "accommodation.style": "I'd love to stay in a traditional ryokan"
      }
    }
  ],
  "relations": []
}
\`\`\`

Key rules for nesting:
- Sub-topics use InlineFrame format: \`{ "type": "topic_name", "slots": { ... } }\`
- Arrays of objects: \`[{ "type": "city", "slots": { "name": "Tokyo" } }, ...]\`
- Simple values stay as strings/numbers: \`"destination": "Tokyo"\`
- Prefer DEEP nesting over MANY frames. 1 deeply nested frame > 8 flat frames.`;

const DELTA_JSON_FORMAT = `## JSON Output Format
\`\`\`json
{
  "changes": [
    {
      "action": "update",
      "target": "f_001",
      "slots": {
        "budget": {
          "type": "budget_breakdown",
          "slots": { "total": 7000, "daily": 70 }
        }
      },
      "slot_quotes": { "budget.total": "let's increase to $7000" }
    },
    {
      "action": "update",
      "target": "f_001",
      "slots": {
        "accommodation": {
          "type": "accommodation_preference",
          "slots": {
            "style": "ryokan",
            "location": "Asakusa",
            "requirements": ["private onsen", "garden view"]
          }
        }
      },
      "slot_quotes": { "accommodation.location": "preferably in Asakusa area" }
    }
  ],
  "new_relations": []
}
\`\`\`

Key rules for delta:
- UPDATE nested slots by providing the full nested object (replaces the sub-object)
- To add a new sub-topic, update the parent frame with a new nested slot
- To remove a sub-topic, set the slot to null
- Do NOT add new top-level frames unless it's a genuinely new topic
- Prefer deepening the existing structure over widening it`;

const DELTA_RULES = `## CRITICAL: Maintain Document Structure

You are editing an existing knowledge document. Your job is to UPDATE it, not rebuild it.

### When to UPDATE (most common)
- New information about an existing topic → update the relevant slot
- Price/date/preference changed → update that specific nested value
- New detail about a sub-topic → add nested slot to existing frame
- Example: user says "actually budget is $7000" → update \`budget.total\` in the existing frame

### When to ADD a new slot (common)
- New sub-topic within the main topic → add as nested object in existing frame
- Example: user discusses dining for the first time → add \`dining: { ... }\` to existing trip frame

### When to ADD a new frame (rare)
- Conversation shifts to a genuinely DIFFERENT topic
- Example: after discussing a trip, user asks about a work project → new frame

### When to REMOVE
- User explicitly cancels or rejects something → remove that slot or frame
- User replaces one option with another → update (don't remove + add)

### NEVER do this
- Don't create a new frame for every new piece of information
- Don't flatten nested structure into separate frames
- Don't create relations between parent and child — use nesting instead`;

// ── Main Function ──

/**
 * Build system + user prompts for frame semantic extraction.
 *
 * When `snapshot` is provided, produces delta-mode prompts that ask the LLM
 * to update the existing knowledge document.
 * When no snapshot, produces first-extraction prompts to create the document.
 */
export function buildFrameExtractionPrompt(
  input: FrameExtractionInput
): FrameExtractionPromptResult {
  const { turns, snapshot } = input;

  if (snapshot && snapshot.frames.length > 0) {
    // Delta mode — update existing document
    const nextId = calcNextFrameId(snapshot.frames);
    const snapshotYaml = serializeSnapshot(snapshot);
    const turnsText = formatTurns(turns);

    const systemPrompt = `${DOCUMENT_SYSTEM_PROMPT}

${DELTA_RULES}

${DELTA_JSON_FORMAT}`;

    const userPrompt = `## Current Knowledge Document
${snapshotYaml}

## New Conversation Turns
${turnsText}

## Instructions
Update the knowledge document with information from the new turns.
- Prefer updating existing slots over adding new frames
- Nest new sub-topics under the existing root frame
- New frame IDs start from ${nextId} (only if genuinely needed)
- Include "source" field referencing turn tags (T1, T2, etc.)
- Include "slot_quotes" for traceability`;

    return { systemPrompt, userPrompt };
  }

  // First extraction — create the document
  const turnsText = formatTurns(turns);

  const systemPrompt = `${DOCUMENT_SYSTEM_PROMPT}

${FIRST_EXTRACTION_JSON_FORMAT}`;

  const userPrompt = `## Conversation
${turnsText}

## Instructions
Create a knowledge document from this conversation.
- Identify the MAIN TOPIC and use it as the root frame type
- Nest all related information under that root frame
- Use deep nesting for sub-topics (budget, accommodation, itinerary, etc.)
- Only create multiple root frames if the conversation covers genuinely separate topics
- Include "source" field referencing turn tags (T1, T2, etc.)
- Include "slot_quotes" for traceability`;

  return { systemPrompt, userPrompt };
}
