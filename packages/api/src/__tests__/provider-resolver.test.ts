import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findConversationById, findProjectById, findUserById } = vi.hoisted(() => ({
  findConversationById: vi.fn(),
  findProjectById: vi.fn(),
  findUserById: vi.fn(),
}));

const { getProviderRegistry } = vi.hoisted(() => ({
  getProviderRegistry: vi.fn(),
}));

vi.mock('@t3x-dev/storage', () => ({
  findConversationById,
  findProjectById,
  findUserById,
}));

vi.mock('../lib/provider-registry', () => ({
  getProviderRegistry,
}));

import { resolveProviderAndModel } from '../lib/provider-resolver';

function createRegistry(overrides?: {
  configured?: string[];
  generationOrder?: string[];
  defaultModels?: Partial<Record<'anthropic' | 'openai' | 'google-ai', string>>;
}) {
  const configured = new Set(overrides?.configured ?? ['anthropic', 'openai']);
  const generationOrder = overrides?.generationOrder ?? ['anthropic', 'openai'];
  const defaultModels = {
    anthropic: 'claude-sonnet-4-20250514',
    openai: 'gpt-5.4',
    'google-ai': 'gemini-2.5-pro',
    ...overrides?.defaultModels,
  };

  return {
    listProviders: () => [
      {
        id: 'anthropic',
        defaultModel: defaultModels.anthropic,
        availableModels: ['claude-sonnet-4-20250514'],
      },
      {
        id: 'openai',
        defaultModel: defaultModels.openai,
        availableModels: ['gpt-5.4'],
      },
      {
        id: 'google-ai',
        defaultModel: defaultModels['google-ai'],
        availableModels: ['gemini-2.5-pro'],
      },
    ],
    getProviderIdsForRole: vi.fn(() => generationOrder),
    isConfigured: vi.fn((providerId: string) => configured.has(providerId)),
    getById: vi.fn((providerId: string) => ({ id: providerId })),
    getEntry: vi.fn((providerId: 'anthropic' | 'openai' | 'google-ai') => ({
      defaultModel: defaultModels[providerId],
    })),
  };
}

describe('resolveProviderAndModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findConversationById.mockResolvedValue(null);
    findProjectById.mockResolvedValue(null);
    findUserById.mockResolvedValue(null);
    getProviderRegistry.mockResolvedValue(createRegistry());
  });

  it('resolves by conversation, then project, then user preference before global order', async () => {
    findConversationById.mockResolvedValue({
      conversationId: 'conv_1',
      projectId: 'proj_1',
      provider: null,
      model: 'gpt-5.4',
    });
    findProjectById.mockResolvedValue({
      projectId: 'proj_1',
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-20250514',
      providerConfig: null,
    });
    findUserById.mockResolvedValue({
      id: 'user_1',
      default_provider: 'openai',
      default_model: 'gpt-5.4',
    });

    const result = await resolveProviderAndModel({
      db: {} as never,
      conversationId: 'conv_1',
      userId: 'user_1',
    });

    expect(result).toMatchObject({
      ok: true,
      providerId: 'openai',
      model: 'gpt-5.4',
    });
  });

  it('falls back to user preference when project and conversation are unset', async () => {
    findProjectById.mockResolvedValue({
      projectId: 'proj_1',
      defaultProvider: null,
      defaultModel: null,
      providerConfig: null,
    });
    findUserById.mockResolvedValue({
      id: 'user_1',
      default_provider: 'openai',
      default_model: 'gpt-5.4',
    });

    const result = await resolveProviderAndModel({
      db: {} as never,
      projectId: 'proj_1',
      userId: 'user_1',
    });

    expect(result).toMatchObject({
      ok: true,
      providerId: 'openai',
      model: 'gpt-5.4',
    });
  });

  it('uses project provider role order before global order when no scoped selection exists', async () => {
    getProviderRegistry.mockResolvedValue(
      createRegistry({
        configured: ['anthropic', 'openai'],
        generationOrder: ['anthropic', 'openai'],
      })
    );
    findProjectById.mockResolvedValue({
      projectId: 'proj_1',
      defaultProvider: null,
      defaultModel: null,
      providerConfig: JSON.stringify({
        roles: [{ role: 'generation', providerIds: ['openai', 'anthropic'] }],
      }),
    });

    const result = await resolveProviderAndModel({
      db: {} as never,
      projectId: 'proj_1',
    });

    expect(result).toMatchObject({
      ok: true,
      providerId: 'openai',
      model: 'gpt-5.4',
    });
  });

  it('skips an unconfigured user preference and falls back to the configured global chain', async () => {
    getProviderRegistry.mockResolvedValue(
      createRegistry({
        configured: ['anthropic'],
        generationOrder: ['anthropic', 'openai'],
      })
    );
    findUserById.mockResolvedValue({
      id: 'user_1',
      default_provider: 'openai',
      default_model: 'gpt-5.4',
    });

    const result = await resolveProviderAndModel({
      db: {} as never,
      userId: 'user_1',
    });

    expect(result).toMatchObject({
      ok: true,
      providerId: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    });
  });
});
