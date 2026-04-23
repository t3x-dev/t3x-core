/**
 * CLI Commit Command Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockClient, createClientMock } = vi.hoisted(() => ({
  mockClient: {
    commitFromDraft: vi.fn(),
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

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

import { Command } from 'commander';
import { registerCommitCommand } from '../../commands/commit.js';

function createProgram() {
  const program = new Command();
  program.exitOverride();
  registerCommitCommand(program);
  return program;
}

describe('registerCommitCommand', () => {
  const originalDraft = process.env.T3X_DRAFT;
  const originalApiKey = process.env.T3X_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.T3X_DRAFT;
    delete process.env.T3X_API_KEY;
  });

  afterEach(() => {
    if (originalDraft === undefined) delete process.env.T3X_DRAFT;
    else process.env.T3X_DRAFT = originalDraft;

    if (originalApiKey === undefined) delete process.env.T3X_API_KEY;
    else process.env.T3X_API_KEY = originalApiKey;
  });

  it('commits a draft by id', async () => {
    mockClient.commitFromDraft.mockResolvedValue({
      commit_hash: 'sha256:newcommit',
      tree_count: 2,
      branch: 'main',
    });

    const program = createProgram();
    await program.parseAsync([
      'node',
      'test',
      'commit',
      'draft_abc',
      '-p',
      'proj_1',
      '-m',
      'Draft commit',
    ]);

    expect(mockClient.commitFromDraft).toHaveBeenCalledWith({
      project_id: 'proj_1',
      draft_id: 'draft_abc',
      message: 'Draft commit',
      branch: undefined,
    });
  });

  it('falls back to T3X_DRAFT when positional draft id is omitted', async () => {
    process.env.T3X_DRAFT = 'draft_env';
    mockClient.commitFromDraft.mockResolvedValue({
      commit_hash: 'sha256:newcommit',
      tree_count: 1,
      branch: 'main',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'commit', '-p', 'proj_1']);

    expect(mockClient.commitFromDraft).toHaveBeenCalledWith({
      project_id: 'proj_1',
      draft_id: 'draft_env',
      message: undefined,
      branch: undefined,
    });
  });

  it('passes bearer auth via getClientWithAuth', async () => {
    process.env.T3X_API_KEY = 't3xk_test';
    mockClient.commitFromDraft.mockResolvedValue({
      commit_hash: 'sha256:newcommit',
      tree_count: 1,
      branch: 'main',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'commit', 'draft_abc', '-p', 'proj_1']);

    expect(createClientMock).toHaveBeenCalledWith({
      baseUrl: 'http://localhost:8000/api',
      headers: { Authorization: 'Bearer t3xk_test' },
    });
  });

  it('exits when no draft id and no T3X_DRAFT are provided', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'test', 'commit', '-p', 'proj_1']);

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockClient.commitFromDraft).not.toHaveBeenCalled();
  });
});
