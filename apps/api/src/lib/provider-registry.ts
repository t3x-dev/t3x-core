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
  createGoogleCloudNLPProvider,
  createLLMExtractor,
  createOllamaEmbeddingProvider,
  createOllamaProvider,
  createOpenAIEmbeddingProvider,
  createOpenAIProvider,
  createProviderRegistry,
  type EmbeddingProvider,
  type GenerateOptions,
  type GenerateResult,
  generateLeafOutput,
  type LLMExtractionOptions,
  type LLMExtractionResult,
  type LLMProvider,
  type NLPProvider,
  type ProviderRegistry,
  type RegistryConfig,
  type TurnInput,
} from '@t3x-dev/core';
import { findProjectById, getGlobalSetting, setGlobalSetting } from '@t3x-dev/storage';
import { getDB } from './db';

// ═══════════════════════════════════════════════════════════════════════════
// Singleton
// ═══════════════════════════════════════════════════════════════════════════

let registry: ProviderRegistry | null = null;
let registryInit: Promise<ProviderRegistry> | null = null;

const PROVIDER_CONFIG_KEY = 'provider_registry';

/**
 * Get or create the global provider registry.
 * On first call, registers all built-in providers and loads saved config.
 * Uses a Promise guard to prevent concurrent initializations.
 */
export async function getProviderRegistry(): Promise<ProviderRegistry> {
  if (registry) return registry;
  if (registryInit) return registryInit;

  registryInit = initRegistry();
  registry = await registryInit;
  registryInit = null;
  return registry;
}

async function initRegistry(): Promise<ProviderRegistry> {
  const reg = createProviderRegistry();

  // Register all built-in providers
  registerBuiltinProviders(reg);

  // Auto-configure defaults from env
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
    defaultModel: 'claude-sonnet-4-20250514',
    availableModels: [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-haiku-4-5-20251001',
    ],
    factory: (config) =>
      createClaudeProvider({
        apiKey: config.ANTHROPIC_API_KEY!,
        baseUrl: process.env.ANTHROPIC_BASE_URL,
      }),
  });

  reg.register({
    id: 'openai',
    name: 'OpenAI',
    role: 'generation',
    requiredEnvKeys: ['OPENAI_API_KEY'],
    defaultModel: 'gpt-4o',
    availableModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini'],
    factory: (config) =>
      createOpenAIProvider({
        apiKey: config.OPENAI_API_KEY!,
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
    defaultModel: 'gemini-2.0-flash',
    availableModels: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    factory: (config) =>
      createGeminiProvider({
        apiKey: config.GOOGLE_AI_STUDIO_KEY!,
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
    defaultModel: 'claude-sonnet-4-20250514',
    factory: (config) =>
      createClaudeProvider({
        apiKey: config.ANTHROPIC_API_KEY!,
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

  // ─── NLP Providers (extraction role) ───────────────────────────────

  reg.register({
    id: 'google-cloud-nlp',
    name: 'Google Cloud NLP',
    role: 'extraction',
    requiredEnvKeys: ['GOOGLE_CLOUD_NLP_KEY'],
    factory: (config) => createGoogleCloudNLPProvider(config.GOOGLE_CLOUD_NLP_KEY!),
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
 * Get the NLP provider for extraction, with fallback to legacy behavior.
 */
export async function getNLPFromRegistry(): Promise<NLPProvider | null> {
  const reg = await getProviderRegistry();
  return reg.getForRole<NLPProvider>('extraction');
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

/**
 * Extract sentences from turns with automatic provider fallback.
 * Same fallback pattern as generateWithFallback.
 */
export async function extractWithFallback(
  turns: TurnInput[],
  options?: LLMExtractionOptions
): Promise<LLMExtractionResult> {
  const reg = await getProviderRegistry();
  return reg.tryWithFallback<LLMProvider, LLMExtractionResult>('generation', (provider) =>
    createLLMExtractor(provider).extract(turns, options)
  );
}
