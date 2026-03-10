/**
 * CLI Project Commands Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @t3x-dev/api-client
const mockClient = {
  listProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
};

vi.mock('@t3x-dev/api-client', () => ({
  createClient: vi.fn(() => mockClient),
}));

// Mock ora spinner
const mockSpinner = { start: vi.fn(), stop: vi.fn(), succeed: vi.fn(), fail: vi.fn() };
vi.mock('ora', () => ({
  default: vi.fn(() => mockSpinner),
}));

// Silence console
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

import { Command } from 'commander';
import { registerProjectCommands } from '../../commands/projects.js';

function createProgram() {
  const program = new Command();
  program.exitOverride(); // Prevent actual exit
  registerProjectCommands(program);
  return program;
}

describe('registerProjectCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('projects list', () => {
    it('prints table when projects exist', async () => {
      mockClient.listProjects.mockResolvedValue({
        projects: [{ project_id: 'proj_1', name: 'Test', created_at: '2024-01-01T00:00:00Z' }],
      });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'projects', 'list']);

      expect(mockClient.listProjects).toHaveBeenCalledWith({ limit: 100, offset: 0 });
      expect(mockSpinner.stop).toHaveBeenCalled();
    });

    it('prints message when no projects', async () => {
      mockClient.listProjects.mockResolvedValue({ projects: [] });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'projects', 'list']);

      expect(console.log).toHaveBeenCalledWith('No projects found.');
    });

    it('handles error', async () => {
      mockClient.listProjects.mockRejectedValue(new Error('Connection refused'));

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'projects', 'list']);

      expect(mockSpinner.stop).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('passes pagination options', async () => {
      mockClient.listProjects.mockResolvedValue({ projects: [] });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'projects', 'list', '-l', '10', '-o', '5']);

      expect(mockClient.listProjects).toHaveBeenCalledWith({ limit: 10, offset: 5 });
    });
  });

  describe('projects get', () => {
    it('prints project details', async () => {
      mockClient.getProject.mockResolvedValue({
        project_id: 'proj_1',
        name: 'My Project',
        created_at: '2024-01-01T00:00:00Z',
        conversations_count: 5,
        turns_count: 42,
        commits_count: 10,
        branches_count: 2,
        drafts_count: 1,
      });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'projects', 'get', 'proj_1']);

      expect(mockClient.getProject).toHaveBeenCalledWith('proj_1');
      expect(mockSpinner.stop).toHaveBeenCalled();
    });

    it('handles error', async () => {
      mockClient.getProject.mockRejectedValue(new Error('Not found'));

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'projects', 'get', 'proj_bad']);

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('projects create', () => {
    it('creates project', async () => {
      mockClient.createProject.mockResolvedValue({ project_id: 'proj_new' });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'projects', 'create', 'New Project']);

      expect(mockClient.createProject).toHaveBeenCalledWith({ name: 'New Project' });
    });

    it('handles error', async () => {
      mockClient.createProject.mockRejectedValue(new Error('Conflict'));

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'projects', 'create', 'Dup']);

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('projects delete', () => {
    it('requires --force flag', async () => {
      const program = createProgram();
      await program.parseAsync(['node', 'test', 'projects', 'delete', 'proj_1']);

      expect(console.log).toHaveBeenCalledWith('Use --force to confirm deletion');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('deletes with --force', async () => {
      mockClient.deleteProject.mockResolvedValue(undefined);

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'projects', 'delete', 'proj_1', '--force']);

      expect(mockClient.deleteProject).toHaveBeenCalledWith('proj_1');
    });

    it('handles error', async () => {
      mockClient.deleteProject.mockRejectedValue(new Error('Failed'));

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'projects', 'delete', 'proj_1', '-f']);

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
});
