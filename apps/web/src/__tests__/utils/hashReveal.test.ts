import { describe, expect, it } from 'vitest';
import { formatCommitHashForReveal } from '@/utils/hashReveal';

describe('formatCommitHashForReveal', () => {
  it('keeps the real commit hash while exposing a compact display hash', () => {
    expect(
      formatCommitHashForReveal('sha256:1234567890abcdef1234567890abcdef1234567890abcdef')
    ).toEqual({
      full: 'sha256:1234567890abcdef1234567890abcdef1234567890abcdef',
      compact: '1234567890ab',
      prefix: 'sha256',
    });
  });

  it('handles hashes without a schema prefix', () => {
    expect(formatCommitHashForReveal('abcdef1234567890')).toEqual({
      full: 'abcdef1234567890',
      compact: 'abcdef123456',
      prefix: null,
    });
  });
});
