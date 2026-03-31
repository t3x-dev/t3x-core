#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { browserAuth, clearStoredToken, ensureAuth } from './auth.js';
import { getBaseUrl, getClient, updateToken } from './client.js';
import { checkTool, handleCheck } from './tools/check.js';
import { commitTool, handleCommit } from './tools/commit.js';
import { extractTool, handleExtract } from './tools/extract.js';
import { generateTool, handleGenerate } from './tools/generate.js';
import { handleSchema, schemaTool } from './tools/schema.js';
import { handleShow, showTool } from './tools/show.js';

const tools = [extractTool, commitTool, checkTool, generateTool, showTool, schemaTool];

const handlers: Record<
  string,
  (args: Record<string, unknown>) => Promise<{ content: { type: 'text'; text: string }[] }>
> = {
  [extractTool.name]: handleExtract,
  [commitTool.name]: handleCommit,
  [checkTool.name]: handleCheck,
  [generateTool.name]: handleGenerate,
  [showTool.name]: handleShow,
  [schemaTool.name]: handleSchema,
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

  const baseUrl = getBaseUrl();

  // Ensure auth token is available before calling
  let token = ensureAuth(baseUrl);
  if (!token) {
    try {
      token = await browserAuth(baseUrl);
      updateToken(token);
    } catch (authErr) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Authentication failed: ${authErr instanceof Error ? authErr.message : String(authErr)}`,
          },
        ],
        isError: true,
      };
    }
  } else {
    getClient(token);
  }

  try {
    return await handler(args ?? {});
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    // If 401, token may be expired/revoked — re-auth and retry once
    if (message.includes('401') || message.includes('Unauthorized')) {
      try {
        clearStoredToken();
        const newToken = await browserAuth(baseUrl);
        updateToken(newToken);
        return await handler(args ?? {});
      } catch (retryErr) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Authentication failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
            },
          ],
          isError: true,
        };
      }
    }

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
