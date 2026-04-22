import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
const tempDirs: string[] = [];

function parseTextResult(result: { content: Array<{ type?: string; text?: string }> }) {
  return JSON.parse(result.content[0].text ?? '{}');
}

function createRealE2EEnv(): Record<string, string> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 't3x-mcp-stdio-'));
  tempDirs.push(dataDir);

  const env: Record<string, string> = {
    T3X_DATA_DIR: dataDir,
    T3X_PG_PORT: String(6400 + Math.floor(Math.random() * 500)),
  };

  const passthroughKeys = [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'GOOGLE_AI_STUDIO_KEY',
  ] as const;

  for (const key of passthroughKeys) {
    const value = process.env[key];
    if (value) {
      env[key] = value;
    }
  }

  return env;
}

const runRealE2E =
  process.env.T3X_RUN_REAL_MCP_E2E === '1' &&
  Boolean(
    process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.GOOGLE_AI_STUDIO_KEY
  );

const maybeRealE2E = runRealE2E ? it : it.skip;

afterEach(async () => {
  while (openClients.length > 0) {
    const client = openClients.pop();
    await client?.close();
  }

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
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

  maybeRealE2E(
    'runs create_project -> extract -> commit -> create_leaf -> generate over the real stdio subprocess',
    async () => {
      const { client } = await connectConfiguredClient(createRealE2EEnv());
      openClients.push(client);

      const project = parseTextResult(
        await client.callTool({
          name: 't3x_admin',
          arguments: {
            action: 'create_project',
            name: 'Real MCP Leaf Flow',
          },
        })
      );

      const extract = parseTextResult(
        await client.callTool({
          name: 't3x_extract',
          arguments: {
            project_id: project.project_id,
            text: 'Plan a Tokyo trip with budget 5000 and include one short summary.',
          },
        })
      );

      const commit = parseTextResult(
        await client.callTool({
          name: 't3x_commit',
          arguments: {
            project_id: project.project_id,
            draft_id: extract.draft_id,
            message: 'Snapshot for real stdio leaf generation',
          },
        })
      );

      const leaf = parseTextResult(
        await client.callTool({
          name: 't3x_admin',
          arguments: {
            action: 'create_leaf',
            project_id: project.project_id,
            commit_hash: commit.commit_hash,
            leaf_type: 'tweet',
            title: 'Trip summary',
            constraints: [
              {
                type: 'require',
                match_mode: 'exact',
                value: 'Tokyo',
              },
            ],
          },
        })
      );

      const generated = parseTextResult(
        await client.callTool({
          name: 't3x_generate',
          arguments: {
            leaf_id: leaf.leaf_id,
          },
        })
      );

      expect(leaf.commit_hash).toBe(commit.commit_hash);
      expect(leaf.type).toBe('tweet');
      expect(generated.leaf_id).toBe(leaf.leaf_id);
      expect(typeof generated.output).toBe('string');
      expect(generated.output.length).toBeGreaterThan(0);
      expect(generated.score.total).toBeGreaterThanOrEqual(1);
    }
  );
});
