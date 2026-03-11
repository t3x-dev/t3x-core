/**
 * CLI Import Commands Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock node:fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

import * as fs from 'node:fs';

// Mock @t3x-dev/api-client
const mockClient = {
  importUrl: vi.fn(),
  importDocument: vi.fn(),
  importPlatform: vi.fn(),
  createConversation: vi.fn(),
  createTurn: vi.fn(),
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
vi.spyOn(console, 'warn').mockImplementation(() => {});

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

const mockExistsSync = vi.mocked(fs.existsSync);
const mockStatSync = vi.mocked(fs.statSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);

import { Command } from 'commander';
import { registerImportCommands } from '../../commands/import.js';

function createProgram() {
  const program = new Command();
  program.exitOverride();
  registerImportCommands(program);
  return program;
}

describe('registerImportCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('import local (single file)', () => {
    it('imports a file with paragraph splitting', async () => {
      const testContent = 'First paragraph.\n\nSecond paragraph.\n\nThird.';

      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as fs.Stats);
      mockReadFileSync.mockReturnValue(testContent);

      mockClient.createConversation.mockResolvedValue({
        conversation_id: 'conv_abc',
        title: 'product spec',
      });
      mockClient.createTurn
        .mockResolvedValueOnce({ turn_hash: 'sha256:t1' })
        .mockResolvedValueOnce({ turn_hash: 'sha256:t2' })
        .mockResolvedValueOnce({ turn_hash: 'sha256:t3' });

      const program = createProgram();
      await program.parseAsync([
        'node',
        'test',
        'import',
        'local',
        'product-spec.md',
        '-p',
        'proj_test',
      ]);

      expect(mockClient.createConversation).toHaveBeenCalledWith({
        project_id: 'proj_test',
        title: 'product spec',
      });
      expect(mockClient.createTurn).toHaveBeenCalledTimes(3);
      expect(mockSpinner.stop).toHaveBeenCalled();
    });

    it('uses custom conversation name', async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as fs.Stats);
      mockReadFileSync.mockReturnValue('Content.');

      mockClient.createConversation.mockResolvedValue({
        conversation_id: 'conv_xyz',
      });
      mockClient.createTurn.mockResolvedValue({ turn_hash: 'sha256:t1' });

      const program = createProgram();
      await program.parseAsync([
        'node',
        'test',
        'import',
        'local',
        'file.md',
        '-p',
        'proj_test',
        '-c',
        'My Custom Name',
      ]);

      expect(mockClient.createConversation).toHaveBeenCalledWith({
        project_id: 'proj_test',
        title: 'My Custom Name',
      });
    });

    it('exits with error for non-existent file', async () => {
      mockExistsSync.mockReturnValue(false);

      const program = createProgram();
      await program.parseAsync([
        'node',
        'test',
        'import',
        'local',
        'missing.md',
        '-p',
        'proj_test',
      ]);

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('exits with error on API failure', async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as fs.Stats);
      mockReadFileSync.mockReturnValue('Content.');

      mockClient.createConversation.mockRejectedValue(new Error('Connection refused'));

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'import', 'local', 'file.md', '-p', 'proj_test']);

      expect(mockSpinner.stop).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('import local (directory)', () => {
    it('imports a directory of files', async () => {
      mockExistsSync.mockReturnValue(true);

      // First call: check the directory path
      // Subsequent calls: check individual files
      let statCallCount = 0;
      mockStatSync.mockImplementation(() => {
        statCallCount++;
        if (statCallCount === 1) {
          // The directory itself (from the action handler)
          return { isFile: () => false, isDirectory: () => true } as fs.Stats;
        }
        if (statCallCount === 2) {
          // collectFiles checks isDirectory
          return { isDirectory: () => true } as fs.Stats;
        }
        // Individual files inside importFile
        return { isFile: () => true, isDirectory: () => false } as fs.Stats;
      });

      mockReaddirSync.mockReturnValue([
        { name: 'file1.md', isFile: () => true, isDirectory: () => false },
        { name: 'file2.txt', isFile: () => true, isDirectory: () => false },
      ] as unknown as fs.Dirent[]);

      mockReadFileSync.mockReturnValue('Paragraph one.\n\nParagraph two.');

      mockClient.createConversation
        .mockResolvedValueOnce({ conversation_id: 'conv_1' })
        .mockResolvedValueOnce({ conversation_id: 'conv_2' });
      mockClient.createTurn.mockResolvedValue({ turn_hash: 'sha256:t1' });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'import', 'local', '/tmp/docs', '-p', 'proj_test']);

      expect(mockClient.createConversation).toHaveBeenCalledTimes(2);
      // 2 paragraphs per file, 2 files = 4 turns
      expect(mockClient.createTurn).toHaveBeenCalledTimes(4);
    });

    it('exits with error when no importable files found', async () => {
      mockExistsSync.mockReturnValue(true);

      mockStatSync.mockReturnValue({
        isFile: () => false,
        isDirectory: () => true,
      } as fs.Stats);

      mockReaddirSync.mockReturnValue([
        { name: 'image.png', isFile: () => true, isDirectory: () => false },
      ] as unknown as fs.Dirent[]);

      const program = createProgram();
      await program.parseAsync([
        'node',
        'test',
        'import',
        'local',
        '/tmp/empty',
        '-p',
        'proj_test',
      ]);

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('import url', () => {
    it('imports from URL', async () => {
      mockClient.importUrl.mockResolvedValue({
        conversation_id: 'conv_url',
        turns_imported: 10,
      });

      const program = createProgram();
      await program.parseAsync([
        'node',
        'test',
        'import',
        'url',
        'https://example.com/doc',
        '-p',
        'proj_test',
      ]);

      expect(mockClient.importUrl).toHaveBeenCalledWith({
        url: 'https://example.com/doc',
        project_id: 'proj_test',
      });
      expect(mockSpinner.stop).toHaveBeenCalled();
    });

    it('handles URL import error', async () => {
      mockClient.importUrl.mockRejectedValue(new Error('Network error'));

      const program = createProgram();
      await program.parseAsync([
        'node',
        'test',
        'import',
        'url',
        'https://example.com/bad',
        '-p',
        'proj_test',
      ]);

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
});
