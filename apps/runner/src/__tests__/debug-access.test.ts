import { describe, expect, it } from 'vitest';
import {
  isEnabledEnv,
  isLoopbackAddress,
  isLoopbackHost,
  isTrustedLoopbackRequest,
} from '../debug-access.js';

describe('debug access guards', () => {
  it('parses debug route env flags narrowly', () => {
    expect(isEnabledEnv('true')).toBe(true);
    expect(isEnabledEnv('1')).toBe(true);
    expect(isEnabledEnv('false')).toBe(false);
    expect(isEnabledEnv(undefined)).toBe(false);
  });

  it('recognizes supported loopback hosts', () => {
    expect(isLoopbackHost('localhost:8080')).toBe(true);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('[::1]:8080')).toBe(true);
    expect(isLoopbackHost('runner.example.com')).toBe(false);
  });

  it('recognizes supported loopback remote addresses', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('203.0.113.8')).toBe(false);
  });

  it('requires both loopback host and loopback remote address to bypass auth', () => {
    expect(isTrustedLoopbackRequest({ host: 'localhost:8080', remoteAddress: '127.0.0.1' })).toBe(
      true
    );
    expect(isTrustedLoopbackRequest({ host: 'localhost:8080', remoteAddress: '203.0.113.8' })).toBe(
      false
    );
    expect(
      isTrustedLoopbackRequest({ host: 'runner.example.com', remoteAddress: '127.0.0.1' })
    ).toBe(false);
  });
});
