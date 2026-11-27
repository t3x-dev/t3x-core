import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const MCP_ACCESS_TOKEN_PREFIX = 't3x_mcp_oauth1.';
const tokenPurpose = Buffer.from('T3X MCP OAuth access token v1', 'utf8');

/** Effective end-to-end work mode for the tool groups exposed by one deployment. */
export function repositoryModeForCapabilities(
  capabilities: readonly string[]
): 'read' | 'prepare' | 'commit' | null {
  const enabled = new Set(capabilities);
  const has = (group: string) => enabled.has(group);
  if (!has('read-only') && !['context', 'repositories', 'state'].every(has)) return null;
  if (
    ![
      'workspace',
      'workspace:write',
      'transitions',
      'transitions:prepare',
      'transitions:verify',
      'schemas',
    ].every(has)
  )
    return 'read';
  return ['decision:accept', 'decision:reject', 'commit'].every(has) ? 'commit' : 'prepare';
}

function encryptionKey(secret: string): Buffer {
  const key = Buffer.from(secret, 'base64url');
  if (key.length !== 32 || key.toString('base64url') !== secret)
    throw new Error('T3X_MCP_OAUTH_SECRET must contain 32 random bytes encoded as base64url.');
  return key;
}

export interface McpOAuthConfig {
  resource: URL;
  issuer: URL;
  secret: string;
}

function configuredUrl(value: string, pathname: string): URL {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== pathname
  )
    throw new Error('Invalid MCP OAuth URL. Use an HTTPS endpoint or an HTTP loopback endpoint.');
  return url;
}

export function mcpOAuthConfig(env: NodeJS.ProcessEnv = process.env): McpOAuthConfig | undefined {
  const resource = env.T3X_MCP_RESOURCE_URL;
  const issuer = env.T3X_MCP_OAUTH_ISSUER;
  const secret = env.T3X_MCP_OAUTH_SECRET;
  if (resource === undefined && issuer === undefined && secret === undefined) return;
  if (!resource || !issuer || !secret)
    throw new Error(
      'MCP OAuth requires T3X_MCP_RESOURCE_URL, T3X_MCP_OAUTH_ISSUER and T3X_MCP_OAUTH_SECRET.'
    );
  encryptionKey(secret);
  return { resource: configuredUrl(resource, '/mcp'), issuer: configuredUrl(issuer, '/'), secret };
}

type AccessTokenClaims = { audience: string; expiresAt: number; apiKey: string };

export function sealMcpAccessToken(claims: AccessTokenClaims, secret: string): string {
  if (
    !claims.audience ||
    !Number.isSafeInteger(claims.expiresAt) ||
    claims.expiresAt <= Date.now() ||
    !claims.apiKey
  )
    throw new Error('Invalid MCP access token claims.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  cipher.setAAD(tokenPurpose);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(claims), 'utf8'), cipher.final()]);
  const envelope = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  return MCP_ACCESS_TOKEN_PREFIX + envelope.toString('base64url');
}

/** Only the resource server unwraps its internal, separately revocable API credential. */
export function openMcpAccessToken(token: string, audience: string, secret: string): string | null {
  if (!token.startsWith(MCP_ACCESS_TOKEN_PREFIX) || token.length > 8192) return null;
  try {
    const encoded = token.slice(MCP_ACCESS_TOKEN_PREFIX.length);
    const envelope = Buffer.from(encoded, 'base64url');
    if (envelope.length <= 28 || envelope.toString('base64url') !== encoded) return null;
    const cipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), envelope.subarray(0, 12));
    cipher.setAAD(tokenPurpose);
    cipher.setAuthTag(envelope.subarray(12, 28));
    const payload = Buffer.concat([cipher.update(envelope.subarray(28)), cipher.final()]);
    const claims: AccessTokenClaims = JSON.parse(payload.toString('utf8'));
    if (
      claims.audience !== audience ||
      !Number.isSafeInteger(claims.expiresAt) ||
      claims.expiresAt <= Date.now() ||
      typeof claims.apiKey !== 'string' ||
      !claims.apiKey
    )
      return null;
    return claims.apiKey;
  } catch {
    return null;
  }
}
