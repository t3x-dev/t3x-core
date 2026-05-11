/**
 * L2 — capability table for chat-time toggles (web_search / thinking).
 *
 * Each provider's chat path implements these differently:
 *
 *   provider     thinking                      web_search
 *   ────────     ────────────────────────      ─────────────────────────────
 *   anthropic    `thinking` block + budget     `web_search` tool (streaming)
 *   openai       `reasoning_effort: 'medium'`  Responses API `web_search`
 *   google       `thinkingConfig.thinkingBudget`  `googleSearch` tool
 *
 * The shape behind each capability differs, but from the user's perspective
 * the toggle is the same. This table is the single source of truth that
 * both the UI (to gate buttons + tooltips) and the server (to validate
 * requests) consult. Add a provider here once and every consumer follows.
 *
 * Pure. No React, no fetch. Safe to import from server code through the
 * shared `domain/` layer convention.
 */

export type ProviderCapabilityId = 'anthropic' | 'openai' | 'google';
export type ChatCapability = 'thinking' | 'web_search';

interface ProviderCapabilities {
  thinking: boolean;
  web_search: boolean;
}

const PROVIDER_CAPABILITIES: Record<ProviderCapabilityId, ProviderCapabilities> = {
  anthropic: { thinking: true, web_search: true },
  openai: { thinking: true, web_search: true },
  google: { thinking: true, web_search: true },
};

/**
 * Map any of the runtime provider id aliases to the canonical capability id.
 *
 * The chat surface ships at least three different ids per provider:
 *   anthropic ← `anthropic` | `claude`
 *   openai    ← `openai`    | `gpt`
 *   google    ← `google`    | `google-ai` | `gemini`
 *
 * `/v1/chat/providers` emits `claude / openai / google`, the core registry
 * uses `anthropic / openai / google-ai`, and the local settings UI uses
 * `anthropic / openai / google`. All resolve to the same capability set.
 */
const PROVIDER_ALIASES: Record<string, ProviderCapabilityId> = {
  anthropic: 'anthropic',
  claude: 'anthropic',
  openai: 'openai',
  gpt: 'openai',
  google: 'google',
  'google-ai': 'google',
  gemini: 'google',
};

export function toCapabilityId(providerId: string): ProviderCapabilityId | null {
  return PROVIDER_ALIASES[providerId.toLowerCase()] ?? null;
}

export function providerSupports(providerId: string, capability: ChatCapability): boolean {
  const id = toCapabilityId(providerId);
  if (!id) return false;
  return PROVIDER_CAPABILITIES[id][capability];
}

/**
 * Human-readable label for tooltip copy: "Web search requires Anthropic or Google".
 */
export function listProvidersSupporting(capability: ChatCapability): ProviderCapabilityId[] {
  return (Object.keys(PROVIDER_CAPABILITIES) as ProviderCapabilityId[]).filter(
    (id) => PROVIDER_CAPABILITIES[id][capability]
  );
}
