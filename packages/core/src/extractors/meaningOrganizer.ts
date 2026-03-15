/**
 * Meaning Organizer Agent
 *
 * Step 2 of the extraction pipeline.
 * Takes flat extracted frames and organizes them into ONE deeply nested
 * meaning document — like a well-structured summary YAML.
 *
 * Input:  flat frames from Step 1 (FrameExtractor)
 * Output: reorganized SemanticContent with 1-3 root frames, deep nesting
 *
 * Source traceability: maps each slot back to the original frame/slot source.
 */

import type { LLMProvider } from '../llm/types';
import type { Frame, SemanticContent, SlotValue } from '../semantic/types';

// ── Types ──

export interface OrganizeResult {
  ok: true;
  content: SemanticContent;
  usage: { inputTokens: number; outputTokens: number };
}

export interface OrganizeError {
  ok: false;
  error: string;
  /** Fallback: return original flat frames if organization fails */
  fallback: SemanticContent;
  usage: { inputTokens: number; outputTokens: number };
}

export type MeaningOrganizerResult = OrganizeResult | OrganizeError;

// ── Prompt ──

const ORGANIZER_SYSTEM_PROMPT = `You are a meaning document organizer. You receive a list of flat semantic frames extracted from a conversation. Your job is to REORGANIZE them into ONE well-structured, deeply nested YAML-like document.

## Your Job
You receive flat frames like:
  f_001 travel_plan: { destination: "Tokyo" }
  f_002 budget_constraint: { amount: 5000, currency: "USD" }
  f_003 accommodation_preference: { type: "ryokan", location: "Asakusa" }
  f_004 dining_preference: { cuisine: "ramen" }

You produce ONE nested document:
  f_001 japan_trip: {
    destination: "Tokyo",
    budget: { total: 5000, currency: "USD" },
    accommodation: { type: "ryokan", location: "Asakusa" },
    dining: { cuisine: "ramen" }
  }

## Rules

1. **ONE root frame** — identify the main topic and make it the root. All other frames become nested slots.
2. **Maximum 2-3 root frames** — only if the conversation covers genuinely unrelated topics.
3. **Nest by meaning** — related concepts become nested objects under the root.
4. **Preserve ALL information** — every slot value from the input must appear in the output. Do not drop data.
5. **Preserve source references** — keep the "source" field from the most specific contributing frame.
6. **Merge similar frames** — if two frames describe the same topic (e.g., "budget_constraint" and "financial_plan"), merge their slots into one nested object.
7. **Name the root well** — the root frame type should describe the conversation topic (e.g., "japan_trip", "product_roadmap", "team_hiring_plan"). It should be specific, not generic like "conversation_summary".
8. **Keep confidence** — use the LOWEST confidence from merged frames (conservative).

## Nesting Format

Use this JSON structure for nested values:
- Simple values: \`"key": "value"\` or \`"key": 123\`
- Nested objects: \`"key": { "type": "sub_topic", "slots": { "k1": "v1" } }\`
- Arrays: \`"key": ["item1", "item2"]\`
- Arrays of objects: \`"key": [{ "type": "item", "slots": { "name": "..." } }]\`

## Topic Evolution

The root topic name should reflect the conversation's CURRENT focus:
- Early vague discussion → broad name (e.g., "travel_planning")
- As intent crystallizes → specific name (e.g., "japan_trip_plan")
- Choose the most specific accurate name for where the conversation is NOW.

## JSON Output Format
\`\`\`json
{
  "frames": [
    {
      "id": "f_001",
      "type": "topic_name",
      "source": "T1",
      "confidence": 0.9,
      "slots": {
        "destination": "Tokyo",
        "budget": { "type": "budget_detail", "slots": { "total": 5000, "currency": "USD" } },
        "accommodation": { "type": "accommodation_preference", "slots": { "style": "ryokan", "location": "Asakusa" } }
      }
    }
  ],
  "relations": []
}
\`\`\`
Output ONLY valid JSON. No markdown fences, no explanatory text.`;

// ── Helpers ──

function serializeFramesForPrompt(content: SemanticContent): string {
  const lines: string[] = [];
  for (const frame of content.frames) {
    const slotsStr = Object.entries(frame.slots)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join(', ');
    const meta = [
      frame.source ? `source: ${frame.source}` : '',
      frame.confidence !== undefined ? `confidence: ${frame.confidence}` : '',
    ]
      .filter(Boolean)
      .join(', ');
    lines.push(`  ${frame.id} ${frame.type}: { ${slotsStr} }${meta ? ` [${meta}]` : ''}`);
  }

  if (content.relations.length > 0) {
    lines.push('');
    lines.push('Relations:');
    for (const rel of content.relations) {
      lines.push(`  ${rel.from} → ${rel.to} (${rel.type})`);
    }
  }

  return lines.join('\n');
}

// ── Class ──

export class MeaningOrganizer {
  constructor(private readonly provider: LLMProvider) {}

  async organize(
    flatContent: SemanticContent,
    conversationContext?: string
  ): Promise<MeaningOrganizerResult> {
    const usage = { inputTokens: 0, outputTokens: 0 };

    // Skip if already organized (1-2 frames with deep nesting)
    if (flatContent.frames.length <= 2) {
      return { ok: true, content: flatContent, usage };
    }

    const framesText = serializeFramesForPrompt(flatContent);

    const userPrompt = `## Flat Frames (from extraction)
${framesText}

## Instructions
Reorganize these ${flatContent.frames.length} flat frames into ONE deeply nested meaning document.
- Identify the main topic and use it as the root frame type
- Nest all related frames as sub-objects under the root
- Preserve ALL slot values — do not drop any data
- Keep source references from the original frames
${conversationContext ? `\n## Conversation Context\n${conversationContext}` : ''}`;

    try {
      const result = await this.provider.generate(
        `${ORGANIZER_SYSTEM_PROMPT}\n\n---\n\n${userPrompt}`,
        { temperature: 0.1, maxTokens: 4096 }
      );

      usage.inputTokens = result.usage.inputTokens;
      usage.outputTokens = result.usage.outputTokens;

      // Parse JSON output
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { ok: false, error: 'No JSON found in organizer output', fallback: flatContent, usage };
      }

      const parsed = JSON.parse(jsonMatch[0]) as { frames?: Frame[]; relations?: unknown[] };
      if (!parsed.frames || !Array.isArray(parsed.frames) || parsed.frames.length === 0) {
        return { ok: false, error: 'Invalid organizer output: no frames', fallback: flatContent, usage };
      }

      const organized: SemanticContent = {
        frames: parsed.frames,
        relations: [], // Relations are expressed via nesting now
      };

      return { ok: true, content: organized, usage };
    } catch (err) {
      return {
        ok: false,
        error: `Organizer failed: ${err instanceof Error ? err.message : String(err)}`,
        fallback: flatContent,
        usage,
      };
    }
  }
}
