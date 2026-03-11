/**
 * CLI Commit Commands Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockClient = {
  listCommits: vi.fn(),
  getCommit: vi.fn(),
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
import { registerCommitCommands } from '../../commands/commits.js';

function createProgram() {
  const program = new Command();
  program.exitOverride();
  registerCommitCommands(program);
  return program;
}

describe('registerCommitCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('commits list', () => {
    it('prints table when commits exist', async () => {
      mockClient.listCommits.mockResolvedValue({
        commits: [
          {
            commit_hash: 'sha256:abcdef123456',
            branch: 'main',
            message: 'Initial commit',
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'commits', 'list', '-p', 'proj_1']);

      expect(mockClient.listCommits).toHaveBeenCalledWith('proj_1', undefined, {
        limit: 50,
        offset: 0,
      });
      expect(mockSpinner.stop).toHaveBeenCalled();
    });

    it('prints message when no commits', async () => {
      mockClient.listCommits.mockResolvedValue({ commits: [] });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'commits', 'list', '-p', 'proj_1']);

      expect(console.log).toHaveBeenCalledWith('No commits found.');
    });

    it('passes branch filter', async () => {
      mockClient.listCommits.mockResolvedValue({ commits: [] });

      const program = createProgram();
      await program.parseAsync([
        'node',
        'test',
        'commits',
        'list',
        '-p',
        'proj_1',
        '-b',
        'feature',
      ]);

      expect(mockClient.listCommits).toHaveBeenCalledWith('proj_1', 'feature', {
        limit: 50,
        offset: 0,
      });
    });

    it('passes pagination options', async () => {
      mockClient.listCommits.mockResolvedValue({ commits: [] });

      const program = createProgram();
      await program.parseAsync([
        'node',
        'test',
        'commits',
        'list',
        '-p',
        'proj_1',
        '-l',
        '10',
        '-o',
        '20',
      ]);

      expect(mockClient.listCommits).toHaveBeenCalledWith('proj_1', undefined, {
        limit: 10,
        offset: 20,
      });
    });

    it('handles error', async () => {
      mockClient.listCommits.mockRejectedValue(new Error('DB error'));

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'commits', 'list', '-p', 'proj_1']);

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('commits show', () => {
    it('shows commit details', async () => {
      mockClient.getCommit.mockResolvedValue({
        commit_hash: 'sha256:abcdef123456',
        branch: 'main',
        message: 'Test commit',
        created_at: '2024-01-01T00:00:00Z',
        parent_hashes: ['sha256:parent111111'],
        turn_window: {
          start_turn_hash: 'sha256:start111111',
          end_turn_hash: 'sha256:end222222',
        },
      });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'commits', 'show', 'sha256:abcdef123456']);

      expect(mockClient.getCommit).toHaveBeenCalledWith('sha256:abcdef123456');
      expect(mockSpinner.stop).toHaveBeenCalled();
    });

    it('shows root commit (no parents)', async () => {
      mockClient.getCommit.mockResolvedValue({
        commit_hash: 'sha256:root000000',
        branch: 'main',
        message: 'Root',
        created_at: '2024-01-01T00:00:00Z',
        parent_hashes: [],
        turn_window: {
          start_turn_hash: 'sha256:start111111',
          end_turn_hash: 'sha256:end222222',
        },
      });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'commits', 'show', 'sha256:root000000']);

      expect(console.log).toHaveBeenCalledWith('  (root commit)');
    });

    it('handles error', async () => {
      mockClient.getCommit.mockRejectedValue(new Error('Not found'));

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'commits', 'show', 'sha256:bad']);

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
});
