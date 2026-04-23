import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockClient, createClientMock } = vi.hoisted(() => ({
  mockClient: {
    createProject: vi.fn(),
    extract: vi.fn(),
    getDraft: vi.fn(),
    applyYOps: vi.fn(),
    commitFromDraft: vi.fn(),
    createLeaf: vi.fn(),
    generateLeaf: vi.fn(),
  },
  createClientMock: vi.fn(),
}));

createClientMock.mockImplementation(() => mockClient);

vi.mock('@t3x-dev/api-client', () => ({
  createClient: createClientMock,
}));

const mockSpinner = { start: vi.fn(), stop: vi.fn(), succeed: vi.fn(), fail: vi.fn() };
vi.mock('ora', () => ({
  default: vi.fn(() => mockSpinner),
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn((path: string) => {
    if (String(path).endsWith('.yaml')) {
      return 'yops:\n  - set:\n      path: trip/budget\n      value: 5000\n';
    }
    throw new Error(`unexpected path: ${path}`);
  }),
}));

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

import { Command } from 'commander';
import {
  CreateLeafRequest,
  LeafResponse,
} from '../../../../../packages/api/src/schemas/contracts.ts';
import {
  CommitFromDraftResponse,
  ExtractResponse,
} from '../../../../../packages/api/src/schemas/integration-contracts.ts';
import { ProjectSchema } from '../../../../../packages/api/src/schemas/projects.ts';
import { registerCommitCommand } from '../../commands/commit.js';
import { registerShowDraft } from '../../commands/drafts.js';
import { registerExtractCommands } from '../../commands/extract.js';
import { registerCreateLeaf, registerGenerateLeaf } from '../../commands/leaves.js';
import { registerCreateProject } from '../../commands/projects.js';
import { registerYopsCommands } from '../../commands/yops.js';

function createProgram() {
  const program = new Command();
  program.exitOverride();

  const createCmd = program.command('create');
  registerCreateProject(createCmd);
  registerCreateLeaf(createCmd);

  const generateCmd = program.command('generate');
  registerGenerateLeaf(generateCmd);

  const showCmd = program.command('show');
  registerShowDraft(showCmd);

  registerExtractCommands(program);
  registerYopsCommands(program);
  registerCommitCommand(program);

  return program;
}

describe('minimal main path smoke', () => {
  const originalApiKey = process.env.T3X_API_KEY;
  const originalDraft = process.env.T3X_DRAFT;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.T3X_API_KEY = 't3xk_test';
    delete process.env.T3X_DRAFT;
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.T3X_API_KEY;
    else process.env.T3X_API_KEY = originalApiKey;

    if (originalDraft === undefined) delete process.env.T3X_DRAFT;
    else process.env.T3X_DRAFT = originalDraft;
  });

  it('runs the first-stage main path with authenticated client calls', async () => {
    mockClient.createProject.mockResolvedValue(
      ProjectSchema.parse({
        project_id: 'proj_abc',
        name: 'Travel Notes',
        created_at: '2026-04-23T00:00:00.000Z',
        metadata: null,
      })
    );

    mockClient.extract.mockResolvedValue(
      ExtractResponse.parse({
        conversation_id: 'conv_abc',
        draft_id: 'draft_xyz',
        trees: [
          {
            key: 'trip',
            slots: { budget: 5000 },
            children: [],
          },
        ],
        extraction_mode: 'llm',
      })
    );

    mockClient.getDraft
      .mockResolvedValueOnce({
        draft_id: 'draft_xyz',
        project_id: 'proj_abc',
        status: 'editing',
        revision: 1,
        created_at: '2026-04-23T00:00:00.000Z',
        nodes: [],
      })
      .mockResolvedValueOnce({
        draft_id: 'draft_xyz',
        revision: 1,
      });

    mockClient.applyYOps.mockResolvedValue({
      draft_id: 'draft_xyz',
      revision: 2,
      trees: [],
      applied_count: 1,
      tree_count: 1,
      slot_count: 1,
    });

    mockClient.commitFromDraft.mockResolvedValue(
      CommitFromDraftResponse.parse({
        commit_hash: 'sha256:commit_hash',
        tree_count: 1,
        branch: 'main',
      })
    );

    mockClient.createLeaf.mockResolvedValue(
      LeafResponse.parse({
        id: 'leaf_abc',
        commit_hash: 'sha256:commit_hash',
        type: 'article',
        title: 'Hangzhou plan',
        constraints: [],
        config: {},
        output: null,
        generated_at: null,
        assertions: null,
        runner_assertions: null,
        project_id: 'proj_abc',
        created_at: '2026-04-23T00:00:00.000Z',
        created_by: null,
      })
    );

    mockClient.generateLeaf.mockResolvedValue(
      LeafResponse.parse({
        id: 'leaf_abc',
        commit_hash: 'sha256:commit_hash',
        type: 'article',
        title: 'Hangzhou plan',
        constraints: [],
        config: {},
        output: 'Generated output',
        generated_at: '2026-04-23T00:01:00.000Z',
        assertions: [],
        runner_assertions: null,
        project_id: 'proj_abc',
        created_at: '2026-04-23T00:00:00.000Z',
        created_by: null,
      })
    );

    await createProgram().parseAsync(['node', 'test', 'create', 'project', 'Travel Notes']);
    await createProgram().parseAsync([
      'node',
      'test',
      'extract',
      '-p',
      'proj_abc',
      '--text',
      'I have 5000 yuan and want a 5-day Hangzhou trip.',
    ]);

    process.env.T3X_DRAFT = 'draft_xyz';

    await createProgram().parseAsync(['node', 'test', 'show', 'draft']);
    await createProgram().parseAsync(['node', 'test', 'yops', 'apply', '--file', 'ops.yaml']);
    await createProgram().parseAsync([
      'node',
      'test',
      'commit',
      '-p',
      'proj_abc',
      '-m',
      'Refine travel plan',
    ]);
    await createProgram().parseAsync([
      'node',
      'test',
      'create',
      'leaf',
      '-p',
      'proj_abc',
      '-c',
      'sha256:commit_hash',
      '-t',
      'article',
      '--title',
      'Hangzhou plan',
    ]);
    await createProgram().parseAsync(['node', 'test', 'generate', 'leaf', 'leaf_abc']);

    expect(mockExit).not.toHaveBeenCalled();

    expect(mockClient.createProject).toHaveBeenCalledWith({ name: 'Travel Notes' });
    expect(mockClient.extract).toHaveBeenCalledWith({
      project_id: 'proj_abc',
      text: 'I have 5000 yuan and want a 5-day Hangzhou trip.',
      conversation_id: undefined,
      source: undefined,
    });
    expect(mockClient.getDraft).toHaveBeenNthCalledWith(1, 'draft_xyz');
    expect(mockClient.getDraft).toHaveBeenNthCalledWith(2, 'draft_xyz');
    expect(mockClient.applyYOps).toHaveBeenCalledWith(
      'draft_xyz',
      [{ set: { path: 'trip/budget', value: 5000 } }],
      1
    );
    expect(mockClient.commitFromDraft).toHaveBeenCalledWith({
      project_id: 'proj_abc',
      draft_id: 'draft_xyz',
      message: 'Refine travel plan',
      branch: undefined,
    });

    const createLeafRequest = mockClient.createLeaf.mock.calls[0]?.[0];
    expect(() => CreateLeafRequest.parse(createLeafRequest)).not.toThrow();
    expect(createLeafRequest).toMatchObject({
      project_id: 'proj_abc',
      commit_hash: 'sha256:commit_hash',
      type: 'article',
      title: 'Hangzhou plan',
    });
    expect(mockClient.generateLeaf).toHaveBeenCalledWith('leaf_abc', {
      model: undefined,
      provider: undefined,
    });

    expect(createClientMock).toHaveBeenCalledTimes(7);
    for (const [call] of createClientMock.mock.calls) {
      expect(call).toEqual({
        baseUrl: 'http://localhost:8000/api',
        headers: { Authorization: 'Bearer t3xk_test' },
      });
    }
  });
});
