import { LLMProviderError } from '@t3x-dev/core';
import type { YSchema } from '@t3x-dev/yschema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProposalGenerationModelInput } from '../lib/proposal-generation';
import { defaultProposalGenerationModel } from '../lib/proposal-generation-model';
import { semanticSchemaLayout } from '../lib/semantic-schema-layout';

const { generateStructured, resolveProviderAndModel } = vi.hoisted(() => ({
  generateStructured: vi.fn(),
  resolveProviderAndModel: vi.fn(),
}));
vi.mock('../lib/provider-resolver', () => ({ resolveProviderAndModel }));

const brief: YSchema = {
  nodes: {
    product: {
      slots: { title: { type: 'string', minLength: 1 }, problem: { type: 'string', minLength: 1 } },
      requiredSlots: ['title', 'problem'],
    },
    requirements: {
      required: true,
      repeated: true,
      slots: {
        title: { type: 'string', minLength: 1 },
        acceptance: { type: 'string', minLength: 1 },
        priority: { type: 'string', enum: ['must', 'should', 'could'] },
      },
      requiredSlots: ['title', 'acceptance'],
    },
  },
};

const input = {
  prompt: 'Edit only the current Draft. Return the required schema.',
  profile: {},
  context: {},
  base: {},
  authoring: { current: {} },
  yschema: { value: brief },
  schemaLayout: semanticSchemaLayout(brief, 'prd'),
  sources: [],
  instruction: '生成一个新的卡片，天气为晴天',
} as unknown as ProposalGenerationModelInput;
const draft = {
  schema: 't3x.dev/proposal-generation-draft/v1',
  version: 1,
  posture: 'guided',
  intent: { mode: 'unspecified' },
  rationale: { mode: 'unspecified' },
  changes: [
    {
      id: 'weather',
      operations: [{ set: { path: 'weather', value: { title: '天气为晴天' } } }],
      claimedOrigin: 'inferred',
      evidencePointers: [],
      basisPointers: [],
      assumptions: [],
      reason: 'User requested a new card',
      challenges: [],
    },
  ],
  warnings: [],
};

async function model() {
  return defaultProposalGenerationModel({ db: {}, projectId: 'test', request: {} } as Parameters<
    typeof defaultProposalGenerationModel
  >[0]);
}

describe('Proposal generation targeted repair', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resolveProviderAndModel.mockResolvedValue({
      ok: true,
      providerId: 'openai',
      model: 'test-model',
      provider: { generateStructured },
    });
  });

  it('reasks when new-card operations address a missing parent in an empty Draft', async () => {
    const invalid = structuredClone(draft);
    invalid.changes[0].operations = [
      { append: { path: 'requirements/children', value: { title: '天气为晴天' } } },
    ] as never;
    generateStructured
      .mockResolvedValueOnce({ data: invalid })
      .mockResolvedValueOnce({ data: draft });
    expect((await (await model()).generate(input)).draft).toEqual(draft);
    expect(generateStructured).toHaveBeenCalledTimes(2);
    expect(generateStructured.mock.calls[1][0].messages[2].content).toContain('changes.operations');
  });

  it.each([
    'SCHEMA_MISMATCH',
    'JSON_PARSE',
  ])('repairs %s using existing feedback and prior output', async (code) => {
    generateStructured
      .mockRejectedValueOnce(
        new LLMProviderError('openai', undefined, 'Invalid draft', code, {
          jsonText: '{"changes":[]}',
          issues: [{ path: ['changes'], message: 'Must contain at least one change' }],
        })
      )
      .mockResolvedValueOnce({ data: draft, usage: { inputTokens: 12, outputTokens: 8 } });
    const result = await (await model()).generate(input);
    expect(result.draft).toEqual(draft);
    expect(generateStructured).toHaveBeenCalledTimes(2);
    const [firstPrompt, schema, options] = generateStructured.mock.calls[0];
    const [retryPrompt, retrySchema, retryOptions] = generateStructured.mock.calls[1];
    expect(retryPrompt.system).toBe(firstPrompt.system);
    expect(retryPrompt.messages[0]).toEqual(firstPrompt.messages[0]);
    expect(retryPrompt.messages[1]).toEqual({ role: 'assistant', content: '{"changes":[]}' });
    expect(retryPrompt.messages[2].content).toContain('ProposalGenerationDraft');
    expect(retryPrompt.messages[2].content).toContain(
      code === 'SCHEMA_MISMATCH'
        ? 'changes: Must contain at least one change'
        : 'Return valid JSON only'
    );
    expect(retrySchema).toBe(schema);
    expect(retryOptions).toEqual(options);
  });

  it('stops after two failed attempts without returning an invalid candidate', async () => {
    const error = new LLMProviderError('openai', undefined, 'Invalid draft', 'SCHEMA_MISMATCH');
    generateStructured.mockRejectedValue(error);
    await expect((await model()).generate(input)).rejects.toBe(error);
    expect(generateStructured).toHaveBeenCalledTimes(2);
  });

  it.each(['REFUSAL', 'NETWORK_ERROR'])('does not format-retry %s', async (code) => {
    const error = new LLMProviderError('openai', undefined, 'Failed', code);
    generateStructured.mockRejectedValue(error);
    await expect((await model()).generate(input)).rejects.toBe(error);
    expect(generateStructured).toHaveBeenCalledTimes(1);
  });

  it('does not retry a valid first response', async () => {
    generateStructured.mockResolvedValue({ data: draft });
    expect((await (await model()).generate(input)).draft).toEqual(draft);
    expect(generateStructured).toHaveBeenCalledTimes(1);
  });

  it('accepts first-card bootstrap operations against an empty Draft', async () => {
    const bootstrap = {
      ...draft,
      changes: [
        {
          ...draft.changes[0],
          operations: [
            { set: { path: 'domain', value: 't3x.dev/semantic-content' } },
            { set: { path: 'version', value: 1 } },
            {
              set: {
                path: 'content',
                value: {
                  trees: [
                    {
                      key: 'prd',
                      slots: {},
                      children: [
                        {
                          key: 'requirements',
                          slots: {},
                          children: [
                            { key: 'weather', slots: { title: '天气为晴天' }, children: [] },
                          ],
                        },
                      ],
                    },
                  ],
                  relations: [],
                },
              },
            },
          ],
        },
      ],
    };
    generateStructured.mockResolvedValue({ data: bootstrap });
    expect((await (await model()).generate(input)).draft).toEqual(bootstrap);
    expect(generateStructured).toHaveBeenCalledTimes(1);
  });

  it('completes a new collection item with the explicitly requested title and content', async () => {
    const requested = {
      ...input,
      instruction: '新建1个卡片标题为气温 内容为低于30度',
      authoring: {
        current: {
          domain: 't3x.dev/semantic-content',
          version: 1,
          content: {
            trees: [
              {
                key: 'prd',
                slots: {},
                children: [{ key: 'requirements', slots: {}, children: [] }],
              },
            ],
            relations: [],
          },
        },
      },
    };
    const path = 'content/trees/[key=prd]/children/[key=requirements]/children';
    const titleOnly = {
      ...draft,
      changes: [
        {
          ...draft.changes[0],
          operations: [
            {
              append: {
                path,
                value: { key: 'temperature', slots: { title: '气温' }, children: [] },
              },
            },
          ],
        },
      ],
    };
    const complete = {
      ...draft,
      changes: [
        {
          ...draft.changes[0],
          operations: [
            {
              append: {
                path,
                value: {
                  key: 'temperature',
                  slots: { title: '气温', acceptance: '低于30度' },
                  children: [],
                },
              },
            },
          ],
        },
      ],
    };
    generateStructured.mockResolvedValueOnce({ data: titleOnly });
    expect((await (await model()).generate(requested)).draft).toEqual(complete);
    expect(generateStructured).toHaveBeenCalledTimes(1);
  });

  it('rejects a card if a retry still omits the requested content', async () => {
    const requested = { ...input, instruction: '新建1个卡片标题为气温 内容为低于30度' };
    generateStructured.mockResolvedValue({ data: draft });
    await expect((await model()).generate(requested)).rejects.toThrow(
      'Generated card omitted explicitly requested content'
    );
    expect(generateStructured).toHaveBeenCalledTimes(2);
  });

  it('still accepts in-place edits against an existing Draft', async () => {
    const edit = {
      ...draft,
      changes: [
        {
          ...draft.changes[0],
          operations: [{ set: { path: 'weather/title', value: '天气为晴天' } }],
        },
      ],
    };
    generateStructured.mockResolvedValue({ data: edit });
    const existing = {
      ...input,
      authoring: {
        ...input.authoring!,
        current: { weather: { title: '天气为阴天' }, sibling: 'unchanged' },
      },
    };
    expect((await (await model()).generate(existing)).draft).toEqual(edit);
    expect(existing.authoring.current.sibling).toBe('unchanged');
    expect(generateStructured).toHaveBeenCalledTimes(1);
  });

  it('fills requested card content into whichever free-text slot the bound schema defines', async () => {
    const backlog: YSchema = {
      nodes: {
        tasks: {
          repeated: true,
          slots: {
            name: { type: 'string', minLength: 1 },
            status: { type: 'string', enum: ['open', 'done'] },
            notes: { type: 'array' },
          },
          requiredSlots: ['name', 'notes'],
        },
      },
    };
    const path = 'content/trees/[key=board]/children/[key=tasks]/children';
    const requested = {
      ...input,
      instruction: '新建1个卡片标题为气温 内容为低于30度',
      yschema: { value: backlog },
      schemaLayout: semanticSchemaLayout(backlog, 'board'),
      authoring: {
        current: {
          domain: 't3x.dev/semantic-content',
          version: 1,
          content: {
            trees: [
              {
                key: 'board',
                slots: {},
                children: [{ key: 'tasks', slots: {}, children: [] }],
              },
            ],
            relations: [],
          },
        },
      },
    };
    const append = (slots: Record<string, unknown>) => ({
      ...draft,
      changes: [
        {
          ...draft.changes[0],
          operations: [{ append: { path, value: { key: 'temperature', slots, children: [] } } }],
        },
      ],
    });
    generateStructured.mockResolvedValueOnce({ data: append({ name: '气温', status: 'open' }) });
    expect((await (await model()).generate(requested)).draft).toEqual(
      append({ name: '气温', status: 'open', notes: ['低于30度'] })
    );
    expect(generateStructured).toHaveBeenCalledTimes(1);
  });

  describe('schema layout check', () => {
    const root = (children: unknown[], extraTrees: unknown[] = []) => ({
      domain: 't3x.dev/semantic-content',
      version: 1,
      content: {
        trees: [{ key: 'prd', slots: {}, children }, ...extraTrees],
        relations: [],
      },
    });
    const requirements = { key: 'requirements', slots: {}, children: [] };
    const item = { key: 'export', slots: { title: 'Export', acceptance: 'Works' }, children: [] };
    const withOps = (operations: unknown[]) => ({
      ...draft,
      changes: [{ ...draft.changes[0], operations }],
    });
    const correct = withOps([
      {
        append: {
          path: 'content/trees/[key=prd]/children/[key=requirements]/children',
          value: item,
        },
      },
    ]);

    it.each([
      ['a top-level tree beside the root', 'content/trees', 'UNEXPECTED_ROOT_TREE'],
      ['an item beside its collection', 'content/trees/[key=prd]/children', 'UNEXPECTED_NODE'],
    ])('reasks when the model places %s', async (_label, parent, code) => {
      const misplaced = withOps([{ append: { path: parent, value: item } }]);
      generateStructured
        .mockResolvedValueOnce({ data: misplaced })
        .mockResolvedValueOnce({ data: correct });
      const result = await (await model()).generate({
        ...input,
        authoring: { current: root([requirements]) },
      } as never);
      expect(result.draft).toEqual(correct);
      expect(generateStructured).toHaveBeenCalledTimes(2);
      expect(generateStructured.mock.calls[1][0].messages[2].content).toContain(code);
    });

    it('reasks on a slot value that violates the schema type', async () => {
      const wrongType = withOps([
        {
          append: {
            path: 'content/trees/[key=prd]/children/[key=requirements]/children',
            value: { ...item, slots: { title: 'Export', acceptance: ['Works'] } },
          },
        },
      ]);
      generateStructured
        .mockResolvedValueOnce({ data: wrongType })
        .mockResolvedValueOnce({ data: correct });
      await (await model()).generate({
        ...input,
        authoring: { current: root([requirements]) },
      } as never);
      expect(generateStructured.mock.calls[1][0].messages[2].content).toContain('INVALID_TYPE');
    });

    it('does not blame the model for misplaced content already in the Draft', async () => {
      generateStructured.mockResolvedValue({ data: correct });
      const result = await (await model()).generate({
        ...input,
        authoring: { current: root([requirements], [{ key: 'stray', slots: {}, children: [] }]) },
      } as never);
      expect(result.draft).toEqual(correct);
      expect(generateStructured).toHaveBeenCalledTimes(1);
    });

    it('accepts a partial Draft with readiness gaps', async () => {
      const partial = withOps([
        {
          append: {
            path: 'content/trees/[key=prd]/children/[key=requirements]/children',
            value: { key: 'export', slots: { title: 'Export' }, children: [] },
          },
        },
      ]);
      generateStructured.mockResolvedValue({ data: partial });
      await (await model()).generate({
        ...input,
        authoring: { current: root([requirements]) },
      } as never);
      expect(generateStructured).toHaveBeenCalledTimes(1);
    });
  });
});
