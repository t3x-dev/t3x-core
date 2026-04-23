/**
 * CLI Leaf Commands Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockClient, createClientMock } = vi.hoisted(() => ({
  mockClient: {
    getLeaf: vi.fn(),
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

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

import { Command } from 'commander';
import { registerCreateLeaf, registerGenerateLeaf, registerShowLeaf } from '../../commands/leaves.js';

function createProgram() {
  const program = new Command();
  program.exitOverride();

  const showCmd = program.command('show');
  registerShowLeaf(showCmd);

  const createCmd = program.command('create');
  registerCreateLeaf(createCmd);

  const generateCmd = program.command('generate');
  registerGenerateLeaf(generateCmd);

  return program;
}

describe('register leaf commands', () => {
  const originalApiKey = process.env.T3X_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.T3X_API_KEY;
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.T3X_API_KEY;
    else process.env.T3X_API_KEY = originalApiKey;
  });

  it('creates a leaf with bearer auth headers', async () => {
    process.env.T3X_API_KEY = 't3xk_test';
    mockClient.createLeaf.mockResolvedValue({ id: 'leaf_1' });

    const program = createProgram();
    await program.parseAsync([
      'node',
      'test',
      'create',
      'leaf',
      '-p',
      'proj_1',
      '-c',
      'sha256:abc',
      '-t',
      'tweet',
    ]);

    expect(createClientMock).toHaveBeenCalledWith({
      baseUrl: 'http://localhost:8000/api',
      headers: { Authorization: 'Bearer t3xk_test' },
    });
    expect(mockClient.createLeaf).toHaveBeenCalledWith({
      project_id: 'proj_1',
      commit_hash: 'sha256:abc',
      type: 'tweet',
      title: undefined,
    });
  });

  it('shows a leaf when assertions are null', async () => {
    mockClient.getLeaf.mockResolvedValue({
      id: 'leaf_1',
      type: 'article',
      title: null,
      commit_hash: 'sha256:abc',
      created_at: '2026-04-23T00:00:00.000Z',
      constraints: [],
      assertions: null,
      output: null,
    });

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'show', 'leaf', 'leaf_1']);

    expect(mockClient.getLeaf).toHaveBeenCalledWith('leaf_1');
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('generates a leaf with bearer auth headers', async () => {
    process.env.T3X_API_KEY = 't3xk_test';
    mockClient.generateLeaf.mockResolvedValue({ id: 'leaf_1', output: 'ok' });

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'generate', 'leaf', 'leaf_1']);

    expect(createClientMock).toHaveBeenCalledWith({
      baseUrl: 'http://localhost:8000/api',
      headers: { Authorization: 'Bearer t3xk_test' },
    });
    expect(mockClient.generateLeaf).toHaveBeenCalledWith('leaf_1', {
      model: undefined,
      provider: undefined,
    });
  });

  it('does not start a spinner for json leaf generation output', async () => {
    mockClient.generateLeaf.mockResolvedValue({ id: 'leaf_1', output: 'ok' });

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'generate', 'leaf', 'leaf_1', '--json']);

    expect(mockSpinner.start).not.toHaveBeenCalled();
  });

  it('handles create errors', async () => {
    mockClient.createLeaf.mockRejectedValue(new Error('Forbidden'));

    const program = createProgram();
    await program.parseAsync([
      'node',
      'test',
      'create',
      'leaf',
      '-p',
      'proj_1',
      '-c',
      'sha256:abc',
      '-t',
      'tweet',
    ]);

    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
