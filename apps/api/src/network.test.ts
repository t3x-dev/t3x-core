import { describe, expect, it } from 'vitest';
import { DEFAULT_API_HOST, resolveApiHost } from './network.js';

describe('resolveApiHost', () => {
  it('binds source development to loopback by default', () => {
    expect(resolveApiHost({})).toBe(DEFAULT_API_HOST);
  });

  it('allows an explicit host for authenticated container deployments', () => {
    expect(resolveApiHost({ HOST: '0.0.0.0' })).toBe('0.0.0.0');
  });

  it('does not treat an empty host as an external-listen opt-in', () => {
    expect(resolveApiHost({ HOST: '  ' })).toBe(DEFAULT_API_HOST);
  });
});
