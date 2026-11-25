#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer, type McpToolset, parseMcpCapabilities } from '@t3x-dev/mcp-lib';

const SUPPORTED_TOOLSETS = new Set<McpToolset>(['core', 'advanced', 'transition']);

function failConfiguration(message: string): never {
  console.error(message);
  process.exit(1);
  throw new Error(message);
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
const onDiagnostic: NonNullable<Parameters<typeof createMcpServer>[0]['onDiagnostic']> = (
  event
) => {
  console.error(
    JSON.stringify({ component: 'mcp', timestamp: new Date().toISOString(), ...event })
  );
};

const { server } = (() => {
  if (capabilityEnv === undefined) {
    return createMcpServer({
      toolsets: parseToolsets(process.env.T3X_TOOLSETS ?? 'core'),
      onDiagnostic,
    });
  }
  try {
    return createMcpServer({
      toolsets: [],
      capabilities: parseMcpCapabilities(capabilityEnv),
      onDiagnostic,
    });
  } catch {
    return failConfiguration('Invalid T3X_MCP_CAPABILITIES or API backend configuration.');
  }
})();

if (transport === 'stdio') {
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
} else if (transport === 'http') {
  console.error('HTTP transport not yet implemented. Use stdio.');
  process.exit(1);
} else {
  console.error('Unknown T3X_TRANSPORT. Use stdio.');
  process.exit(1);
}
