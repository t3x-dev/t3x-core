import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@t3x-dev/api-client', () => ({
  createClient: vi.fn(() => ({
    extract: vi.fn().mockResolvedValue({
      conversation_id: 'conv_test',
      draft_id: 'draft_test',
      sentences: [{ id: 's_1', text: 'Test sentence', confidence: 0.9 }],
    }),
    check: vi.fn().mockResolvedValue({ passed: true, violations: [] }),
    context: vi.fn().mockResolvedValue({
      commit_hash: 'sha256:abc',
      branch: 'main',
      sentences: [],
    }),
    generateLeaf: vi.fn().mockResolvedValue({ output: 'Generated text' }),
    commitFromDraft: vi
      .fn()
      .mockResolvedValue({ commit_hash: 'sha256:def', sentence_count: 3, branch: 'main' }),
  })),
}));

import { handleCheck } from '../tools/check.js';
import { handleCommit } from '../tools/commit.js';
import { handleExtract } from '../tools/extract.js';
import { handleGenerate } from '../tools/generate.js';
import { handleShow } from '../tools/show.js';

beforeEach(() => {
  // Reset the singleton client between tests so each test gets a fresh mock
  vi.resetModules();
});

describe('handleExtract', () => {
  it('returns extraction result with conversation_id, draft_id, and sentences', async () => {
    const result = await handleExtract({ project_id: 'proj_test', text: 'Hello world' });
    const data = JSON.parse(result.content[0].text);

    expect(data.conversation_id).toBe('conv_test');
    expect(data.draft_id).toBe('draft_test');
    expect(Array.isArray(data.sentences)).toBe(true);
    expect(data.sentences[0].id).toBe('s_1');
    expect(data.sentences[0].confidence).toBe(0.9);
  });
});

describe('handleCommit', () => {
  it('returns commit result with commit_hash, sentence_count, and branch', async () => {
    const result = await handleCommit({
      project_id: 'proj_test',
      draft_id: 'draft_test',
      message: 'Initial commit',
    });
    const data = JSON.parse(result.content[0].text);

    expect(data.commit_hash).toBe('sha256:def');
    expect(data.sentence_count).toBe(3);
    expect(data.branch).toBe('main');
  });
});

describe('handleCheck', () => {
  it('returns check result with passed flag and violations array', async () => {
    const result = await handleCheck({ project_id: 'proj_test', text: 'Some text to validate' });
    const data = JSON.parse(result.content[0].text);

    expect(data.passed).toBe(true);
    expect(Array.isArray(data.violations)).toBe(true);
    expect(data.violations).toHaveLength(0);
  });
});

describe('handleGenerate', () => {
  it('returns generated output text', async () => {
    const result = await handleGenerate({ leaf_id: 'leaf_test' });
    const data = JSON.parse(result.content[0].text);

    expect(data.output).toBe('Generated text');
  });
});

describe('handleShow', () => {
  it('returns context with commit_hash, branch, and sentences', async () => {
    const result = await handleShow({ project_id: 'proj_test' });
    const data = JSON.parse(result.content[0].text);

    expect(data.commit_hash).toBe('sha256:abc');
    expect(data.branch).toBe('main');
    expect(Array.isArray(data.sentences)).toBe(true);
  });
});
