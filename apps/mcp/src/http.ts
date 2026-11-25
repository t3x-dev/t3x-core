import { once } from 'node:events';
import { createServer, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer, type McpServerOptions, runWithMcpApiCredential } from '@t3x-dev/mcp-lib';

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];
const MCP_PATH = '/mcp';

function authority(host: string, port: number, defaultPort: number): string {
  return port === defaultPort ? host : `${host}:${port}`;
}

function sendError(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

function unauthorized(response: ServerResponse): void {
  response.setHeader('WWW-Authenticate', 'Bearer');
  sendError(response, 401, 'A valid T3X Bearer credential is required.');
}

export async function startMcpHttpServer(
  options: McpServerOptions,
  { apiUrl, host, port, publicUrl }: { apiUrl: string; host: string; port: number; publicUrl?: URL }
): Promise<void> {
  const httpServer = createServer(
    { headersTimeout: 10_000, requestTimeout: 30_000 },
    async (request, response) => {
      if (request.url === '/health' && (request.method === 'GET' || request.method === 'HEAD')) {
        response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
        response.end('ok');
        return;
      }
      response.setHeader('Cache-Control', 'no-store');
      if (request.url !== MCP_PATH) {
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
      const token = /^Bearer +([A-Za-z0-9._~+/-]+=*)$/i.exec(
        request.headers.authorization ?? ''
      )?.[1];
      if (!token) {
        unauthorized(response);
        return;
      }

      try {
        const result = await runWithMcpApiCredential(apiUrl, token, async () => {
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
        if (result === 'unauthorized') unauthorized(response);
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
  if (publicUrl) {
    origins.set(publicUrl.host, publicUrl.origin);
    if (!publicUrl.port) origins.set(`${publicUrl.host}:443`, publicUrl.origin);
  } else {
    for (const loopback of LOOPBACK_HOSTS) {
      const localHost = authority(loopback, address.port, 80);
      origins.set(localHost, `http://${localHost}`);
      if (address.port === 80) origins.set(`${localHost}:80`, `http://${localHost}`);
    }
  }
  console.error(`T3X MCP HTTP listening on ${localUrl}`);
}
