import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

type McpServerConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

function loadRepoMcpServerConfig(): McpServerConfig {
  const repoRoot = path.resolve(process.cwd(), '../..');
  const raw = readFileSync(path.join(repoRoot, '.mcp.json'), 'utf8');
  const parsed = JSON.parse(raw) as {
    mcpServers?: Record<string, McpServerConfig>;
  };
  const config = parsed.mcpServers?.t3x;

  if (!config) {
    throw new Error('Missing t3x MCP server config in .mcp.json');
  }

  return config;
}

async function connectConfiguredClient() {
  const repoRoot = path.resolve(process.cwd(), '../..');
  const config = loadRepoMcpServerConfig();
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: config.env,
    cwd: repoRoot,
    stderr: 'pipe',
  });
  const client = new Client(
    { name: 't3x-mcp-stdio-test-client', version: '0.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  return { client, transport };
}

const openClients: Client[] = [];

afterEach(async () => {
  while (openClients.length > 0) {
    const client = openClients.pop();
    await client?.close();
  }
});

describe('apps/mcp stdio subprocess smoke', () => {
  it('starts the dist entrypoint from .mcp.json and advertises the full tool surface', async () => {
    const { client } = await connectConfiguredClient();
    openClients.push(client);

    const result = await client.listTools();
    const names = result.tools.map((tool) => tool.name);

    expect(names).toEqual(
      expect.arrayContaining([
        't3x_query',
        't3x_commit',
        't3x_edit',
        't3x_extract',
        't3x_generate',
        't3x_diff',
        't3x_merge',
        't3x_admin',
      ])
    );
    expect(names).not.toContain('t3x_create_leaf');
  });

  it('routes diff validation errors through the real stdio subprocess', async () => {
    const { client } = await connectConfiguredClient();
    openClients.push(client);

    const result = await client.callTool({
      name: 't3x_diff',
      arguments: {
        source: 'sha256:aaa',
        target: 'sha256:bbb',
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"base" is required');
  });

  it('routes generate boundary errors through the real stdio subprocess', async () => {
    const { client } = await connectConfiguredClient();
    openClients.push(client);

    const result = await client.callTool({
      name: 't3x_generate',
      arguments: {
        commit_hash: 'sha256:commit1',
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"leaf_id" is required');
  });

  it('routes create_leaf validation through the real stdio subprocess', async () => {
    const { client } = await connectConfiguredClient();
    openClients.push(client);

    const result = await client.callTool({
      name: 't3x_admin',
      arguments: {
        action: 'create_leaf',
        commit_hash: 'sha256:commit1',
        leaf_type: 'tweet',
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"project_id" is required');
  });
});
