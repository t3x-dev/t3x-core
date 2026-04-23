import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from '../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

const root = process.cwd();
const config = JSON.parse(readFileSync(path.join(root, '.mcp.json'), 'utf8'));
const serverConfig = config.mcpServers.t3x;

const transport = new StdioClientTransport({
  command: serverConfig.command,
  args: serverConfig.args,
  cwd: path.resolve(root, serverConfig.cwd),
  env: {
    ...process.env,
    ...serverConfig.env,
  },
});

const client = new Client({ name: 'mcp-api-smoke', version: '0.0.0' });

try {
  await client.connect(transport);
  const result = await client.callTool({
    name: 't3x_query',
    arguments: { target: 'project', id: 'proj_3016bbc4' },
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await client.close();
}
