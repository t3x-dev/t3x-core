#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer, type McpToolset } from '@t3x-dev/mcp-lib';

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

  const invalid = parsed.filter((entry) => !SUPPORTED_TOOLSETS.has(entry as McpToolset));
  if (invalid.length > 0) {
    failConfiguration(
      `Unsupported T3X_TOOLSETS value(s): ${invalid.join(
        ', '
      )}. Use only: core, advanced, transition.`
    );
  }

  return parsed as McpToolset[];
}

const toolsetEnv = process.env.T3X_TOOLSETS ?? 'core';
const toolsets = parseToolsets(toolsetEnv);

const transport = process.env.T3X_TRANSPORT ?? 'stdio';

const { server } = createMcpServer({ toolsets });

if (transport === 'stdio') {
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
} else if (transport === 'http') {
  console.error('HTTP transport not yet implemented. Use stdio.');
  process.exit(1);
} else {
  console.error(`Unknown transport: ${transport}. Use "stdio" or "http".`);
  process.exit(1);
}
