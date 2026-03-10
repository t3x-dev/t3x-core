/**
 * CLI Branch Commands Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockClient = {
  listBranches: vi.fn(),
  createBranch: vi.fn(),
  switchBranch: vi.fn(),
  getCurrentBranch: vi.fn(),
};

vi.mock('@t3x-dev/api-client', () => ({
  createClient: vi.fn(() => mockClient),
}));

const mockSpinner = { start: vi.fn(), stop: vi.fn(), succeed: vi.fn(), fail: vi.fn() };
vi.mock('ora', () => ({
  default: vi.fn(() => mockSpinner),
}));

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

import { Command } from 'commander';
import { registerBranchCommands } from '../../commands/branches.js';

function createProgram() {
  const program = new Command();
  program.exitOverride();
  registerBranchCommands(program);
  return program;
}

describe('registerBranchCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('branches list', () => {
    it('prints table when branches exist', async () => {
      mockClient.listBranches.mockResolvedValue({
        branches: [
          {
            branch_id: 'br_1',
            name: 'main',
            head_commit_hash: 'sha256:abc123456789',
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'branches', 'list', '-p', 'proj_1']);

      expect(mockClient.listBranches).toHaveBeenCalledWith('proj_1');
      expect(mockSpinner.stop).toHaveBeenCalled();
    });

    it('prints message when no branches', async () => {
      mockClient.listBranches.mockResolvedValue({ branches: [] });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'branches', 'list', '-p', 'proj_1']);

      expect(console.log).toHaveBeenCalledWith('No branches found.');
    });

    it('handles error', async () => {
      mockClient.listBranches.mockRejectedValue(new Error('Network error'));

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'branches', 'list', '-p', 'proj_1']);

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('handles null head_commit_hash', async () => {
      mockClient.listBranches.mockResolvedValue({
        branches: [
          {
            branch_id: 'br_1',
            name: 'empty',
            head_commit_hash: null,
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'branches', 'list', '-p', 'proj_1']);

      expect(mockSpinner.stop).toHaveBeenCalled();
    });
  });

  describe('branches create', () => {
    it('creates branch', async () => {
      mockClient.createBranch.mockResolvedValue({ branch_id: 'br_2', name: 'feature' });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'branches', 'create', 'feature', '-p', 'proj_1']);

      expect(mockClient.createBranch).toHaveBeenCalledWith({
        project_id: 'proj_1',
        name: 'feature',
        head_commit_hash: undefined,
      });
    });

    it('creates branch with head commit', async () => {
      mockClient.createBranch.mockResolvedValue({ branch_id: 'br_2', name: 'fix' });

      const program = createProgram();
      await program.parseAsync([
        'node',
        'test',
        'branches',
        'create',
        'fix',
        '-p',
        'proj_1',
        '-h',
        'sha256:abc',
      ]);

      expect(mockClient.createBranch).toHaveBeenCalledWith({
        project_id: 'proj_1',
        name: 'fix',
        head_commit_hash: 'sha256:abc',
      });
    });

    it('handles error', async () => {
      mockClient.createBranch.mockRejectedValue(new Error('Already exists'));

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'branches', 'create', 'dup', '-p', 'proj_1']);

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('branches switch', () => {
    it('switches branch', async () => {
      mockClient.switchBranch.mockResolvedValue({ name: 'dev' });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'branches', 'switch', 'dev', '-p', 'proj_1']);

      expect(mockClient.switchBranch).toHaveBeenCalledWith('proj_1', 'dev');
    });

    it('handles error', async () => {
      mockClient.switchBranch.mockRejectedValue(new Error('Not found'));

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'branches', 'switch', 'missing', '-p', 'proj_1']);

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('branches current', () => {
    it('shows current branch', async () => {
      mockClient.getCurrentBranch.mockResolvedValue({
        branch_id: 'br_1',
        name: 'main',
        head_commit_hash: 'sha256:deadbeef1234',
      });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'branches', 'current', '-p', 'proj_1']);

      expect(mockClient.getCurrentBranch).toHaveBeenCalledWith('proj_1');
      expect(mockSpinner.stop).toHaveBeenCalled();
    });

    it('handles null head hash', async () => {
      mockClient.getCurrentBranch.mockResolvedValue({
        branch_id: 'br_1',
        name: 'empty',
        head_commit_hash: null,
      });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'branches', 'current', '-p', 'proj_1']);

      expect(mockSpinner.stop).toHaveBeenCalled();
    });

    it('handles error', async () => {
      mockClient.getCurrentBranch.mockRejectedValue(new Error('Failed'));

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'branches', 'current', '-p', 'proj_1']);

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
});
