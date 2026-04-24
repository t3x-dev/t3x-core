import {
  createGoogleAIEmbeddingProvider,
  createOllamaEmbeddingProvider,
  createOpenAIEmbeddingProvider,
} from './embedding';
import { createClaudeProvider, createGeminiProvider, createOpenAIProvider } from './llm';
import { createProviderRegistry, type ProviderRegistry, type ResolvedConfig } from './registry';

type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'google-ai'
  | 'google-ai-embedding'
  | 'openai-embedding'
  | 'ollama-embedding';

interface ProviderOverride {
  defaultModel?: string;
  availableModels?: string[];
}

export interface DefaultProviderRegistryOptions {
  autoConfigureFromEnv?: boolean;
  configOverrides?: ResolvedConfig;
  providerOverrides?: Partial<Record<ProviderId, ProviderOverride>>;
}

function applyOverride(
  id: ProviderId,
  config: {
    defaultModel: string;
    availableModels?: string[];
  },
  overrides?: Partial<Record<ProviderId, ProviderOverride>>
) {
  const override = overrides?.[id];
  return {
    defaultModel: override?.defaultModel ?? config.defaultModel,
    availableModels: override?.availableModels ?? config.availableModels,
  };
}

export function registerDefaultProviders(
  reg: ProviderRegistry,
  options: Pick<DefaultProviderRegistryOptions, 'providerOverrides'> = {}
): void {
  const { providerOverrides } = options;

  // ── Generation providers: Anthropic, OpenAI, Google ──
  //
  // T3X ships with exactly three LLM generation providers. All model
  // selection happens per-call (via the chat model selector); the
  // registry owns only the API-key → provider wiring.

  {
    const config = applyOverride(
      'anthropic',
      {
        defaultModel: 'claude-sonnet-4-6',
        availableModels: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'],
      },
      providerOverrides
    );

    reg.register({
      id: 'anthropic',
      name: 'Anthropic Claude',
      role: 'generation',
      requiredEnvKeys: ['ANTHROPIC_API_KEY'],
      defaultModel: config.defaultModel,
      availableModels: config.availableModels,
      factory: (resolvedConfig) =>
        createClaudeProvider({
          apiKey: resolvedConfig.ANTHROPIC_API_KEY!,
          baseUrl: process.env.ANTHROPIC_BASE_URL,
        }),
    });
  }

  {
    const config = applyOverride(
      'openai',
      {
        defaultModel: 'gpt-5.4',
        availableModels: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano'],
      },
      providerOverrides
    );

    reg.register({
      id: 'openai',
      name: 'OpenAI',
      role: 'generation',
      requiredEnvKeys: ['OPENAI_API_KEY'],
      defaultModel: config.defaultModel,
      availableModels: config.availableModels,
      factory: (resolvedConfig) =>
        createOpenAIProvider({
          apiKey: resolvedConfig.OPENAI_API_KEY!,
          baseUrl: process.env.OPENAI_BASE_URL,
        }),
    });
  }

  {
    const config = applyOverride(
      'google-ai',
      {
        defaultModel: 'gemini-2.5-pro',
        availableModels: [
          'gemini-2.5-pro',
          'gemini-3-flash-preview',
          'gemini-3.1-flash-lite-preview',
        ],
      },
      providerOverrides
    );

    reg.register({
      id: 'google-ai',
      name: 'Google AI (Gemini)',
      role: 'generation',
      requiredEnvKeys: ['GOOGLE_AI_STUDIO_KEY'],
      defaultModel: config.defaultModel,
      availableModels: config.availableModels,
      factory: (resolvedConfig) =>
        createGeminiProvider({
          apiKey: resolvedConfig.GOOGLE_AI_STUDIO_KEY!,
        }),
    });
  }

  // ── Embedding providers: internal ──
  //
  // Embedding is only used by leaf semantic-constraint validation and a
  // few API helpers. The registrations stay so `getForRole('embedding')`
  // resolves, but the settings UI surfaces these as an automatic
  // consequence of the matching LLM key — the user never configures a
  // separate embedding key.

  {
    const config = applyOverride(
      'google-ai-embedding',
      {
        defaultModel: 'gemini-embedding-001',
        availableModels: ['gemini-embedding-001', 'text-embedding-004'],
      },
      providerOverrides
    );

    reg.register({
      id: 'google-ai-embedding',
      name: 'Google AI Embedding',
      role: 'embedding',
      requiredEnvKeys: ['GOOGLE_AI_STUDIO_KEY'],
      defaultModel: config.defaultModel,
      availableModels: config.availableModels,
      factory: (resolvedConfig) =>
        createGoogleAIEmbeddingProvider({
          apiKey: resolvedConfig.GOOGLE_AI_STUDIO_KEY!,
        }),
    });
  }

  {
    const config = applyOverride(
      'openai-embedding',
      {
        defaultModel: 'text-embedding-3-small',
        availableModels: ['text-embedding-3-small', 'text-embedding-3-large'],
      },
      providerOverrides
    );

    reg.register({
      id: 'openai-embedding',
      name: 'OpenAI Embedding',
      role: 'embedding',
      requiredEnvKeys: ['OPENAI_API_KEY'],
      defaultModel: config.defaultModel,
      availableModels: config.availableModels,
      factory: (resolvedConfig) =>
        createOpenAIEmbeddingProvider({
          apiKey: resolvedConfig.OPENAI_API_KEY!,
        }),
    });
  }

  {
    const config = applyOverride(
      'ollama-embedding',
      {
        defaultModel: 'nomic-embed-text',
        availableModels: ['nomic-embed-text', 'mxbai-embed-large', 'all-minilm'],
      },
      providerOverrides
    );

    reg.register({
      id: 'ollama-embedding',
      name: 'Ollama Embedding (Local)',
      role: 'embedding',
      requiredEnvKeys: [],
      defaultModel: config.defaultModel,
      availableModels: config.availableModels,
      factory: () =>
        createOllamaEmbeddingProvider({
          baseUrl: process.env.OLLAMA_BASE_URL,
        }),
    });
  }
}

export function createDefaultProviderRegistry(
  options: DefaultProviderRegistryOptions = {}
): ProviderRegistry {
  const reg = createProviderRegistry();
  registerDefaultProviders(reg, { providerOverrides: options.providerOverrides });

  if (options.configOverrides) {
    reg.setConfigOverrides(options.configOverrides);
  }

  if (options.autoConfigureFromEnv ?? true) {
    reg.autoConfigureFromEnv();
  }

  return reg;
}
