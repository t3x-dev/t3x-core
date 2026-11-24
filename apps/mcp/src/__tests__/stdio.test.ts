import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
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
          't3x_resolve_repository',
          't3x_committed_state',
          't3x_open_workspace',
          't3x_draft_review',
          't3x_commit_result',
        ])
      );
      expect(names).not.toContain('t3x_create_leaf');
    },
    stdioSmokeTimeoutMs
  );

  it(
    'enforces a read-only business profile for direct calls, resources, and prompts',
    async () => {
      const requested: string[] = [];
      const api = createServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://fixture.test');
        requested.push(url.pathname + url.search);
        response.setHeader('Content-Type', 'application/json');
        if (request.headers.authorization !== 'Bearer fixture-valid') {
          response.statusCode = 401;
          response.end(
            JSON.stringify({
              success: false,
              error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
            })
          );
          return;
        }
        if (url.pathname === '/api/v1/auth/me/credential') {
          response.end(
            JSON.stringify({
              success: true,
              data: {
                actor_kind: 'human',
                credential_kind: 'api_key',
                project_id: null,
                namespace_id: null,
                transition_scopes: [],
              },
            })
          );
          return;
        }
        response.end(JSON.stringify({ success: true, data: { branches: [] } }));
      });
      await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
      const base = {
        T3X_MCP_BACKEND: 'api',
        T3X_MCP_CAPABILITIES: 'read-only',
        T3X_API_URL: `http://127.0.0.1:${(api.address() as AddressInfo).port}/api`,
      };
      try {
        const { client } = await connectConfiguredClient({ ...base, T3X_API_KEY: 'fixture-valid' });
        openClients.push(client);
        const { tools } = await client.listTools();
        expect(tools.map((tool) => tool.name).sort()).toEqual([
          't3x_committed_state',
          't3x_context',
          't3x_diff',
          't3x_query',
          't3x_read_state_presentation',
          't3x_resolve_repository',
        ]);
        expect(
          tools.find((tool) => tool.name === 't3x_query')?.inputSchema.properties?.target
        ).toMatchObject({ enum: ['project', 'projects', 'branches', 'commit', 'commits'] });
        expect(
          (await client.listResourceTemplates()).resourceTemplates.map((item) => item.name)
        ).toEqual(['project', 'commit']);
        expect((await client.listPrompts()).prompts).toEqual([]);

        expect(
          (
            await client.callTool({
              name: 't3x_query',
              arguments: { target: 'workspace', id: 'ws' },
            })
          ).isError
        ).toBe(true);
        expect((await client.callTool({ name: 't3x_commit', arguments: {} })).isError).toBe(true);
        await expect(
          client.readResource({ uri: 't3x://conversations/conv_fixture' })
        ).rejects.toThrow('unavailable');
        await expect(
          client.getPrompt({
            name: 'extract_review_commit',
            arguments: { project_id: 'proj_fixture' },
          })
        ).rejects.toThrow('unavailable');
        expect(requested).toEqual([]);

        const branches = await client.callTool({
          name: 't3x_query',
          arguments: { target: 'branches', project_id: 'proj_fixture' },
        });
        expect(branches.isError).not.toBe(true);
        expect(requested).toHaveLength(2);
        expect(requested[0]).toBe('/api/v1/auth/me/credential');
        expect(requested[1]).toContain('initialize_main=0');
        const resource = await client.readResource({ uri: 't3x://projects/proj_fixture' });
        expect(resource.contents).toHaveLength(1);
        expect(requested.slice(2)).toEqual([
          '/api/v1/auth/me/credential',
          '/api/v1/projects/proj_fixture',
        ]);

        const { client: invalid } = await connectConfiguredClient({
          ...base,
          T3X_API_KEY: 'fixture-invalid',
        });
        openClients.push(invalid);
        const denied = await invalid.callTool({
          name: 't3x_query',
          arguments: { target: 'branches', project_id: 'proj_fixture' },
        });
        expect(denied.isError).toBe(true);
        expect(parseTextResult(denied as Parameters<typeof parseTextResult>[0])).toMatchObject({
          error: { status: 401 },
        });
        expect(requested).toHaveLength(5);
      } finally {
        api.closeAllConnections();
        await new Promise<void>((resolve) => api.close(() => resolve()));
      }
    },
    stdioSmokeTimeoutMs
  );

  it(
    'selects individual Decision outcomes and limits aliased multi-action tools',
    async () => {
      const { client } = await connectConfiguredClient({
        T3X_MCP_BACKEND: 'api',
        T3X_MCP_CAPABILITIES: 'workspace:write,transitions,decision:accept',
      });
      openClients.push(client);
      const { tools } = await client.listTools();
      expect(
        tools.find((tool) => tool.name === 'decide_transition')?.inputSchema.properties?.outcome
      ).toMatchObject({ enum: ['accepted'] });
      expect(
        tools.find((tool) => tool.name === 't3x_draft_review')?.inputSchema.properties?.action
      ).toMatchObject({ enum: ['read'] });
      expect(tools.map((tool) => tool.name)).not.toContain('commit_transition');
      for (const [name, args] of [
        ['decide_transition', { outcome: 'rejected' }],
        ['t3x_draft_review', { action: 'prepare' }],
        ['t3x_edit', {}],
      ] as const) {
        const result = await client.callTool({ name, arguments: args });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Action is unavailable');
      }

      const { client: commitOnly } = await connectConfiguredClient({
        T3X_MCP_BACKEND: 'api',
        T3X_MCP_CAPABILITIES: 'commit',
      });
      openClients.push(commitOnly);
      expect((await commitOnly.listTools()).tools.map((tool) => tool.name)).toEqual([
        't3x_commit',
        'commit_transition',
      ]);
    },
    stdioSmokeTimeoutMs
  );

  it(
    'rejects a business profile for direct storage',
    async () => {
      await expect(
        connectConfiguredClient({
          T3X_MCP_BACKEND: 'storage',
          T3X_MCP_CAPABILITIES: 'read-only',
        })
      ).rejects.toThrow();
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
    'routes generate retirement through the real stdio subprocess',
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
      expect(result.content[0].text).toContain('LEAF_WRITER_RETIRED');
    },
    stdioSmokeTimeoutMs
  );

  it(
    'routes create_leaf retirement through the real stdio subprocess',
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
      expect(result.content[0].text).toContain('LEAF_WRITER_RETIRED');
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
        't3x_draft_review',
        't3x_commit_result',
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
