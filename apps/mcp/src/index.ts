#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from '@t3x-dev/mcp-lib';

const toolsetEnv = process.env.T3X_TOOLSETS ?? 'core';
const toolsets = toolsetEnv.split(',').map((s) => s.trim()) as Array<'core' | 'advanced'>;

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
