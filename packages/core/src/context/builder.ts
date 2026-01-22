/**
 * Context Builder for T3X V4 Architecture
 *
 * Constructs LLM memory from commits + pins.
 * This is the core of the new memory system.
 *
 * @see docs/specification/semantic-layer-architecture.md
 * @see docs/specification/memory-pin-system-design.md
 */

import type {
  BuiltContext,
  CommitV4,
  ContextSource,
  ConversationContext,
  Leaf,
  Pin,
} from '../types/v4';

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
  /** Current commit (HEAD) - provides base knowledge */
  currentCommit?: CommitV4;

  /** All project pins */
  projectPins: Pin[];

  /** Conversation's context config (null = use all pins) */
  contextConfig?: ConversationContext | null;

  /** Loaded conversations (for pinned conversation content) */
  conversations: Map<string, ConversationData>;

  /** Loaded leaves (for pinned leaf content) */
  leaves: Map<string, Leaf>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build context for conversation LLM.
 *
 * Context = Base (commit sentences) + Pinned items
 *
 * @param input - The context build input
 * @returns Built context with text, token estimate, and sources
 */
export function buildConversationContext(input: ContextBuildInput): BuiltContext {
  const sources: ContextSource[] = [];
  let text = '';

  // ─────────────────────────────────────────────────────────────────────────
  // BASE: Current commit sentences (always included, like git HEAD)
  // ─────────────────────────────────────────────────────────────────────────
  if (input.currentCommit) {
    text += '## Current Knowledge\n\n';
    for (const sentence of input.currentCommit.content.sentences) {
      text += `• ${sentence.text}\n`;
    }
    text += '\n';

    sources.push({
      type: 'commit',
      id: input.currentCommit.hash,
      title: input.currentCommit.message,
    });
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
          leaf.output.length > 200
            ? `${leaf.output.substring(0, 200)}...`
            : leaf.output;
        leafText += `Output: ${truncatedOutput}\n\n`;
      }

      // Include selected assertion lessons
      const selectedIds = pin.selected_assertion_ids;
      const assertions = leaf.assertions ?? [];
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

  return {
    text,
    token_estimate: estimateTokens(text),
    sources,
  };
}

/**
 * Build context for leaf generation.
 *
 * Returns commit sentences (knowledge) - constraints are in leaf itself.
 *
 * @param commit - The commit to build context from
 * @returns Built context with knowledge sentences
 */
export function buildLeafContext(commit: CommitV4): BuiltContext {
  let text = '## Knowledge\n\n';

  for (const sentence of commit.content.sentences) {
    text += `• ${sentence.text}\n`;
  }

  return {
    text,
    token_estimate: estimateTokens(text),
    sources: [
      {
        type: 'commit',
        id: commit.hash,
        title: commit.message,
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
export function buildMemoryFromPins(
  input: Omit<ContextBuildInput, 'currentCommit'>
): BuiltContext {
  return buildConversationContext({
    ...input,
    currentCommit: undefined,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Filter pins based on conversation context configuration.
 *
 * @param pins - All project pins
 * @param config - Conversation context config (null = use all)
 * @returns Filtered list of active pins
 */
export function filterActivePins(
  pins: Pin[],
  config?: ConversationContext | null
): Pin[] {
  // null or undefined config = use all pins
  if (!config || config.selected_pin_ids === null) {
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
