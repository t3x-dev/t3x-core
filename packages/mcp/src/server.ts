/**
 * createMcpServer — factory that builds a configured MCP server
 * with tools filtered by the requested toolset(s).
 *
 * Core toolset (5 tools):
 *   t3x_query, t3x_commit, t3x_edit, t3x_extract, t3x_generate
 *
 * Advanced toolset (3 additional tools):
 *   t3x_diff, t3x_merge, t3x_admin
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
// Advanced tools
import { adminDef, adminHandler } from './tools/advanced/admin.js';
import { diffDef, diffHandler } from './tools/advanced/diff.js';
import { mergeDef, mergeHandler } from './tools/advanced/merge.js';
// Core tools
import { commitDef, commitHandler } from './tools/core/commit.js';
import { editDef, editHandler } from './tools/core/edit.js';
import { extractDef, extractHandler } from './tools/core/extract.js';
import { generateDef, generateHandler } from './tools/core/generate.js';
import { queryDef, queryHandler } from './tools/core/query.js';
import type { ToolDef, ToolHandler } from './tools/types.js';

// ── Toolset registry ──

interface ToolEntry {
  def: ToolDef;
  handler: ToolHandler;
}

const CORE_TOOLS: ToolEntry[] = [
  { def: queryDef, handler: queryHandler },
  { def: commitDef, handler: commitHandler },
  { def: editDef, handler: editHandler },
  { def: extractDef, handler: extractHandler },
  { def: generateDef, handler: generateHandler },
];

const ADVANCED_TOOLS: ToolEntry[] = [
  { def: diffDef, handler: diffHandler },
  { def: mergeDef, handler: mergeHandler },
  { def: adminDef, handler: adminHandler },
];

const TOOLSET_MAP: Record<'core' | 'advanced', ToolEntry[]> = {
  core: CORE_TOOLS,
  advanced: ADVANCED_TOOLS,
};

// ── Server instructions ──

const SERVER_INSTRUCTIONS = `T3X is a version control system for AI knowledge — like Git, but for structured
knowledge extracted from conversations.

Core workflow:
1. t3x_extract — turn text into structured knowledge (creates a draft)
2. t3x_query — inspect what was extracted (or any other resource)
3. t3x_edit — refine the draft with YOps (YAML operations)
4. t3x_commit — save a snapshot

Additional capabilities (if advanced toolset enabled):
5. t3x_diff — compare two commits
6. t3x_merge — branch and merge knowledge
7. t3x_admin — manage projects, branches, pins

t3x_generate creates validated outputs from committed knowledge.`;

// ── Factory ──

export interface McpServerOptions {
  toolsets: Array<'core' | 'advanced'>;
}

export function createMcpServer(options: McpServerOptions) {
  // 1. Collect active tools based on requested toolsets
  const activeEntries: ToolEntry[] = [];
  const seen = new Set<string>();

  for (const toolset of options.toolsets) {
    const entries = TOOLSET_MAP[toolset];
    if (!entries) continue;
    for (const entry of entries) {
      if (!seen.has(entry.def.name)) {
        seen.add(entry.def.name);
        activeEntries.push(entry);
      }
    }
  }

  // 2. Build tool definitions array and handlers map
  const tools: ToolDef[] = activeEntries.map((e) => e.def);
  const handlers = new Map<string, ToolHandler>();
  for (const entry of activeEntries) {
    handlers.set(entry.def.name, entry.handler);
  }

  // 3. Create the MCP server
  const server = new Server(
    { name: 't3x-mcp', version: '0.1.0' },
    {
      capabilities: { tools: {} },
      instructions: SERVER_INSTRUCTIONS,
    }
  );

  // 4. Register ListTools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // 5. Register CallTool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = handlers.get(name);

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

  return { server, tools };
}
