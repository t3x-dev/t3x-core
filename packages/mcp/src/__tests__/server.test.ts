import { describe, expect, it, vi } from 'vitest';

// Mock the DB module so tools don't try to connect to a real database
vi.mock('../db.js', () => ({
  getDB: vi.fn(() => Promise.resolve({})),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock @t3x-dev/storage to avoid real DB calls during import
vi.mock('@t3x-dev/storage', () => ({
  findProjects: vi.fn(),
  findProjectById: vi.fn(),
  findDraftById: vi.fn(),
  listDraftsByProject: vi.fn(),
  findAgentDraftById: vi.fn(),
  findAgentDraftsByProject: vi.fn(),
  findBranchesByProject: vi.fn(),
  findConversationById: vi.fn(),
  findConversationsByProject: vi.fn(),
  findLeafById: vi.fn(),
  findLeavesByProject: vi.fn(),
  findLeavesByCommit: vi.fn(),
  findPinById: vi.fn(),
  findPinsByProject: vi.fn(),
  findTurnsByConversation: vi.fn(),
  getCommit: vi.fn(),
  getCommitUnified: vi.fn(),
  listCommits: vi.fn(),
  insertProject: vi.fn(),
  insertBranch: vi.fn(),
  insertConversation: vi.fn(),
  insertTurn: vi.fn(),
  insertDraft: vi.fn(),
  updateDraft: vi.fn(),
  commitDraft: vi.fn(),
  createCommit: vi.fn(),
  createPin: vi.fn(),
  deletePin: vi.fn(),
  createMergeDraft: vi.fn(),
  getMergeDraft: vi.fn(),
  updateMergeDraft: vi.fn(),
  cancelMergeDraft: vi.fn(),
  updateLeaf: vi.fn(),
  updateLeafOutput: vi.fn(),
}));

// Mock @t3x-dev/core to avoid loading heavy modules
vi.mock('@t3x-dev/core', () => ({
  diffCommits: vi.fn(),
  prepareMerge: vi.fn(),
  executeMerge: vi.fn(),
  Extractor: vi.fn(),
  GateRunner: vi.fn(),
  runTransforms: vi.fn(),
  createDefaultProviderRegistry: vi.fn(() => ({
    tryWithFallback: vi.fn(),
  })),
  extractAndApply: vi.fn(),
  DEFAULT_STYLE: {},
  collectLessonsFromAssertions: vi.fn(() => []),
  generateLeafOutput: vi.fn(),
}));

import { createMcpServer } from '../server.js';

describe('createMcpServer', () => {
  it('returns a server instance and tools array', () => {
    const { server, tools } = createMcpServer({ toolsets: ['core'] });

    expect(server).toBeDefined();
    expect(tools).toBeDefined();
    expect(Array.isArray(tools)).toBe(true);
  });

  it('core toolset provides exactly 5 tools', () => {
    const { tools } = createMcpServer({ toolsets: ['core'] });

    expect(tools).toHaveLength(5);
  });

  it('core toolset includes the correct tool names', () => {
    const { tools } = createMcpServer({ toolsets: ['core'] });
    const names = tools.map((t) => t.name);

    expect(names).toContain('t3x_query');
    expect(names).toContain('t3x_commit');
    expect(names).toContain('t3x_edit');
    expect(names).toContain('t3x_extract');
    expect(names).toContain('t3x_generate');
  });

  it('core toolset does not include advanced tools', () => {
    const { tools } = createMcpServer({ toolsets: ['core'] });
    const names = tools.map((t) => t.name);

    expect(names).not.toContain('t3x_diff');
    expect(names).not.toContain('t3x_merge');
    expect(names).not.toContain('t3x_admin');
  });

  it('core + advanced toolsets provide exactly 8 tools', () => {
    const { tools } = createMcpServer({ toolsets: ['core', 'advanced'] });

    expect(tools).toHaveLength(8);
  });

  it('core + advanced toolsets include all tool names', () => {
    const { tools } = createMcpServer({ toolsets: ['core', 'advanced'] });
    const names = tools.map((t) => t.name);

    expect(names).toContain('t3x_query');
    expect(names).toContain('t3x_commit');
    expect(names).toContain('t3x_edit');
    expect(names).toContain('t3x_extract');
    expect(names).toContain('t3x_generate');
    expect(names).toContain('t3x_diff');
    expect(names).toContain('t3x_merge');
    expect(names).toContain('t3x_admin');
  });

  it('advanced-only toolset provides exactly 3 tools', () => {
    const { tools } = createMcpServer({ toolsets: ['advanced'] });

    expect(tools).toHaveLength(3);
    const names = tools.map((t) => t.name);
    expect(names).toContain('t3x_diff');
    expect(names).toContain('t3x_merge');
    expect(names).toContain('t3x_admin');
  });

  it('duplicate toolsets do not produce duplicate tools', () => {
    const { tools } = createMcpServer({ toolsets: ['core', 'core', 'advanced'] });

    expect(tools).toHaveLength(8);
    const names = tools.map((t) => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(8);
  });

  it('every tool has a name, description, and inputSchema', () => {
    const { tools } = createMcpServer({ toolsets: ['core', 'advanced'] });

    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('empty toolsets array produces zero tools', () => {
    const { tools } = createMcpServer({ toolsets: [] });

    expect(tools).toHaveLength(0);
  });
});
