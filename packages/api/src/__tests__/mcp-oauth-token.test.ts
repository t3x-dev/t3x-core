import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mcpOAuthConfig, openMcpAccessToken, sealMcpAccessToken } from '../lib/mcp-oauth';

const secret = randomBytes(32).toString('base64url');
const audience = 'https://mcp.example.test/mcp';
const issuer = 'https://web.example.test';

afterEach(() => vi.useRealTimers());

describe('MCP OAuth resource tokens', () => {
  it('authenticates the audience, credential and expiry and checks expiry at use time', () => {
    vi.useFakeTimers();
    const expiresAt = Date.now() + 1000;
    const claims = { audience, expiresAt, apiKey: 'test-internal-key' };
    const token = sealMcpAccessToken(claims, secret);
    expect(token).not.toContain(claims.apiKey);
    expect(openMcpAccessToken(token, audience, secret)).toBe(claims.apiKey);
    expect(openMcpAccessToken(token, issuer, secret)).toBeNull();
    expect(openMcpAccessToken(token, audience, randomBytes(32).toString('base64url'))).toBeNull();
    vi.setSystemTime(expiresAt);
    expect(openMcpAccessToken(token, audience, secret)).toBeNull();
    expect(() => sealMcpAccessToken(claims, secret)).toThrow();
  });

  it('only enables a complete configuration with the canonical URLs and a full length key', () => {
    expect(mcpOAuthConfig({})).toBeUndefined();
    expect(() => mcpOAuthConfig({ T3X_MCP_OAUTH_ISSUER: issuer })).toThrow();
    const env = {
      T3X_MCP_RESOURCE_URL: audience,
      T3X_MCP_OAUTH_ISSUER: issuer,
      T3X_MCP_OAUTH_SECRET: secret,
    };
    expect(mcpOAuthConfig(env)?.resource.href).toBe(audience);
    expect(
      mcpOAuthConfig({ ...env, T3X_MCP_RESOURCE_URL: 'http://127.0.0.1:3001/mcp' })?.issuer.origin
    ).toBe(issuer);
    for (const invalid of [
      { T3X_MCP_RESOURCE_URL: 'http://mcp.example.test/mcp' },
      { T3X_MCP_RESOURCE_URL: 'https://mcp.example.test/not-mcp' },
      { T3X_MCP_OAUTH_ISSUER: 'https://web.example.test/?user=x' },
      { T3X_MCP_OAUTH_SECRET: 'short' },
    ])
      expect(() => mcpOAuthConfig({ ...env, ...invalid })).toThrow();
  });
});
