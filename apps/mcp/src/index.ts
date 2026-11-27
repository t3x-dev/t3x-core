#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { mcpOAuthConfig } from '@t3x-dev/api/mcp-oauth';
import {
  createMcpServer,
  type McpServerOptions,
  type McpToolset,
  parseMcpCapabilities,
} from '@t3x-dev/mcp-lib';
import { managedMcpCapabilities, startMcpHttpServer } from './http.js';

const SUPPORTED_TOOLSETS = new Set<McpToolset>(['core', 'advanced', 'transition']);

function failConfiguration(message: string): never {
  console.error(message);
  process.exit(1);
  throw new Error(message);
}

function parseUrl(value: string | undefined): URL | undefined {
  if (value && URL.canParse(value)) return new URL(value);
}

function parseToolsets(value: string): McpToolset[] {
  const parsed = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (parsed.length === 0) {
    failConfiguration('T3X_TOOLSETS must include at least one of: core, advanced, transition.');
  }

  if (parsed.some((entry) => !SUPPORTED_TOOLSETS.has(entry as McpToolset))) {
    failConfiguration('Unsupported T3X_TOOLSETS value. Use only: core, advanced, transition.');
  }

  return parsed as McpToolset[];
}

const capabilityEnv = process.env.T3X_MCP_CAPABILITIES;
const transport = process.env.T3X_TRANSPORT ?? 'stdio';
const oauth = (() => {
  if (transport !== 'http') return;
  try {
    return mcpOAuthConfig();
  } catch {
    return failConfiguration(
      'Invalid MCP OAuth configuration. Check the resource URL, issuer origin and 32-byte secret.'
    );
  }
})();
const onDiagnostic: NonNullable<Parameters<typeof createMcpServer>[0]['onDiagnostic']> = (
  event
) => {
  console.error(
    JSON.stringify({ component: 'mcp', timestamp: new Date().toISOString(), ...event })
  );
};

const options: McpServerOptions = (() => {
  if (capabilityEnv === undefined) {
    if (oauth) return { toolsets: [], capabilities: managedMcpCapabilities, onDiagnostic };
    return {
      toolsets: parseToolsets(process.env.T3X_TOOLSETS ?? 'core'),
      onDiagnostic,
    };
  }
  try {
    return {
      toolsets: [],
      capabilities: parseMcpCapabilities(capabilityEnv),
      onDiagnostic,
    };
  } catch {
    return failConfiguration('Invalid T3X_MCP_CAPABILITIES or API backend configuration.');
  }
})();

if (transport === 'stdio') {
  let server: ReturnType<typeof createMcpServer>['server'];
  try {
    ({ server } = createMcpServer(options));
  } catch (error) {
    if (capabilityEnv !== undefined)
      failConfiguration('Invalid T3X_MCP_CAPABILITIES or API backend configuration.');
    throw error;
  }
  await server.connect(new StdioServerTransport());
} else if (transport === 'http') {
  if (process.env.T3X_MCP_BACKEND?.trim().toLowerCase() !== 'api' || !options.capabilities) {
    failConfiguration('HTTP transport requires T3X_MCP_BACKEND=api and T3X_MCP_CAPABILITIES.');
  }
  const apiUrl = parseUrl(process.env.T3X_API_URL);
  if (
    !apiUrl ||
    !['http:', 'https:'].includes(apiUrl.protocol) ||
    apiUrl.username ||
    apiUrl.password ||
    apiUrl.search ||
    apiUrl.hash
  ) {
    failConfiguration(
      'HTTP transport requires an explicit HTTP(S) T3X_API_URL without credentials, query, or fragment.'
    );
  }
  const portValue = process.env.PORT ?? '3001';
  const port = Number(portValue);
  const host = process.env.HOST?.trim() ?? '127.0.0.1';
  if (!/^\d{1,5}$/.test(portValue) || port > 65535) {
    failConfiguration('PORT must be an integer from 0 to 65535.');
  }
  if (!host) failConfiguration('HOST must identify the MCP HTTP listener.');
  const externalEndpoint = process.env.T3X_MCP_PUBLIC_URL;
  const publicUrl = parseUrl(externalEndpoint);
  if (
    externalEndpoint !== undefined &&
    (!publicUrl ||
      publicUrl.protocol !== 'https:' ||
      publicUrl.pathname !== '/mcp' ||
      publicUrl.username ||
      publicUrl.password ||
      publicUrl.search ||
      publicUrl.hash)
  ) {
    failConfiguration(
      'T3X_MCP_PUBLIC_URL must be an HTTPS /mcp URL without credentials, query, or fragment.'
    );
  }
  if (oauth && publicUrl && oauth.resource.href !== publicUrl.href) {
    failConfiguration('T3X_MCP_PUBLIC_URL and T3X_MCP_RESOURCE_URL must match.');
  }
  if (
    !publicUrl &&
    oauth?.resource.protocol !== 'https:' &&
    !['127.0.0.1', 'localhost', '::1'].includes(host)
  ) {
    failConfiguration('Binding HTTP transport beyond loopback requires T3X_MCP_PUBLIC_URL.');
  }
  try {
    await startMcpHttpServer(options, { apiUrl: apiUrl.href, host, port, publicUrl, oauth });
  } catch {
    failConfiguration('Could not start the MCP HTTP listener. Check HOST and PORT.');
  }
} else {
  failConfiguration('Unknown T3X_TRANSPORT. Use stdio or http.');
}
