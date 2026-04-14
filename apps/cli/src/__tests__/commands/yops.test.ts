import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockClient = {
  getDraft: vi.fn(),
  applyYOps: vi.fn(),
};

vi.mock('@t3x-dev/api-client', () => ({
  createClient: vi.fn(() => mockClient),
}));

const mockSpinner = { start: vi.fn(), stop: vi.fn(), succeed: vi.fn(), fail: vi.fn() };
vi.mock('ora', () => ({ default: vi.fn(() => mockSpinner) }));

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

// Mock fs.readFileSync for --file input
vi.mock('node:fs', () => ({
  readFileSync: vi.fn((path: string) => {
    if (String(path).endsWith('.yaml')) {
      return 'yops:\n  - set:\n      path: trip/budget\n      value: 5000\n';
    }
    throw new Error(`unexpected path: ${path}`);
  }),
}));

import { Command } from 'commander';
import { registerYopsCommands } from '../../commands/yops.js';

function createProgram() {
  const program = new Command();
  program.exitOverride();
  registerYopsCommands(program);
  return program;
}

describe('yops apply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.T3X_DRAFT;
  });

  it('applies YOps from --file and auto-fetches revision', async () => {
    mockClient.getDraft.mockResolvedValue({ draft_id: 'draft_abc', revision: 4 });
    mockClient.applyYOps.mockResolvedValue({
      draft_id: 'draft_abc',
      revision: 5,
      trees: [],
      applied_count: 1,
      tree_count: 3,
      slot_count: 12,
    });

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'yops', 'apply', 'draft_abc', '--file', 'ops.yaml']);

    expect(mockClient.getDraft).toHaveBeenCalledWith('draft_abc');
    expect(mockClient.applyYOps).toHaveBeenCalledWith(
      'draft_abc',
      [{ set: { path: 'trip/budget', value: 5000 } }],
      4,
    );
  });

  it('uses explicit --if-revision without fetching', async () => {
    mockClient.applyYOps.mockResolvedValue({
      draft_id: 'draft_abc',
      revision: 8,
      trees: [],
      applied_count: 1,
      tree_count: 0,
      slot_count: 0,
    });

    const program = createProgram();
    await program.parseAsync([
      'node', 'test', 'yops', 'apply', 'draft_abc',
      '--file', 'ops.yaml', '--if-revision', '7',
    ]);

    expect(mockClient.getDraft).not.toHaveBeenCalled();
    expect(mockClient.applyYOps).toHaveBeenCalledWith(
      'draft_abc',
      expect.any(Array),
      7,
    );
  });

  it('falls back to T3X_DRAFT when no positional draft-id', async () => {
    process.env.T3X_DRAFT = 'draft_env';
    mockClient.getDraft.mockResolvedValue({ draft_id: 'draft_env', revision: 1 });
    mockClient.applyYOps.mockResolvedValue({
      draft_id: 'draft_env', revision: 2, trees: [], applied_count: 1, tree_count: 0, slot_count: 0,
    });

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'yops', 'apply', '--file', 'ops.yaml']);

    expect(mockClient.applyYOps).toHaveBeenCalledWith('draft_env', expect.any(Array), 1);
  });

  it('exits 1 when no draft-id and no T3X_DRAFT', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'test', 'yops', 'apply', '--file', 'ops.yaml']);

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockClient.applyYOps).not.toHaveBeenCalled();
  });
});
