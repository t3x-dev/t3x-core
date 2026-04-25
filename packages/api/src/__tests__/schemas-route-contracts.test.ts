import { describe, expect, it } from 'vitest';
import {
  ChatRequestBodySchema,
  ChatResponseDataSchema,
  ProvidersResponseDataSchema,
} from '../schemas/chat';
import {
  CreateLeafRequest,
  LeafHistoryResponse,
  LeafResponse,
  UpdateLeafRequest,
} from '../schemas/contracts';
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

  it('validates leaf semantic point override config explicitly', () => {
    const validConfig = {
      prompt_template: 'Write a concise update',
      user_instruction: 'Keep it grounded in the selected points.',
      semantic_point_overrides: [
        { point_id: 'trip/city', state: 'included' },
        { point_id: 'trip/duration', state: 'excluded' },
      ],
    };

    expect(
      CreateLeafRequest.parse({
        commit_hash: 'sha256:test',
        type: 'tweet',
        project_id: 'proj_test',
        config: validConfig,
      }).config
    ).toMatchObject(validConfig);

    expect(
      UpdateLeafRequest.parse({
        config: validConfig,
      }).config
    ).toMatchObject(validConfig);

    expect(
      LeafResponse.parse({
        id: 'leaf_test',
        commit_hash: 'sha256:test',
        type: 'tweet',
        title: 'Trip Leaf',
        constraints: [],
        config: validConfig,
        output: null,
        generated_at: null,
        assertions: null,
        runner_assertions: null,
        project_id: 'proj_test',
        created_at: '2026-04-24T00:00:00.000Z',
        created_by: null,
      }).config
    ).toMatchObject(validConfig);

    expect(
      LeafHistoryResponse.parse({
        id: 'lhist_test',
        leaf_id: 'leaf_test',
        output: 'Sample output',
        config: validConfig,
        model: 'claude-sonnet-4-6',
        generated_at: '2026-04-24T00:00:00.000Z',
        created_by: null,
      }).config
    ).toMatchObject(validConfig);

    const invalidUpdate = UpdateLeafRequest.safeParse({
      config: {
        semantic_point_overrides: [{ point_id: 'trip/city', state: 'invalid' }],
      },
    });

    expect(invalidUpdate.success).toBe(false);
  });
});
