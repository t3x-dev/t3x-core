import { describe, expect, it } from 'vitest';
import { DEFAULT_API_HOST, resolveApiHost } from './network.js';

describe('resolveApiHost', () => {
  it('binds source development to loopback by default', () => {
    expect(resolveApiHost({})).toBe(DEFAULT_API_HOST);
  });

  it('allows an explicit host for authenticated container deployments', () => {
    expect(resolveApiHost({ HOST: '0.0.0.0', AUTH_DISABLED: 'false' })).toBe('0.0.0.0');
  });

  it('does not treat an empty host as an external-listen opt-in', () => {
    expect(resolveApiHost({ HOST: '  ' })).toBe(DEFAULT_API_HOST);
  });

  it.each([
    '127.0.0.2',
    'localhost',
    '::1',
    '[::1]',
  ])('allows unauthenticated loopback host %s', (host) => {
    expect(resolveApiHost({ HOST: host, AUTH_DISABLED: 'true' })).toBe(host);
  });

  it.each([
    '0.0.0.0',
    '192.168.1.10',
    'api.internal',
  ])('rejects unauthenticated non-loopback host %s', (host) => {
    expect(() => resolveApiHost({ HOST: host, AUTH_DISABLED: 'true' })).toThrow(
      'non-loopback host while authentication is disabled'
    );
  });

  it('uses the production override when determining effective auth mode', () => {
    expect(resolveApiHost({ HOST: '0.0.0.0', AUTH_DISABLED: 'true', NODE_ENV: 'production' })).toBe(
      '0.0.0.0'
    );
    expect(() =>
      resolveApiHost({
        HOST: '0.0.0.0',
        AUTH_DISABLED: 'true',
        NODE_ENV: 'production',
        T3X_ALLOW_AUTH_DISABLED_IN_PRODUCTION: 'true',
      })
    ).toThrow('non-loopback host while authentication is disabled');
  });
});
