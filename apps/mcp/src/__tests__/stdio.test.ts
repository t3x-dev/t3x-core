import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, describe, expect, it } from 'vitest';

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

async function connectConfiguredClient(envOverrides?: Record<string, string>) {
  const repoRoot = path.resolve(process.cwd(), '../..');
  const config = loadRepoMcpServerConfig();
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: {
      ...config.env,
      ...envOverrides,
    },
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

function parseTextResult(result: { content: Array<{ type?: string; text?: string }> }) {
  return JSON.parse(result.content[0].text ?? '{}');
}

const stdioSmokeTimeoutMs = 20_000;

afterEach(async () => {
  while (openClients.length > 0) {
    const client = openClients.pop();
    await client?.close();
  }
});

describe('apps/mcp stdio subprocess smoke', () => {
  it(
    'starts the dist entrypoint from .mcp.json and advertises the full tool surface',
    async () => {
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
    },
    stdioSmokeTimeoutMs
  );

  it(
    'routes diff validation errors through the real stdio subprocess',
    async () => {
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
    },
    stdioSmokeTimeoutMs
  );

  it(
    'advertises Transition resource templates through the real stdio subprocess',
    async () => {
      const { client } = await connectConfiguredClient();
      openClients.push(client);

      const result = await client.listResourceTemplates();

      expect(result.resourceTemplates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'transition',
            uriTemplate: 't3x://projects/{project_id}/transitions/{transition_id}',
            mimeType: 'application/json',
          }),
          expect.objectContaining({
            name: 'workspace',
            uriTemplate: 't3x://projects/{project_id}/workspaces/{workspace_id}',
            mimeType: 'application/json',
          }),
        ])
      );
    },
    stdioSmokeTimeoutMs
  );

  it(
    'routes generate boundary errors through the real stdio subprocess',
    async () => {
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
    },
    stdioSmokeTimeoutMs
  );

  it(
    'routes create_leaf validation through the real stdio subprocess',
    async () => {
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
    },
    stdioSmokeTimeoutMs
  );

  it(
    'refuses Transition resources over stdio when configured for direct storage',
    async () => {
      const { client } = await connectConfiguredClient({
        T3X_TOOLSETS: 'transition',
        T3X_MCP_BACKEND: 'storage',
      });
      openClients.push(client);

      await expect(
        client.readResource({
          uri: 't3x://projects/proj_1/transitions/trn_00000000000000000000000000000001',
        })
      ).rejects.toThrow('T3X_MCP_BACKEND=api');
    },
    stdioSmokeTimeoutMs
  );

  it(
    'advertises transition tools while refusing direct-storage authority paths',
    async () => {
      const { client } = await connectConfiguredClient({
        T3X_TOOLSETS: 'transition',
        T3X_MCP_BACKEND: 'storage',
      });
      openClients.push(client);

      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toEqual([
        'propose_transition',
        'inspect_transition',
        'verify_transition',
        'attach_statement',
        'decide_transition',
        'commit_transition',
      ]);

      const result = await client.callTool({
        name: 'inspect_transition',
        arguments: {
          project_id: 'project-1',
          transition_id: 'sha256:transition-1',
        },
      });

      expect(result.isError).toBe(true);
      expect(parseTextResult(result as Parameters<typeof parseTextResult>[0])).toMatchObject({
        error: {
          code: 'API_BACKEND_REQUIRED',
        },
      });
    },
    stdioSmokeTimeoutMs
  );
});
