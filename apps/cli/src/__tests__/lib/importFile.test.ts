/**
 * Tests for local file import utilities.
 */

import type { T3xClient } from '@t3x/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock node:fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

import * as fs from 'node:fs';

import {
  collectFiles,
  deriveTitle,
  detectFormat,
  importDirectory,
  importFile,
  splitToParagraphs,
} from '../../lib/importFile.js';

const mockExistsSync = vi.mocked(fs.existsSync);
const mockStatSync = vi.mocked(fs.statSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);

// ── Pure function tests (no mocking needed) ──

describe('splitToParagraphs', () => {
  it('splits on double newlines', () => {
    const content = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
    const result = splitToParagraphs(content);
    expect(result).toEqual(['First paragraph.', 'Second paragraph.', 'Third paragraph.']);
  });

  it('handles blank lines with whitespace', () => {
    const content = 'Paragraph one.\n  \n  \nParagraph two.';
    const result = splitToParagraphs(content);
    expect(result).toEqual(['Paragraph one.', 'Paragraph two.']);
  });

  it('filters out empty paragraphs', () => {
    const content = '\n\n\nHello.\n\n\n\nWorld.\n\n\n';
    const result = splitToParagraphs(content);
    expect(result).toEqual(['Hello.', 'World.']);
  });

  it('trims whitespace from paragraphs', () => {
    const content = '  Hello world.  \n\n  Another paragraph.  ';
    const result = splitToParagraphs(content);
    expect(result).toEqual(['Hello world.', 'Another paragraph.']);
  });

  it('returns empty array for empty content', () => {
    expect(splitToParagraphs('')).toEqual([]);
    expect(splitToParagraphs('   ')).toEqual([]);
    expect(splitToParagraphs('\n\n\n')).toEqual([]);
  });

  it('handles single paragraph with no breaks', () => {
    const content = 'Just one paragraph with no breaks.';
    const result = splitToParagraphs(content);
    expect(result).toEqual(['Just one paragraph with no breaks.']);
  });

  it('preserves single newlines within paragraphs', () => {
    const content = 'Line one.\nLine two.\n\nSecond paragraph.';
    const result = splitToParagraphs(content);
    expect(result).toEqual(['Line one.\nLine two.', 'Second paragraph.']);
  });
});

describe('detectFormat', () => {
  it('detects markdown files', () => {
    expect(detectFormat('readme.md')).toBe('markdown');
    expect(detectFormat('doc.mdx')).toBe('markdown');
    expect(detectFormat('notes.markdown')).toBe('markdown');
  });

  it('detects text files', () => {
    expect(detectFormat('notes.txt')).toBe('text');
    expect(detectFormat('readme.text')).toBe('text');
  });

  it('detects PDF files', () => {
    expect(detectFormat('report.pdf')).toBe('pdf');
  });

  it('detects HTML files as text', () => {
    expect(detectFormat('page.html')).toBe('text');
    expect(detectFormat('page.htm')).toBe('text');
  });

  it('defaults to text for unknown extensions', () => {
    expect(detectFormat('data.csv')).toBe('text');
    expect(detectFormat('noext')).toBe('text');
  });

  it('handles uppercase extensions', () => {
    expect(detectFormat('README.MD')).toBe('markdown');
    expect(detectFormat('NOTES.TXT')).toBe('text');
  });
});

describe('deriveTitle', () => {
  it('removes extension', () => {
    expect(deriveTitle('product-spec.md')).toBe('product spec');
  });

  it('replaces dashes and underscores with spaces', () => {
    expect(deriveTitle('my-cool_document.txt')).toBe('my cool document');
  });

  it('handles paths with directories', () => {
    expect(deriveTitle('/home/user/docs/notes.md')).toBe('notes');
  });

  it('handles files with multiple dots', () => {
    expect(deriveTitle('file.test.md')).toBe('file.test');
  });

  it('handles files without extensions', () => {
    expect(deriveTitle('README')).toBe('README');
  });
});

// ── Integration tests (mock fs and API client) ──

describe('importFile', () => {
  const mockClient = {
    createConversation: vi.fn(),
    createTurn: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('imports a file as a conversation with turns', async () => {
    const testContent = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
    const testPath = '/tmp/test-import/product-spec.md';

    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isFile: () => true } as fs.Stats);
    mockReadFileSync.mockReturnValue(testContent);

    mockClient.createConversation.mockResolvedValue({
      conversation_id: 'conv_abc123',
      project_id: 'proj_test',
      title: 'product spec',
      created_at: '2026-01-01T00:00:00Z',
    });

    mockClient.createTurn
      .mockResolvedValueOnce({ turn_hash: 'sha256:turn1' })
      .mockResolvedValueOnce({ turn_hash: 'sha256:turn2' })
      .mockResolvedValueOnce({ turn_hash: 'sha256:turn3' });

    const result = await importFile(mockClient as unknown as T3xClient, 'proj_test', testPath, {
      format: 'markdown',
    });

    expect(result).toEqual({
      conversationId: 'conv_abc123',
      conversationTitle: 'product spec',
      turnCount: 3,
      filePath: testPath,
    });

    expect(mockClient.createConversation).toHaveBeenCalledWith({
      project_id: 'proj_test',
      title: 'product spec',
    });

    // Verify turns are created with correct parent chaining
    expect(mockClient.createTurn).toHaveBeenCalledTimes(3);
    expect(mockClient.createTurn).toHaveBeenNthCalledWith(1, {
      conversation_id: 'conv_abc123',
      role: 'user',
      content: 'First paragraph.',
      parent_turn_hash: undefined,
    });
    expect(mockClient.createTurn).toHaveBeenNthCalledWith(2, {
      conversation_id: 'conv_abc123',
      role: 'user',
      content: 'Second paragraph.',
      parent_turn_hash: 'sha256:turn1',
    });
    expect(mockClient.createTurn).toHaveBeenNthCalledWith(3, {
      conversation_id: 'conv_abc123',
      role: 'user',
      content: 'Third paragraph.',
      parent_turn_hash: 'sha256:turn2',
    });
  });

  it('uses custom conversation name when provided', async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isFile: () => true } as fs.Stats);
    mockReadFileSync.mockReturnValue('Content here.');

    mockClient.createConversation.mockResolvedValue({
      conversation_id: 'conv_xyz',
    });
    mockClient.createTurn.mockResolvedValue({ turn_hash: 'sha256:t1' });

    const result = await importFile(
      mockClient as unknown as T3xClient,
      'proj_test',
      '/tmp/file.md',
      { conversationName: 'My Custom Name' }
    );

    expect(result.conversationTitle).toBe('My Custom Name');
    expect(mockClient.createConversation).toHaveBeenCalledWith({
      project_id: 'proj_test',
      title: 'My Custom Name',
    });
  });

  it('throws for non-existent file', async () => {
    mockExistsSync.mockReturnValue(false);

    await expect(
      importFile(mockClient as unknown as T3xClient, 'proj_test', '/tmp/nope.md', {})
    ).rejects.toThrow('File not found');
  });

  it('throws for empty file', async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isFile: () => true } as fs.Stats);
    mockReadFileSync.mockReturnValue('');

    await expect(
      importFile(mockClient as unknown as T3xClient, 'proj_test', '/tmp/empty.md', {})
    ).rejects.toThrow('No content found');
  });

  it('auto-detects format from extension', async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isFile: () => true } as fs.Stats);
    mockReadFileSync.mockReturnValue('Some content.');

    mockClient.createConversation.mockResolvedValue({ conversation_id: 'conv_1' });
    mockClient.createTurn.mockResolvedValue({ turn_hash: 'sha256:t1' });

    await importFile(mockClient as unknown as T3xClient, 'proj_test', '/tmp/test.txt', {
      format: 'auto',
    });

    // readFileSync should be called with utf-8 for text files
    expect(mockReadFileSync).toHaveBeenCalledWith(expect.any(String), 'utf-8');
  });
});

describe('collectFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws for non-existent directory', () => {
    mockExistsSync.mockReturnValue(false);

    expect(() => collectFiles('/tmp/nodir', false)).toThrow('Directory not found');
  });

  it('throws for non-directory path', () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({
      isDirectory: () => false,
    } as fs.Stats);

    expect(() => collectFiles('/tmp/file.txt', false)).toThrow('Not a directory');
  });

  it('collects files with supported extensions', () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);

    mockReaddirSync.mockReturnValue([
      { name: 'readme.md', isFile: () => true, isDirectory: () => false },
      { name: 'notes.txt', isFile: () => true, isDirectory: () => false },
      { name: 'image.png', isFile: () => true, isDirectory: () => false },
      { name: 'data.json', isFile: () => true, isDirectory: () => false },
    ] as unknown as fs.Dirent[]);

    const files = collectFiles('/tmp/docs', false);

    expect(files).toHaveLength(2);
    expect(files[0]).toContain('notes.txt');
    expect(files[1]).toContain('readme.md');
  });

  it('skips subdirectories when not recursive', () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);

    mockReaddirSync.mockReturnValue([
      { name: 'file.md', isFile: () => true, isDirectory: () => false },
      { name: 'subdir', isFile: () => false, isDirectory: () => true },
    ] as unknown as fs.Dirent[]);

    const files = collectFiles('/tmp/docs', false);

    expect(files).toHaveLength(1);
    expect(files[0]).toContain('file.md');
  });
});

describe('importDirectory', () => {
  const mockClient = {
    createConversation: vi.fn(),
    createTurn: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when no importable files found', async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);
    mockReaddirSync.mockReturnValue([]);

    await expect(
      importDirectory(mockClient as unknown as T3xClient, 'proj_test', '/tmp/empty', {})
    ).rejects.toThrow('No importable files');
  });
});
