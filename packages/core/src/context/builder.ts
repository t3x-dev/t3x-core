/**
 * Context Builder for T3X
 *
 * Constructs LLM memory from commits + pins.
 * This is the core of the new memory system.
 *
 * @see docs/specification/semantic-layer-architecture.md
 * @see docs/specification/memory-pin-system-design.md
 */

import { serializeForPrompt } from '../semantic/serialize';
import type { SemanticContent } from '../semantic/types';
import type {
  BuiltContext,
  ContextSource,
  ConversationContext,
  Leaf,
  Material,
  Pin,
} from '../types';

const MAX_MATERIAL_CONTEXT_CHARS = 20_000;

// ═══════════════════════════════════════════════════════════════════════════
// Input Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Conversation data for context building.
 */
export interface ConversationData {
  id: string;
  title: string;
  turns: Array<{ role: string; content: string }>;
}

/**
 * Input for building conversation context.
 */
export interface ContextBuildInput {
  /** Current knowledge (HEAD) - provides base knowledge as semantic frames */
  knowledge?: SemanticContent;

  /** All project pins */
  projectPins: Pin[];

  /** Conversation's context config (undefined/null = no pins; selected_pin_ids null = use all pins) */
  contextConfig?: ConversationContext | null;

  /** Loaded conversations (for pinned conversation content) */
  conversations: Map<string, ConversationData>;

  /** Loaded leaves (for pinned leaf content) */
  leaves: Map<string, Leaf>;

  /** Loaded raw imported materials (for pinned import content) */
  materials?: Map<string, Material>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build context for conversation LLM.
 *
 * Context = Base (commit nodes) + Pinned items
 *
 * @param input - The context build input
 * @returns Built context with text, token estimate, and sources
 */
export function buildConversationContext(input: ContextBuildInput): BuiltContext {
  const sources: ContextSource[] = [];
  let text = '';

  // ─────────────────────────────────────────────────────────────────────────
  // BASE: Current state frames (always included, like git HEAD)
  // ─────────────────────────────────────────────────────────────────────────
  if (input.knowledge) {
    text += '## Current Knowledge\n\n';
    text += serializeForPrompt(input.knowledge);
    text += '\n\n';
    sources.push({ type: 'commit', id: 'knowledge', title: 'Current knowledge' });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PLUS: Pinned items (filtered by context config)
  // ─────────────────────────────────────────────────────────────────────────
  const activePins = filterActivePins(input.projectPins, input.contextConfig);

  // Pinned conversations
  const convPins = activePins.filter((p) => p.type === 'conversation');
  if (convPins.length > 0) {
    let convText = '';
    const convSources: ContextSource[] = [];

    for (const pin of convPins) {
      const conv = input.conversations.get(pin.ref_id);
      if (!conv) continue;

      convText += `### ${conv.title}\n\n`;
      for (const turn of conv.turns) {
        convText += `**${turn.role}**: ${turn.content}\n\n`;
      }

      convSources.push({
        type: 'conversation',
        id: conv.id,
        title: conv.title,
      });
    }

    // Only add section if we have valid conversations
    if (convSources.length > 0) {
      text += '## Recent Discussions\n\n';
      text += convText;
      sources.push(...convSources);
    }
  }

  // Pinned leaves (output + lessons)
  const leafPins = activePins.filter((p) => p.type === 'leaf');
  if (leafPins.length > 0) {
    let leafText = '';
    const leafSources: ContextSource[] = [];

    for (const pin of leafPins) {
      const leaf = input.leaves.get(pin.ref_id);
      if (!leaf) continue;

      leafText += `### ${leaf.type}: ${leaf.title ?? 'Untitled'}\n\n`;
      if (leaf.output) {
        // Truncate long outputs to avoid context overflow
        const truncatedOutput =
          leaf.output.length > 200 ? `${leaf.output.substring(0, 200)}...` : leaf.output;
        leafText += `Output: ${truncatedOutput}\n\n`;
      }

      // Include selected assertion lessons
      // Prefer runner_assertions (richer lessons from evaluation), fall back to assertions
      const selectedIds = pin.selected_assertion_ids;
      const assertions = leaf.runner_assertions ?? leaf.assertions ?? [];
      for (const assertion of assertions) {
        // If selectedIds is defined, only include selected assertions
        if (selectedIds && !selectedIds.includes(assertion.id)) continue;
        if (assertion.lesson) {
          leafText += `• Lesson: ${assertion.lesson}\n`;
        }
      }
      leafText += '\n';

      leafSources.push({
        type: 'leaf',
        id: leaf.id,
        title: leaf.title,
      });
    }

    // Only add section if we have valid leaves
    if (leafSources.length > 0) {
      text += '## Previous Outputs & Lessons\n\n';
      text += leafText;
      sources.push(...leafSources);
    }
  }

  // Pinned import materials (raw source evidence)
  const importPins = activePins.filter((p) => p.type === 'import');
  if (importPins.length > 0 && input.materials) {
    let materialText = '';
    const materialSources: ContextSource[] = [];

    for (const pin of importPins) {
      const material = input.materials.get(pin.ref_id);
      if (!material) continue;

      const title = material.title ?? material.filename ?? material.id;
      materialText += `### ${title}\n\n`;
      materialText += `${truncateForContext(material.content_text, MAX_MATERIAL_CONTEXT_CHARS)}\n\n`;

      materialSources.push({
        type: 'import',
        id: material.id,
        title,
      });
    }

    if (materialSources.length > 0) {
      text += '## Source Materials\n\n';
      text += materialText;
      sources.push(...materialSources);
    }
  }

  return {
    text,
    token_estimate: estimateTokens(text),
    sources,
  };
}

/**
 * Build context for leaf generation.
 *
 * Returns state frames - constraints are in leaf itself.
 *
 * @param knowledge - The state content to build context from
 * @returns Built context with state frames
 */
export function buildLeafContext(knowledge: SemanticContent): BuiltContext {
  let text = '## Knowledge\n\n';
  text += serializeForPrompt(knowledge);

  return {
    text,
    token_estimate: estimateTokens(text),
    sources: [
      {
        type: 'commit',
        id: 'knowledge',
        title: 'Current knowledge',
      },
    ],
  };
}

/**
 * Build memory context from pins only (without a current commit).
 *
 * Useful for building context when starting fresh or for specific pin-based queries.
 *
 * @param input - Partial context build input (no currentCommit required)
 * @returns Built context with pinned items only
 */
export function buildMemoryFromPins(input: Omit<ContextBuildInput, 'knowledge'>): BuiltContext {
  return buildConversationContext({
    ...input,
    knowledge: undefined,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Filter pins based on conversation context configuration.
 *
 * @param pins - All project pins
 * @param config - Conversation context config (missing = no pins; selected_pin_ids null = use all)
 * @returns Filtered list of active pins
 */
export function filterActivePins(pins: Pin[], config?: ConversationContext | null): Pin[] {
  // Missing config = no pins. Users opt materials into a conversation explicitly.
  if (!config) {
    return [];
  }

  // Explicit null selected_pin_ids = use all project pins.
  if (config.selected_pin_ids === null) {
    return pins;
  }

  // Empty array = no pins
  if (config.selected_pin_ids.length === 0) {
    return [];
  }

  // Filter to selected pins
  const selectedSet = new Set(config.selected_pin_ids);
  return pins.filter((p) => selectedSet.has(p.id));
}

/**
 * Estimate token count for a given text.
 *
 * Uses a simple character-based estimation (~4 characters per token).
 * This is a rough approximation suitable for context size planning.
 *
 * @param text - The text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  // Simple estimation: ~4 characters per token
  // This is a common approximation for English text
  return Math.ceil(text.length / 4);
}

function truncateForContext(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}
