#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { checkTool, handleCheck } from './tools/check.js';
import { commitTool, handleCommit } from './tools/commit.js';
import { extractTool, handleExtract } from './tools/extract.js';
import { generateTool, handleGenerate } from './tools/generate.js';
import { handleShow, showTool } from './tools/show.js';

const tools = [extractTool, commitTool, checkTool, generateTool, showTool];

const handlers: Record<
  string,
  (args: Record<string, unknown>) => Promise<{ content: { type: 'text'; text: string }[] }>
> = {
  [extractTool.name]: handleExtract,
  [commitTool.name]: handleCommit,
  [checkTool.name]: handleCheck,
  [generateTool.name]: handleGenerate,
  [showTool.name]: handleShow,
};

const server = new Server({ name: 't3x-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = handlers[name];

  if (!handler) {
    return {
      content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    return await handler(args ?? {});
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text' as const, text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  process.stderr.write(`Fatal: ${error}\n`);
  process.exit(1);
});
