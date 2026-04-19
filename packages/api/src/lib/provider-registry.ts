/**
 * Provider Registry Singleton
 *
 * Creates and configures the global ProviderRegistry at API startup.
 * Registers all built-in providers and loads config from DB.
 */

import {
  createClaudeProvider,
  createDeepSeekProvider,
  createGeminiProvider,
  createGoogleAIEmbeddingProvider,
  createOllamaEmbeddingProvider,
  createOllamaProvider,
  createOpenAIEmbeddingProvider,
  createOpenAIProvider,
  createProviderRegistry,
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
  const reg = createProviderRegistry();

  // Register all built-in providers
  registerBuiltinProviders(reg);

  // Load local credential overrides first so runtime config uses stored secrets.
  reg.setConfigOverrides(await loadResolvedProviderConfig());

  // Auto-configure defaults from env and local overrides.
  reg.autoConfigureFromEnv();

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
// Built-in Provider Definitions
// ═══════════════════════════════════════════════════════════════════════════

function registerBuiltinProviders(reg: ProviderRegistry): void {
  // ─── LLM Providers (generation role) ───────────────────────────────

  reg.register({
    id: 'anthropic',
    name: 'Anthropic Claude',
    role: 'generation',
    requiredEnvKeys: ['ANTHROPIC_API_KEY'],
    modelConfigKey: 'ANTHROPIC_MODEL',
    defaultModel: 'claude-sonnet-4-6',
    availableModels: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6'],
    factory: (config, context) =>
      createClaudeProvider({
        apiKey: config.ANTHROPIC_API_KEY!,
        model: context.defaultModel,
        baseUrl: process.env.ANTHROPIC_BASE_URL,
      }),
  });

  reg.register({
    id: 'openai',
    name: 'OpenAI',
    role: 'generation',
    requiredEnvKeys: ['OPENAI_API_KEY'],
    modelConfigKey: 'OPENAI_MODEL',
    defaultModel: 'gpt-5.4-mini',
    availableModels: ['gpt-5.4-nano', 'gpt-5.4-mini', 'gpt-5.4'],
    factory: (config, context) =>
      createOpenAIProvider({
        apiKey: config.OPENAI_API_KEY!,
        model: context.defaultModel,
        baseUrl: process.env.OPENAI_BASE_URL,
      }),
  });

  reg.register({
    id: 'deepseek',
    name: 'DeepSeek',
    role: 'generation',
    requiredEnvKeys: ['DEEPSEEK_API_KEY'],
    defaultModel: 'deepseek-chat',
    availableModels: ['deepseek-chat', 'deepseek-reasoner'],
    factory: (config) =>
      createDeepSeekProvider({
        apiKey: config.DEEPSEEK_API_KEY!,
        baseUrl: process.env.DEEPSEEK_BASE_URL,
      }),
  });

  reg.register({
    id: 'google-ai',
    name: 'Google AI (Gemini)',
    role: 'generation',
    requiredEnvKeys: ['GOOGLE_AI_STUDIO_KEY'],
    modelConfigKey: 'GOOGLE_AI_MODEL',
    defaultModel: 'gemini-3-flash-preview',
    availableModels: [
      'gemini-3.1-flash-lite-preview',
      'gemini-3-flash-preview',
      'gemini-3-pro-preview',
    ],
    factory: (config, context) =>
      createGeminiProvider({
        apiKey: config.GOOGLE_AI_STUDIO_KEY!,
        model: context.defaultModel,
      }),
  });

  reg.register({
    id: 'ollama',
    name: 'Ollama (Local)',
    role: 'generation',
    requiredEnvKeys: [], // No key needed — local server
    defaultModel: 'llama3.1',
    availableModels: ['llama3.1', 'llama3.2', 'mistral', 'mixtral', 'qwen2.5', 'deepseek-r1'],
    factory: () =>
      createOllamaProvider({
        baseUrl: process.env.OLLAMA_BASE_URL,
      }),
  });

  // ─── LLM Providers (merge role) ────────────────────────────────────

  reg.register({
    id: 'anthropic-merge',
    name: 'Anthropic Claude (Merge)',
    role: 'merge',
    requiredEnvKeys: ['ANTHROPIC_API_KEY'],
    modelConfigKey: 'ANTHROPIC_MODEL',
    defaultModel: 'claude-sonnet-4-6',
    factory: (config, context) =>
      createClaudeProvider({
        apiKey: config.ANTHROPIC_API_KEY!,
        model: context.defaultModel,
        baseUrl: process.env.ANTHROPIC_BASE_URL,
      }),
  });

  // ─── Embedding Providers ───────────────────────────────────────────

  reg.register({
    id: 'google-ai-embedding',
    name: 'Google AI Embedding',
    role: 'embedding',
    requiredEnvKeys: ['GOOGLE_AI_STUDIO_KEY'],
    defaultModel: 'gemini-embedding-001',
    availableModels: ['gemini-embedding-001', 'text-embedding-004'],
    factory: (config) =>
      createGoogleAIEmbeddingProvider({
        apiKey: config.GOOGLE_AI_STUDIO_KEY!,
      }),
  });

  reg.register({
    id: 'openai-embedding',
    name: 'OpenAI Embedding',
    role: 'embedding',
    requiredEnvKeys: ['OPENAI_API_KEY'],
    defaultModel: 'text-embedding-3-small',
    availableModels: ['text-embedding-3-small', 'text-embedding-3-large'],
    factory: (config) =>
      createOpenAIEmbeddingProvider({
        apiKey: config.OPENAI_API_KEY!,
      }),
  });

  reg.register({
    id: 'ollama-embedding',
    name: 'Ollama Embedding (Local)',
    role: 'embedding',
    requiredEnvKeys: [],
    defaultModel: 'nomic-embed-text',
    availableModels: ['nomic-embed-text', 'mxbai-embed-large', 'all-minilm'],
    factory: () =>
      createOllamaEmbeddingProvider({
        baseUrl: process.env.OLLAMA_BASE_URL,
      }),
  });
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
