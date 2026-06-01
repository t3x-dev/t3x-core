/**
 * Provider types — shared by infrastructure (HTTP adapters) and
 * components (settings panel UI). Lives in `@/types` so components
 * can depend on it without violating the v2 layer rule that forbids
 * `components/ -> infrastructure/`.
 *
 * Pure types + provider identity helpers with no I/O. The actual API
 * client functions and DTOs that wrap a fetch call still live in
 * `@/infrastructure`.
 */

import {
  GENERATION_RUNTIME_PROVIDER_IDS,
  type LocalGenerationProviderId,
  normalizeLocalProviderId,
} from '@t3x-dev/core';

// ────────────────────────────────────────────────────────────────────────────
// LLM provider catalog (ids returned by the server)
// ────────────────────────────────────────────────────────────────────────────

export interface LLMModelInfo {
  id: string;
  label: string;
  capabilities: string[];
  max_output_tokens: number;
}

export interface LLMProviderInfo {
  name: string;
  label: string;
  available: boolean;
  models: LLMModelInfo[];
}

export interface LLMModelsResponse {
  generation_provider_order: string[];
  default_provider: string | null;
  providers: LLMProviderInfo[];
}

// ────────────────────────────────────────────────────────────────────────────
// Local provider settings (keys stored on the user's machine)
// ────────────────────────────────────────────────────────────────────────────

export type LocalProviderId = LocalGenerationProviderId;
export type LocalProviderAlias = 'claude' | 'gemini' | 'google-ai' | 'gpt';
export type LocalProviderClientId = LocalProviderId | LocalProviderAlias;
export type LocalProviderTestStatus = 'ok' | 'error';

export type LocalProviderKeySource = 'env' | 'file' | 'none';

export const GENERATION_PROVIDER_ORDER = [...GENERATION_RUNTIME_PROVIDER_IDS] as const;

export interface LocalProviderStatus {
  provider: LocalProviderId;
  configured: boolean;
  default_model: string | null;
  last_test_status: LocalProviderTestStatus | null;
  last_tested_at: string | null;
  last_test_error: string | null;
  /** Which layer produced the currently-active key: 'env' > 'file' > 'none'. */
  api_key_source: LocalProviderKeySource;
  /** Last-four tail of the active key, e.g. `…JnYA`; null when unconfigured. */
  api_key_preview: string | null;
  /** True when an env var is masking a stored file-based credential. */
  env_overrides_stored: boolean;
}

export interface LocalProviderCredentialInput {
  api_key: string;
  default_model?: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Server-side provider registry (system-wide config, not user keys)
// ────────────────────────────────────────────────────────────────────────────

export interface ProviderInfo {
  id: string;
  name: string;
  role: string;
  configured: boolean;
  roles: string[];
  required_env_keys: string[];
  default_model: string | null;
  available_models: string[] | null;
}

export interface RoleAssignment {
  role: string;
  provider_ids: string[];
}

export interface TestConnectionResult {
  ok: boolean;
  error?: string;
  latency_ms?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ────────────────────────────────────────────────────────────────────────────

/** Normalise a (possibly-aliased) provider id to its canonical form. */
export function toLocalProviderId(providerId: string): LocalProviderId | null {
  return normalizeLocalProviderId(providerId);
}
