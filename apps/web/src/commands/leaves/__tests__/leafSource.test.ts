import { describe, expect, it } from 'vitest';
import { LeafSourceValidationError } from '../errors';
import { assertLeafSource } from '../leafSource';

/**
 * PR20 (TDD red): these tests assert the runtime contract that
 * `assertLeafSource` enforces in PR21. While the stub throws a plain
 * Error, every test in this file is expected to fail.
 *
 * When PR21 implements the real assertion, all tests flip to green.
 */

describe('assertLeafSource', () => {
  it('accepts a minimal user source', () => {
    expect(() => assertLeafSource({ type: 'user' })).not.toThrow();
  });

  it('accepts an agent source with model + timestamp', () => {
    expect(() =>
      assertLeafSource({
        type: 'agent',
        model: 'gpt-4',
        timestamp: '2026-04-14T10:00:00Z',
      })
    ).not.toThrow();
  });

  it('rejects an agent source missing model', () => {
    expect(() => assertLeafSource({ type: 'agent', timestamp: '2026-04-14T10:00:00Z' })).toThrow(
      LeafSourceValidationError
    );
  });

  it('rejects an agent source missing timestamp', () => {
    expect(() => assertLeafSource({ type: 'agent', model: 'gpt-4' })).toThrow(
      LeafSourceValidationError
    );
  });

  it('rejects an unknown discriminator', () => {
    expect(() => assertLeafSource({ type: 'bot', model: 'x', timestamp: 'y' })).toThrow(
      LeafSourceValidationError
    );
  });

  it('rejects null / undefined / non-object', () => {
    expect(() => assertLeafSource(null)).toThrow(LeafSourceValidationError);
    expect(() => assertLeafSource(undefined)).toThrow(LeafSourceValidationError);
    expect(() => assertLeafSource('user')).toThrow(LeafSourceValidationError);
    expect(() => assertLeafSource(123)).toThrow(LeafSourceValidationError);
  });
});
