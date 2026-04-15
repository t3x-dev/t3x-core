import { describe, expect, it, vi } from 'vitest';
import { deriveAliasCandidate, maybeAssignAlias } from '../lib/extraction-pipeline';

describe('deriveAliasCandidate', () => {
  it('passes through a valid snake_case key', () => {
    expect(deriveAliasCandidate('tokyo_trip')).toBe('tokyo_trip');
  });

  it('lowercases and replaces invalid chars', () => {
    expect(deriveAliasCandidate('Tokyo Trip!')).toBe('tokyo_trip_');
  });

  it('collapses repeated underscores', () => {
    expect(deriveAliasCandidate('a__b___c')).toBe('a_b_c');
  });

  it('truncates to 64 characters', () => {
    const longKey = 'a'.repeat(80);
    expect(deriveAliasCandidate(longKey).length).toBeLessThanOrEqual(64);
  });

  it('falls back to topic_<hash> when sanitization is empty', () => {
    const result = deriveAliasCandidate('!!!', 'conv_abcdef12');
    expect(result).toMatch(/^topic_[a-f0-9]{8}$/);
  });

  it('falls back when sanitization starts with a digit', () => {
    const result = deriveAliasCandidate('123trip', 'conv_abcdef12');
    expect(result).toMatch(/^topic_[a-f0-9]{8}$/);
  });
});

describe('maybeAssignAlias', () => {
  it('skips when conversation already has an alias', async () => {
    const db = {} as never;
    const setAliasIfNull = vi.fn();

    await maybeAssignAlias({
      db,
      conversation: { conversationId: 'conv_a', projectId: 'proj_a', alias: 'existing' },
      rootKey: 'fresh_topic',
      setAliasIfNull,
    });

    expect(setAliasIfNull).not.toHaveBeenCalled();
  });

  it('sets alias when alias was null (trigger emits conversation.renamed)', async () => {
    const db = {} as never;
    const setAliasIfNull = vi.fn().mockResolvedValue('fresh_topic');

    await maybeAssignAlias({
      db,
      conversation: { conversationId: 'conv_b', projectId: 'proj_b', alias: null },
      rootKey: 'fresh_topic',
      setAliasIfNull,
    });

    expect(setAliasIfNull).toHaveBeenCalledWith(db, 'conv_b', 'fresh_topic');
  });

  it('does not throw when setAliasIfNull rejects', async () => {
    const db = {} as never;
    const setAliasIfNull = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(
      maybeAssignAlias({
        db,
        conversation: { conversationId: 'conv_c', projectId: 'proj_c', alias: null },
        rootKey: 'topic',
        setAliasIfNull,
      })
    ).resolves.not.toThrow();
  });
});
