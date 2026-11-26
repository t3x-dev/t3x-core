import { once } from 'node:events';
import { createServer, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  MCP_ACCESS_TOKEN_PREFIX,
  type McpOAuthConfig,
  openMcpAccessToken,
  repositoryModeForCapabilities,
} from '@t3x-dev/api/mcp-oauth';
import { createMcpServer, type McpServerOptions, runWithMcpApiCredential } from '@t3x-dev/mcp-lib';

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];
const MCP_PATH = '/mcp';
const RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource/mcp';

export const managedMcpCapabilities = [
  'read-only',
  'workspace',
  'workspace:write',
  'workspace:candidates:write',
  'sources',
  'sources:ingest',
  'sources:generate',
  'schemas',
  'runs',
  'runs:workspace',
  'runs:workspace:trigger',
  'transitions',
  'transitions:prepare',
  'transitions:verify',
  'decision:accept',
  'decision:reject',
  'commit',
] satisfies NonNullable<McpServerOptions['capabilities']>;

function authority(host: string, port: number, defaultPort: number): string {
  return port === defaultPort ? host : `${host}:${port}`;
}

function sendError(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

function unauthorized(response: ServerResponse, challenge: string): void {
  response.setHeader('WWW-Authenticate', challenge);
  sendError(response, 401, 'A valid T3X Bearer credential is required.');
}

export async function startMcpHttpServer(
  options: McpServerOptions,
  {
    apiUrl,
    host,
    port,
    publicUrl,
    oauth,
  }: {
    apiUrl: string;
    host: string;
    port: number;
    publicUrl?: URL;
    oauth?: McpOAuthConfig;
  }
): Promise<void> {
  const mode = repositoryModeForCapabilities(options.capabilities ?? []);
  const modes = ['read', 'prepare', 'commit'];
  const scopes = mode
    ? modes.slice(0, modes.indexOf(mode) + 1).map((value) => `repository:${value}`)
    : [];
  const metadataUrl = oauth && new URL(RESOURCE_METADATA_PATH, oauth.resource).href;
  // The SDK otherwise requests all advertised scopes at once, including mutually nested work modes.
  const scopeHint = mode ? `, scope="repository:${mode}"` : '';
  const challenge = metadataUrl
    ? `Bearer resource_metadata="${metadataUrl}"${scopeHint}`
    : 'Bearer';
  const httpServer = createServer(
    { headersTimeout: 10_000, requestTimeout: 30_000 },
    async (request, response) => {
      if (request.url === '/health' && (request.method === 'GET' || request.method === 'HEAD')) {
        response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
        response.end('ok');
        return;
      }
      response.setHeader('Cache-Control', 'no-store');
      const isMetadata = oauth && request.url === RESOURCE_METADATA_PATH;
      if (request.url !== MCP_PATH && !isMetadata) {
        sendError(response, 404, 'Not found.');
        return;
      }

      const requestHost = request.headers.host?.toLowerCase();
      const origin = request.headers.origin;
      const allowedOrigin = requestHost ? origins.get(requestHost) : undefined;
      if (!allowedOrigin || (origin !== undefined && origin !== allowedOrigin)) {
        sendError(response, 403, 'Invalid Host or Origin.');
        return;
      }
      if (oauth && isMetadata) {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.setHeader('Allow', 'GET, HEAD');
          sendError(response, 405, 'Use GET or HEAD for resource metadata.');
          return;
        }
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          request.method === 'HEAD'
            ? undefined
            : JSON.stringify({
                resource: oauth.resource.href,
                resource_name: 'T3X repository access',
                authorization_servers: [oauth.issuer.origin],
                scopes_supported: scopes,
                bearer_methods_supported: ['header'],
                t3x_capabilities: options.capabilities,
              })
        );
        return;
      }
      const token = /^Bearer +([A-Za-z0-9._~+/-]+=*)$/i.exec(
        request.headers.authorization ?? ''
      )?.[1];
      const credential = token?.startsWith(MCP_ACCESS_TOKEN_PREFIX)
        ? oauth && openMcpAccessToken(token, oauth.resource.href, oauth.secret)
        : token;
      if (!credential) {
        unauthorized(response, challenge);
        return;
      }

      try {
        const result = await runWithMcpApiCredential(apiUrl, credential, async () => {
          if (response.destroyed) return;
          if (request.method !== 'POST') {
            response.setHeader('Allow', 'POST');
            sendError(response, 405, 'This MCP endpoint accepts POST.');
            return;
          }
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
            // A 5 MiB Source attachment can expand to almost 7 MiB in base64.
            maxRequestBodySize: 8 * 1024 * 1024,
          });
          const { server } = createMcpServer(options);
          try {
            await server.connect(transport);
            await transport.handleRequest(request, response);
          } finally {
            await server.close();
          }
        });
        if (response.destroyed) return;
        if (result === 'unauthorized') unauthorized(response, challenge);
        if (result === 'rate-limited') sendError(response, 429, 'T3X API rate limit exceeded.');
      } catch {
        if (response.destroyed) return;
        if (response.headersSent) response.destroy();
        else sendError(response, 502, 'The T3X MCP request could not be served.');
      }
    }
  );

  const origins = new Map<string, string>();
  httpServer.listen(port, host);
  await once(httpServer, 'listening');
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP listener.');
  const addressHost = address.family === 'IPv6' ? `[${address.address}]` : address.address;
  const localUrl = `http://${authority(addressHost, address.port, 80)}${MCP_PATH}`;
  const canonicalUrl = oauth?.resource ?? publicUrl;
  if (canonicalUrl) {
    origins.set(canonicalUrl.host, canonicalUrl.origin);
    if (!canonicalUrl.port) {
      const defaultPort = canonicalUrl.protocol === 'https:' ? 443 : 80;
      origins.set(`${canonicalUrl.host}:${defaultPort}`, canonicalUrl.origin);
    }
  } else {
    for (const loopback of LOOPBACK_HOSTS) {
      const localHost = authority(loopback, address.port, 80);
      origins.set(localHost, `http://${localHost}`);
      if (address.port === 80) origins.set(`${localHost}:80`, `http://${localHost}`);
    }
  }
  console.error(`T3X MCP HTTP listening on ${localUrl}`);
}
