import { describe, expect, it } from 'vitest';
import {
  ChatRequestBodySchema,
  ChatResponseDataSchema,
  ProvidersResponseDataSchema,
} from '../schemas/chat';
import {
  LocalProviderStatusSchema,
  LocalProviderWriteSchema,
  ProviderListSchema,
  ProviderSchema,
  ProviderTestParamSchema,
  RoleAssignmentListSchema,
  RoleAssignmentSchema,
  RoleAssignmentWriteSchema,
  TestResultSchema,
} from '../schemas/providers';

describe('route contract schemas', () => {
  it('parses chat request and response payloads from dedicated schema modules', () => {
    expect(
      ChatRequestBodySchema.parse({
        messages: [{ role: 'user', content: 'hello' }],
        provider: 'openai',
        model: 'gpt-4.1',
      })
    ).toMatchObject({
      provider: 'openai',
      model: 'gpt-4.1',
    });

    expect(
      ChatResponseDataSchema.parse({
        content: 'hi',
        model: 'gpt-4.1',
        usage: { input_tokens: 1, output_tokens: 2 },
      })
    ).toMatchObject({
      content: 'hi',
      model: 'gpt-4.1',
    });

    expect(
      ProvidersResponseDataSchema.parse({
        providers: ['claude', 'openai'],
        default: 'openai',
      })
    ).toMatchObject({
      default: 'openai',
    });
  });

  it('parses provider route payloads from dedicated schema modules', () => {
    expect(
      ProviderSchema.parse({
        id: 'openai',
        name: 'OpenAI',
        role: 'generation',
        configured: true,
        roles: ['generation'],
        required_env_keys: ['OPENAI_API_KEY'],
        default_model: 'gpt-4.1',
        available_models: ['gpt-4.1'],
      })
    ).toMatchObject({ id: 'openai' });

    expect(
      ProviderListSchema.parse([
        {
          id: 'openai',
          name: 'OpenAI',
          role: 'generation',
          configured: true,
          roles: ['generation'],
          required_env_keys: ['OPENAI_API_KEY'],
          default_model: 'gpt-4.1',
          available_models: ['gpt-4.1'],
        },
      ])
    ).toHaveLength(1);

    expect(
      RoleAssignmentSchema.parse({
        role: 'generation',
        provider_ids: ['openai'],
      })
    ).toMatchObject({ role: 'generation' });

    expect(
      RoleAssignmentListSchema.parse([
        {
          role: 'generation',
          provider_ids: ['openai'],
        },
      ])
    ).toHaveLength(1);

    expect(
      RoleAssignmentWriteSchema.parse({
        roles: [{ role: 'generation', provider_ids: ['openai'] }],
      })
    ).toMatchObject({
      roles: [{ role: 'generation', provider_ids: ['openai'] }],
    });

    expect(
      TestResultSchema.parse({
        ok: true,
        latency_ms: 123,
      })
    ).toMatchObject({ ok: true });

    expect(
      ProviderTestParamSchema.parse({
        id: 'openai',
      })
    ).toMatchObject({ id: 'openai' });

    expect(
      LocalProviderStatusSchema.parse({
        provider: 'openai',
        configured: true,
        default_model: 'gpt-4.1',
        last_test_status: 'ok',
        last_tested_at: null,
        last_test_error: null,
        api_key_source: 'file',
        api_key_preview: '…JnYA',
        env_overrides_stored: false,
      })
    ).toMatchObject({ provider: 'openai' });

    expect(
      LocalProviderWriteSchema.parse({
        api_key: 'sk-test',
        default_model: 'gpt-4.1',
      })
    ).toMatchObject({ api_key: 'sk-test' });
  });
});
