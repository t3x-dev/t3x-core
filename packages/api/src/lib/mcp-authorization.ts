import { createHash, createHmac, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { type McpOAuthConfig, mcpOAuthConfig, repositoryModeForCapabilities } from './mcp-oauth';

export const delegationModes = ['read', 'prepare', 'commit'] as const;
export type WorkMode = (typeof delegationModes)[number];
export const scopeFor = (mode: WorkMode) => `repository:${mode}`;
export const scopeAllows = (cap: WorkMode, mode: WorkMode) =>
  delegationModes.indexOf(mode) <= delegationModes.indexOf(cap);

export class AuthorizationError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 503,
    message: string
  ) {
    super(message);
  }
}

const registration = z.object({
  client_id: z.string().min(1).max(256),
  client_name: z.string().trim().min(1).max(100),
  redirect_uris: z.array(z.string().url()).min(1),
});

export function issuerConfig() {
  const config = mcpOAuthConfig();
  if (!config)
    throw new AuthorizationError(
      503,
      'Repository authorization is not configured on this deployment.'
    );
  return config;
}

function validRedirect(value: string) {
  const url = new URL(value);
  return (
    !url.username &&
    !url.password &&
    !url.hash &&
    !['code', 'state', 'error', 'iss'].some((param) => url.searchParams.has(param)) &&
    (url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)))
  );
}

export function registeredClient(clientId: string | null, redirect: string | null) {
  let configured: z.infer<typeof registration>[];
  try {
    configured = z.array(registration).parse(JSON.parse(process.env.T3X_MCP_OAUTH_CLIENTS || '[]'));
  } catch {
    throw new AuthorizationError(503, 'The deployment OAuth client registry is unavailable.');
  }
  const exact = configured.filter((client) => client.client_id === clientId);
  if (
    exact.length !== 1 ||
    !redirect ||
    !exact[0].redirect_uris.includes(redirect) ||
    !validRedirect(redirect)
  )
    throw new AuthorizationError(400, 'Unknown OAuth client or unregistered callback.');
  return exact[0];
}

export function checkParameters(params: URLSearchParams) {
  const seen = new Set<string>();
  for (const [name, value] of params) {
    if (seen.has(name) || name.length > 100 || value.length > 2048)
      throw new AuthorizationError(400, 'Invalid or duplicate OAuth parameter.');
    seen.add(name);
  }
}

export function authorizationRequest(params: URLSearchParams, config: McpOAuthConfig) {
  checkParameters(params);
  const redirectUri = params.get('redirect_uri') ?? '';
  const client = registeredClient(params.get('client_id'), redirectUri);
  const challenge = params.get('code_challenge') ?? '';
  if (
    params.get('response_type') !== 'code' ||
    params.get('code_challenge_method') !== 'S256' ||
    !/^[A-Za-z0-9_-]{43}$/.test(challenge) ||
    params.get('resource') !== config.resource.href
  )
    throw new AuthorizationError(
      400,
      'A code request for this MCP resource with S256 PKCE is required.'
    );
  const scope = params.get('scope') ?? scopeFor('commit');
  const mode = delegationModes.find((value) => scopeFor(value) === scope);
  if (!mode) throw new AuthorizationError(400, 'Unsupported repository scope.');
  return {
    client,
    redirectUri,
    challenge,
    mode,
    state: params.get('state'),
    repository: params.get('repository'),
    branch: params.get('branch'),
  };
}

export function callbackUrl(
  request: ReturnType<typeof authorizationRequest>,
  issuer: string,
  result: { code: string } | { error: string }
) {
  const url = new URL(request.redirectUri);
  for (const [key, value] of Object.entries(result)) url.searchParams.set(key, value);
  if (request.state !== null) url.searchParams.set('state', request.state);
  url.searchParams.set('iss', issuer);
  return url.href;
}

export const approvalNonce = () => randomBytes(32).toString('base64url');
export const authorizationCode = (nonce: string, secret: string) =>
  createHmac('sha256', Buffer.from(secret, 'base64url'))
    .update('mcp-code-v1:')
    .update(nonce)
    .digest('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('base64url');
// The database stores a credential sealed with both the one-time code and an issuer secret.
export const codeSecret = (code: string, secret: string) =>
  createHmac('sha256', Buffer.from(secret, 'base64url'))
    .update('authorization-code-v1:')
    .update(code)
    .digest('base64url');

export async function serviceMode(config: McpOAuthConfig): Promise<WorkMode> {
  const url = new URL('/.well-known/oauth-protected-resource/mcp', config.resource);
  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(3500) });
    if (!response.ok) throw new Error();
    const data = (await response.json()) as {
      resource?: unknown;
      authorization_servers?: unknown;
      t3x_capabilities?: unknown;
    };
    if (
      data.resource !== config.resource.href ||
      !Array.isArray(data.authorization_servers) ||
      !data.authorization_servers.includes(config.issuer.origin) ||
      !Array.isArray(data.t3x_capabilities)
    )
      throw new Error();
    const mode = repositoryModeForCapabilities(data.t3x_capabilities);
    if (!mode) throw new Error();
    return mode;
  } catch {
    throw new AuthorizationError(
      503,
      'The MCP service could not confirm its available tools. Retry when the connection is ready.'
    );
  }
}
