import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const requireMcp = createRequire(new URL('../apps/mcp/package.json', import.meta.url));
const { Client } = requireMcp('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = requireMcp('@modelcontextprotocol/sdk/client/stdio.js');
const root = fileURLToPath(new URL('..', import.meta.url));
const timeout = 10_000;

export async function preflightMcp({ apiUrl, apiKey, profile = 'read-only', expectedTools = [] }) {
  if (!apiUrl || !apiKey) throw new Error('Set T3X_API_URL and T3X_API_KEY explicitly.');
  if (!URL.canParse(apiUrl)) throw new Error('T3X_API_URL must be an HTTP(S) URL.');
  const url = new URL(apiUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('T3X_API_URL must be an HTTP(S) URL without credentials.');
  }
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['apps/mcp/dist/index.js'],
    cwd: root,
    stderr: 'ignore',
    env: {
      T3X_API_URL: url.href.replace(/\/$/, ''),
      T3X_API_KEY: apiKey,
      T3X_MCP_BACKEND: 'api',
      T3X_MCP_CAPABILITIES: profile,
      T3X_CONFIG_PATH: '/dev/null',
      T3X_TRANSPORT: 'stdio',
    },
  });
  let protocolVersion;
  transport.onmessage = (message) => {
    protocolVersion ??= message.result?.protocolVersion;
  };
  const client = new Client({ name: 't3x-mcp-preflight', version: '1.0.0' });
  try {
    await client.connect(transport, { timeout }).catch(() => {
      throw new Error('MCP stdio initialization failed. Check the build and capability profile.');
    });
    const { tools } = await client.listTools({}, { timeout }).catch(() => {
      throw new Error('MCP tool discovery failed.');
    });
    const names = new Set(tools.map(({ name }) => name));
    if (!['t3x_context', ...expectedTools].every((name) => names.has(name))) {
      throw new Error('The capability profile does not expose context and every expected tool.');
    }
    const result = await client
      .callTool({ name: 't3x_context' }, undefined, { timeout })
      .catch(() => {
        throw new Error('MCP credential check did not complete.');
      });
    let context;
    try {
      context = JSON.parse(result.content[0]?.text);
    } catch {
      throw new Error('MCP credential check could not read an API response.');
    }
    if (result.isError || !['human', 'agent'].includes(context?.actor_kind)) {
      const status = context?.error?.status;
      throw new Error(
        status === 401 || status === 403
          ? `The API rejected the credential (HTTP ${status}). Check auth mode and credential scope.`
          : 'MCP credential check failed. Check API reachability and configuration.'
      );
    }
    return { protocolVersion, serverVersion: client.getServerVersion()?.version, tools };
  } finally {
    await client.close();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const profile = process.env.T3X_MCP_CAPABILITIES ?? 'read-only';
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    const result = await preflightMcp({
      apiUrl: process.env.T3X_API_URL,
      apiKey: process.env.T3X_API_KEY,
      profile,
      expectedTools: process.argv.slice(2),
    });
    console.log(JSON.stringify({ revision, profile, ...result }, null, 2));
  } catch (error) {
    console.error(`[mcp-preflight] ${error.message}`);
    process.exitCode = 1;
  }
}
