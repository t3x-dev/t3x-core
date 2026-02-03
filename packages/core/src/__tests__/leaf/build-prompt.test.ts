/**
 * Tests for Leaf Prompt Builder
 *
 * @see packages/core/src/leaf/build-prompt.ts
 */

import { describe, expect, it } from 'vitest';
import {
  buildLeafPrompt,
  buildSystemPrompt,
  formatConstraints,
  getTypeInstructions,
} from '../../leaf/build-prompt';
import type { CommitV4, Constraint, Leaf } from '../../types/v4';

// ═══════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════════════════

const createTestCommit = (sentences: string[]): CommitV4 => ({
  hash: 'sha256:test-hash',
  schema: 't3x/commit/v4',
  parents: [],
  author: { type: 'human', name: 'Test User' },
  committed_at: new Date().toISOString(),
  content: {
    sentences: sentences.map((text, i) => ({
      id: `s_${i}`,
      text,
    })),
  },
});

const createTestLeaf = (
  type: Leaf['type'],
  constraints: Constraint[] = [],
  title?: string
): Leaf => ({
  id: 'leaf_test',
  commit_hash: 'sha256:test-hash',
  type,
  title,
  constraints,
  config: {},
  project_id: 'proj_test',
  created_at: new Date().toISOString(),
});

// ═══════════════════════════════════════════════════════════════════════════
// getTypeInstructions Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('getTypeInstructions', () => {
  it('returns tweet instructions with 280 char limit', () => {
    const instructions = getTypeInstructions('tweet');
    expect(instructions).toContain('280 characters');
    expect(instructions).toContain('Twitter');
  });

  it('returns weibo instructions in Chinese context', () => {
    const instructions = getTypeInstructions('weibo');
    expect(instructions).toContain('Chinese');
    expect(instructions).toContain('微博');
  });

  it('returns wechat instructions', () => {
    const instructions = getTypeInstructions('wechat');
    expect(instructions).toContain('WeChat');
    expect(instructions).toContain('微信');
  });

  it('returns article instructions with headings', () => {
    const instructions = getTypeInstructions('article');
    expect(instructions).toContain('headings');
    expect(instructions).toContain('title');
  });

  it('returns email instructions with greeting and sign-off', () => {
    const instructions = getTypeInstructions('email');
    expect(instructions).toContain('greeting');
    expect(instructions).toContain('sign-off');
  });

  it('returns slack instructions', () => {
    const instructions = getTypeInstructions('slack');
    expect(instructions).toContain('Slack');
    expect(instructions.toLowerCase()).toContain('conversational');
  });

  it('returns deploy_agent instructions', () => {
    const instructions = getTypeInstructions('deploy_agent');
    expect(instructions).toContain('agent');
  });

  it('returns eval instructions', () => {
    const instructions = getTypeInstructions('eval');
    expect(instructions).toContain('evaluation');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// formatConstraints Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('formatConstraints', () => {
  it('formats REQUIRE constraints with "MUST include EXACTLY" for exact match', () => {
    const constraints: Constraint[] = [
      { id: 'cst_1', type: 'require', match_mode: 'exact', value: 'dark mode' },
    ];
    const result = formatConstraints(constraints);
    expect(result.requires).toHaveLength(1);
    expect(result.requires[0]).toContain('MUST include EXACTLY');
    expect(result.requires[0]).toContain('dark mode');
  });

  it('formats REQUIRE constraints with "semantically" for semantic match', () => {
    const constraints: Constraint[] = [
      { id: 'cst_1', type: 'require', match_mode: 'semantic', value: 'user preferences' },
    ];
    const result = formatConstraints(constraints);
    expect(result.requires[0]).toContain('MUST include semantically');
    expect(result.requires[0]).toContain('user preferences');
  });

  it('formats EXCLUDE constraints with "MUST NOT include"', () => {
    const constraints: Constraint[] = [
      { id: 'cst_1', type: 'exclude', match_mode: 'exact', value: 'light mode' },
    ];
    const result = formatConstraints(constraints);
    expect(result.excludes).toHaveLength(1);
    expect(result.excludes[0]).toContain('MUST NOT include');
    expect(result.excludes[0]).toContain('light mode');
  });

  it('includes reason for EXCLUDE constraints when provided', () => {
    const constraints: Constraint[] = [
      {
        id: 'cst_1',
        type: 'exclude',
        match_mode: 'semantic',
        value: 'competitor mention',
        reason: 'Brand policy',
      },
    ];
    const result = formatConstraints(constraints);
    expect(result.excludes[0]).toContain('Reason: Brand policy');
  });

  it('separates requires and excludes correctly', () => {
    const constraints: Constraint[] = [
      { id: 'cst_1', type: 'require', match_mode: 'exact', value: 'value1' },
      { id: 'cst_2', type: 'exclude', match_mode: 'exact', value: 'value2' },
      { id: 'cst_3', type: 'require', match_mode: 'semantic', value: 'value3' },
    ];
    const result = formatConstraints(constraints);
    expect(result.requires).toHaveLength(2);
    expect(result.excludes).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildSystemPrompt Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('buildSystemPrompt', () => {
  it('includes content generation assistant role', () => {
    const prompt = buildSystemPrompt('tweet');
    expect(prompt).toContain('content generation assistant');
  });

  it('includes key principles', () => {
    const prompt = buildSystemPrompt('article');
    expect(prompt).toContain('source material');
    expect(prompt).toContain('constraints');
  });

  it('includes type-specific instructions', () => {
    const tweetPrompt = buildSystemPrompt('tweet');
    expect(tweetPrompt).toContain('280 characters');

    const articlePrompt = buildSystemPrompt('article');
    expect(articlePrompt).toContain('headings');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildLeafPrompt Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('buildLeafPrompt', () => {
  it('includes all sentences in prompt', () => {
    const commit = createTestCommit([
      'User prefers dark mode',
      'User speaks English',
      'User timezone is UTC+8',
    ]);
    const leaf = createTestLeaf('tweet');

    const result = buildLeafPrompt({ commit, leaf });

    expect(result.userPrompt).toContain('User prefers dark mode');
    expect(result.userPrompt).toContain('User speaks English');
    expect(result.userPrompt).toContain('User timezone is UTC+8');
    expect(result.metadata.sentenceCount).toBe(3);
  });

  it('includes type-specific instructions for tweet', () => {
    const commit = createTestCommit(['Test sentence']);
    const leaf = createTestLeaf('tweet');

    const result = buildLeafPrompt({ commit, leaf });

    expect(result.systemPrompt).toContain('280 characters');
  });

  it('includes type-specific instructions for article', () => {
    const commit = createTestCommit(['Test sentence']);
    const leaf = createTestLeaf('article');

    const result = buildLeafPrompt({ commit, leaf });

    expect(result.systemPrompt).toContain('headings');
    expect(result.systemPrompt).toContain('paragraphs');
  });

  it('includes REQUIRE constraints as "must include"', () => {
    const commit = createTestCommit(['Test sentence']);
    const constraints: Constraint[] = [
      { id: 'cst_1', type: 'require', match_mode: 'exact', value: 'dark mode' },
    ];
    const leaf = createTestLeaf('tweet', constraints);

    const result = buildLeafPrompt({ commit, leaf });

    expect(result.userPrompt).toContain('MUST include');
    expect(result.userPrompt).toContain('dark mode');
    expect(result.metadata.requireCount).toBe(1);
  });

  it('includes EXCLUDE constraints as "must not include"', () => {
    const commit = createTestCommit(['Test sentence']);
    const constraints: Constraint[] = [
      { id: 'cst_1', type: 'exclude', match_mode: 'exact', value: 'light mode' },
    ];
    const leaf = createTestLeaf('tweet', constraints);

    const result = buildLeafPrompt({ commit, leaf });

    expect(result.userPrompt).toContain('MUST NOT include');
    expect(result.userPrompt).toContain('light mode');
    expect(result.metadata.excludeCount).toBe(1);
  });

  it('includes additional instructions when provided', () => {
    const commit = createTestCommit(['Test sentence']);
    const leaf = createTestLeaf('tweet');
    const additionalInstructions = 'Use a friendly tone and include emojis';

    const result = buildLeafPrompt({ commit, leaf, additionalInstructions });

    expect(result.userPrompt).toContain('Additional Instructions');
    expect(result.userPrompt).toContain('Use a friendly tone and include emojis');
  });

  it('returns correct metadata counts', () => {
    const commit = createTestCommit(['Sentence 1', 'Sentence 2', 'Sentence 3']);
    const constraints: Constraint[] = [
      { id: 'cst_1', type: 'require', match_mode: 'exact', value: 'value1' },
      { id: 'cst_2', type: 'require', match_mode: 'semantic', value: 'value2' },
      { id: 'cst_3', type: 'exclude', match_mode: 'exact', value: 'value3' },
    ];
    const leaf = createTestLeaf('article', constraints);

    const result = buildLeafPrompt({ commit, leaf });

    expect(result.metadata.sentenceCount).toBe(3);
    expect(result.metadata.requireCount).toBe(2);
    expect(result.metadata.excludeCount).toBe(1);
  });

  it('includes leaf title when provided', () => {
    const commit = createTestCommit(['Test sentence']);
    const leaf = createTestLeaf('tweet', [], 'Welcome Tweet');

    const result = buildLeafPrompt({ commit, leaf });

    expect(result.userPrompt).toContain('Welcome Tweet');
  });

  it('handles empty constraints gracefully', () => {
    const commit = createTestCommit(['Test sentence']);
    const leaf = createTestLeaf('tweet', []);

    const result = buildLeafPrompt({ commit, leaf });

    expect(result.metadata.requireCount).toBe(0);
    expect(result.metadata.excludeCount).toBe(0);
    // Should not include constraints section when empty
    expect(result.userPrompt).not.toContain('### Required');
    expect(result.userPrompt).not.toContain('### Excluded');
  });

  it('returns valid BuiltPrompt structure', () => {
    const commit = createTestCommit(['Test']);
    const leaf = createTestLeaf('tweet');

    const result = buildLeafPrompt({ commit, leaf });

    expect(result).toHaveProperty('systemPrompt');
    expect(result).toHaveProperty('userPrompt');
    expect(result).toHaveProperty('metadata');
    expect(result.metadata).toHaveProperty('sentenceCount');
    expect(result.metadata).toHaveProperty('requireCount');
    expect(result.metadata).toHaveProperty('excludeCount');
    expect(typeof result.systemPrompt).toBe('string');
    expect(typeof result.userPrompt).toBe('string');
  });
});
