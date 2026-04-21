/**
 * Provider Registry Singleton
 *
 * Creates and configures the global ProviderRegistry at API startup.
 * Registers all built-in providers and loads config from DB.
 */

import {
  createDefaultProviderRegistry,
  type EmbeddingProvider,
  type GenerateOptions,
  type GenerateResult,
  generateLeafOutput,
  type LLMProvider,
  type ProviderRegistry,
  type RegistryConfig,
} from '@t3x-dev/core';
import { findProjectById, getGlobalSetting, setGlobalSetting } from '@t3x-dev/storage';
import { getDB } from './db';
import { loadResolvedProviderConfig } from './provider-config';

// ═══════════════════════════════════════════════════════════════════════════
// Singleton
// ═══════════════════════════════════════════════════════════════════════════

let registry: ProviderRegistry | null = null;
let registryInit: Promise<ProviderRegistry> | null = null;

const PROVIDER_CONFIG_KEY = 'provider_registry';

/**
 * Get or create the global provider registry.
 * On first call, registers all built-in providers and loads saved config.
 *
 * Uses Promise caching to prevent concurrent initializations:
 * the Promise itself is cached, so all concurrent callers await the SAME
 * initialization — no race condition, no duplicate work.
 */
export async function getProviderRegistry(): Promise<ProviderRegistry> {
  if (registry) return registry;

  // Cache the Promise itself — all concurrent callers share ONE init
  if (!registryInit) {
    registryInit = initRegistry().then((reg) => {
      registry = reg;
      return reg;
    });
  }

  return registryInit;
}

async function initRegistry(): Promise<ProviderRegistry> {
  const reg = createDefaultProviderRegistry({
    configOverrides: await loadResolvedProviderConfig(),
  });

  // Load saved config from DB (overrides auto-config)
  try {
    const db = await getDB();
    const savedConfig = await getGlobalSetting<RegistryConfig>(db, PROVIDER_CONFIG_KEY);
    if (savedConfig) {
      reg.importConfig(savedConfig);
    }
  } catch {
    // DB not available yet or config not saved — use auto-config
  }

  return reg;
}

/**
 * Get the generation provider IDs for a project, falling back to global config.
 * If the project has `provider_config` with a 'generation' role override,
 * those provider IDs are returned; otherwise the global assignment is used.
 */
export async function getGenerationProviderIds(projectId?: string): Promise<string[]> {
  const reg = await getProviderRegistry();
  const globalIds = reg.getProviderIdsForRole('generation');

  if (!projectId) return globalIds;

  try {
    const db = await getDB();
    const project = await findProjectById(db, projectId);
    if (project?.providerConfig) {
      const config = JSON.parse(project.providerConfig) as RegistryConfig;
      const genRole = config?.roles?.find((r) => r.role === 'generation');
      if (genRole && genRole.providerIds.length > 0) {
        return genRole.providerIds;
      }
    }
  } catch {
    // Fall through to global
  }

  return globalIds;
}

/**
 * Save the current registry config to the database.
 */
export async function saveRegistryConfig(): Promise<void> {
  if (!registry) return;
  const db = await getDB();
  await setGlobalSetting(db, PROVIDER_CONFIG_KEY, registry.exportConfig());
}

/**
 * Refresh runtime provider config overrides from storage.
 */
export async function refreshProviderRegistryConfig(): Promise<void> {
  const reg = await getProviderRegistry();
  reg.setConfigOverrides(await loadResolvedProviderConfig());
}

/**
 * Reset the singleton (for testing).
 */
export function resetProviderRegistry(): void {
  registry = null;
  registryInit = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Convenience Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the LLM provider for generation, with fallback to legacy behavior.
 */
export async function getLLMProvider(): Promise<LLMProvider | null> {
  const reg = await getProviderRegistry();
  return reg.getForRole<LLMProvider>('generation');
}

/**
 * Get the embedding provider, with fallback to legacy behavior.
 */
export async function getEmbeddingProvider(): Promise<EmbeddingProvider | null> {
  const reg = await getProviderRegistry();
  return reg.getForRole<EmbeddingProvider>('embedding');
}

/**
 * Generate leaf output with automatic provider fallback.
 * Tries each provider assigned to the 'generation' role in priority order.
 * On retryable errors (RATE_LIMIT, OVERLOADED, NETWORK_ERROR), moves to the next provider.
 */
export async function generateWithFallback(
  options: Omit<GenerateOptions, 'provider'>
): Promise<GenerateResult> {
  const reg = await getProviderRegistry();
  return reg.tryWithFallback<LLMProvider, GenerateResult>('generation', (provider) =>
    generateLeafOutput({ ...options, provider })
  );
}
