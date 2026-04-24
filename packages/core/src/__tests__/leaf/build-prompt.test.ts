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
import type { SemanticContent } from '../../semantic/types';
import type { Constraint, Leaf } from '../../types';

// ═══════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════════════════

const createTestKnowledge = (
  items: Array<{ type: string; slots: Record<string, string> }>
): SemanticContent => ({
  trees: items.map((f) => ({
    key: f.type,
    slots: f.slots,
    children: [],
  })),
  relations: [],
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
  it('includes all frame knowledge in prompt', () => {
    const knowledge = createTestKnowledge([
      { type: 'user_preference', slots: { theme: 'dark mode' } },
      { type: 'language', slots: { primary: 'English' } },
      { type: 'timezone', slots: { value: 'UTC+8' } },
    ]);
    const leaf = createTestLeaf('tweet');

    const result = buildLeafPrompt({ knowledge, leaf });

    expect(result.userPrompt).toContain('user_preference');
    expect(result.userPrompt).toContain('dark mode');
    expect(result.userPrompt).toContain('language');
    expect(result.userPrompt).toContain('English');
    expect(result.userPrompt).toContain('timezone');
    expect(result.metadata.frameCount).toBe(3);
  });

  it('includes type-specific instructions for tweet', () => {
    const knowledge = createTestKnowledge([
      { type: 'user_preference', slots: { theme: 'dark mode' } },
    ]);
    const leaf = createTestLeaf('tweet');

    const result = buildLeafPrompt({ knowledge, leaf });

    expect(result.systemPrompt).toContain('280 characters');
  });

  it('includes type-specific instructions for article', () => {
    const knowledge = createTestKnowledge([{ type: 'topic', slots: { subject: 'AI' } }]);
    const leaf = createTestLeaf('article');

    const result = buildLeafPrompt({ knowledge, leaf });

    expect(result.systemPrompt).toContain('headings');
    expect(result.systemPrompt).toContain('paragraphs');
  });

  it('includes REQUIRE constraints as "must include"', () => {
    const knowledge = createTestKnowledge([{ type: 'topic', slots: { subject: 'AI' } }]);
    const constraints: Constraint[] = [
      { id: 'cst_1', type: 'require', match_mode: 'exact', value: 'dark mode' },
    ];
    const leaf = createTestLeaf('tweet', constraints);

    const result = buildLeafPrompt({ knowledge, leaf });

    expect(result.userPrompt).toContain('MUST include');
    expect(result.userPrompt).toContain('dark mode');
    expect(result.metadata.requireCount).toBe(1);
  });

  it('includes EXCLUDE constraints as "must not include"', () => {
    const knowledge = createTestKnowledge([{ type: 'topic', slots: { subject: 'AI' } }]);
    const constraints: Constraint[] = [
      { id: 'cst_1', type: 'exclude', match_mode: 'exact', value: 'light mode' },
    ];
    const leaf = createTestLeaf('tweet', constraints);

    const result = buildLeafPrompt({ knowledge, leaf });

    expect(result.userPrompt).toContain('MUST NOT include');
    expect(result.userPrompt).toContain('light mode');
    expect(result.metadata.excludeCount).toBe(1);
  });

  it('includes additional instructions when provided', () => {
    const knowledge = createTestKnowledge([{ type: 'topic', slots: { subject: 'AI' } }]);
    const leaf = createTestLeaf('tweet');
    const additionalInstructions = 'Use a friendly tone and include emojis';

    const result = buildLeafPrompt({ knowledge, leaf, additionalInstructions });

    expect(result.userPrompt).toContain('Additional Instructions');
    expect(result.userPrompt).toContain('Use a friendly tone and include emojis');
  });

  it('returns correct metadata counts', () => {
    const knowledge = createTestKnowledge([
      { type: 'user_preference', slots: { theme: 'dark' } },
      { type: 'language', slots: { primary: 'English' } },
      { type: 'goal', slots: { task: 'write blog' } },
    ]);
    const constraints: Constraint[] = [
      { id: 'cst_1', type: 'require', match_mode: 'exact', value: 'value1' },
      { id: 'cst_2', type: 'require', match_mode: 'semantic', value: 'value2' },
      { id: 'cst_3', type: 'exclude', match_mode: 'exact', value: 'value3' },
    ];
    const leaf = createTestLeaf('article', constraints);

    const result = buildLeafPrompt({ knowledge, leaf });

    expect(result.metadata.frameCount).toBe(3);
    expect(result.metadata.requireCount).toBe(2);
    expect(result.metadata.excludeCount).toBe(1);
  });

  it('includes leaf title when provided', () => {
    const knowledge = createTestKnowledge([{ type: 'topic', slots: { subject: 'AI' } }]);
    const leaf = createTestLeaf('tweet', [], 'Welcome Tweet');

    const result = buildLeafPrompt({ knowledge, leaf });

    expect(result.userPrompt).toContain('Welcome Tweet');
  });

  it('handles empty constraints gracefully', () => {
    const knowledge = createTestKnowledge([{ type: 'topic', slots: { subject: 'AI' } }]);
    const leaf = createTestLeaf('tweet', []);

    const result = buildLeafPrompt({ knowledge, leaf });

    expect(result.metadata.requireCount).toBe(0);
    expect(result.metadata.excludeCount).toBe(0);
    // Should not include constraints section when empty
    expect(result.userPrompt).not.toContain('### Required');
    expect(result.userPrompt).not.toContain('### Excluded');
  });

  it('returns valid BuiltPrompt structure', () => {
    const knowledge = createTestKnowledge([{ type: 'topic', slots: { subject: 'test' } }]);
    const leaf = createTestLeaf('tweet');

    const result = buildLeafPrompt({ knowledge, leaf });

    expect(result).toHaveProperty('systemPrompt');
    expect(result).toHaveProperty('userPrompt');
    expect(result).toHaveProperty('metadata');
    expect(result.metadata).toHaveProperty('frameCount');
    expect(result.metadata).toHaveProperty('requireCount');
    expect(result.metadata).toHaveProperty('excludeCount');
    expect(typeof result.systemPrompt).toBe('string');
    expect(typeof result.userPrompt).toBe('string');
  });

  it('includes lessons learned when provided', () => {
    const knowledge = createTestKnowledge([{ type: 'topic', slots: { subject: 'AI' } }]);
    const leaf = createTestLeaf('tweet');
    const lessons = [
      {
        id: 'lsn_1',
        source: 'assertion' as const,
        signal: 'Previous output was too formal for Twitter',
        leaf_id: 'leaf_1',
        created_at: '2026-03-31T00:00:00Z',
      },
      {
        id: 'lsn_2',
        source: 'assertion' as const,
        signal: 'Include more hashtags for engagement',
        leaf_id: 'leaf_1',
        created_at: '2026-03-31T00:00:00Z',
      },
    ];

    const result = buildLeafPrompt({ knowledge, leaf, lessons });

    expect(result.userPrompt).toContain('Lessons Learned');
    expect(result.userPrompt).toContain('Previous output was too formal for Twitter');
    expect(result.userPrompt).toContain('Include more hashtags for engagement');
  });

  it('does not include lessons section when empty', () => {
    const knowledge = createTestKnowledge([{ type: 'topic', slots: { subject: 'AI' } }]);
    const leaf = createTestLeaf('tweet');

    const result = buildLeafPrompt({ knowledge, leaf, lessons: [] });

    expect(result.userPrompt).not.toContain('Lessons Learned');
  });

  it('includes selected semantic points and omits excluded point labels from that section', () => {
    const knowledge = createTestKnowledge([
      { type: 'trip', slots: { city: 'Kyoto', duration: '2 days', pace: 'quiet' } },
    ]);
    const leaf = {
      ...createTestLeaf('tweet'),
      config: {
        semantic_point_overrides: [{ point_id: 'trip/duration', state: 'excluded' }],
      },
    };

    const result = buildLeafPrompt({ knowledge, leaf });

    expect(result.userPrompt).toContain('## Selected Semantic Points');
    expect(result.userPrompt).toContain('trip.city = Kyoto');
    expect(result.userPrompt).toContain('trip.pace = quiet');
    expect(result.userPrompt).not.toContain('trip.duration = 2 days');
    expect(result.userPrompt).toContain('Treat unlisted source facts as deselected background context');
  });
});
