import { describe, expect, it } from 'vitest';
import { DEFAULT_RUNNER_HOST, resolveRunnerHost, resolveRunnerPort } from '../network.js';

describe('runner network boundary', () => {
  it('binds standalone source use to loopback by default', () => {
    expect(resolveRunnerHost({})).toBe(DEFAULT_RUNNER_HOST);
  });

  it('requires service auth or an explicit deployment override to listen externally', () => {
    expect(() => resolveRunnerHost({ RUNNER_HOST: '0.0.0.0' })).toThrow('RUNNER_SERVICE_TOKEN');
    expect(
      resolveRunnerHost({
        RUNNER_HOST: '0.0.0.0',
        T3X_ALLOW_UNAUTHENTICATED_RUNNER_NETWORK: 'true',
      })
    ).toBe('0.0.0.0');
  });

  it('allows an authenticated Runner service to listen externally', () => {
    expect(
      resolveRunnerHost({ RUNNER_HOST: '0.0.0.0', RUNNER_SERVICE_TOKEN: 'service-secret' })
    ).toBe('0.0.0.0');
  });

  it('does not treat an empty override as external-listen opt-in', () => {
    expect(resolveRunnerHost({ RUNNER_HOST: '   ' })).toBe(DEFAULT_RUNNER_HOST);
  });

  it.each([
    '127.0.0.2',
    'localhost',
    '::1',
    '[::1]',
  ])('allows loopback host %s without a dangerous override', (host) => {
    expect(resolveRunnerHost({ RUNNER_HOST: host })).toBe(host);
  });

  it('keeps numeric environment ports compatible and rejects unsafe values', () => {
    expect(resolveRunnerPort('8080')).toBe(8080);
    expect(() => resolveRunnerPort('8080x')).toThrow('integer between 1 and 65535');
    expect(() => resolveRunnerPort(0)).toThrow('integer between 1 and 65535');
  });
});
