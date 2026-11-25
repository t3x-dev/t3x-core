import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { API_BASE, API_ORIGIN } from './api-helpers';

const root = resolve(process.cwd(), '../..');
const requireMcp = createRequire(resolve(root, 'apps/mcp/package.json'));
const { Client } = requireMcp('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = requireMcp('@modelcontextprotocol/sdk/client/stdio.js');
const capabilities =
  'read-only,workspace,workspace:write,schemas:write,transitions,transitions:prepare,transitions:verify,decision:accept,decision:reject,commit';
export const authoringScopes = ['transition:inspect', 'transition:propose', 'transition:verify'];
export const selectedScopes = [
  ...authoringScopes,
  'transition:decide:accept',
  'transition:decide:reject',
  'transition:commit:create',
  'transition:ref:advance',
];

interface FixtureAccount {
  username: string;
  name: string;
  password: string;
  namespace: string;
}

export interface Credential {
  id: string;
  key: string;
  transition_scopes: string[];
  project_id: string;
  expires_at: string;
}

export interface DraftVersion {
  workspaceRevision: number;
  compositionRevision: number;
  basis: { refHead: string | null };
}

export interface PreparedReview {
  view: { transition_id: string; precondition: Record<string, unknown> };
  review: { snapshot_id: string; snapshot_digest: string; address_number: string };
}

interface ToolWireResult {
  isError?: boolean;
  content: Array<{ text?: string }>;
}

export function account(prefix: string): FixtureAccount {
  const run = randomUUID().slice(0, 10);
  return {
    username: `mcp_${prefix}_${run}`,
    name: `MCP ${prefix}`,
    password: randomUUID(),
    namespace: `mcp-${prefix}-${run}`,
  };
}

export function mcpClient(token: string, profile = capabilities) {
  const client = new Client({ name: 't3x-mcp-core-qualification', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['tools/mcp-codex-wrapper.mjs'],
    cwd: root,
    stderr: 'pipe',
    env: {
      T3X_MCP_BACKEND: 'api',
      T3X_API_URL: `${API_ORIGIN}/api`,
      T3X_API_KEY: token,
      T3X_CONFIG_PATH: '/dev/null',
      T3X_MCP_CAPABILITIES: profile,
    },
  });
  const stderr = createInterface({ input: transport.stderr });
  const events: Array<Record<string, unknown>> = [];
  stderr.on('line', (line) => {
    const event = diagnosticEvent(line);
    if (!event) return;
    if (events.length === 300) events.shift();
    events.push(event);
  });
  return {
    async close() {
      try {
        await client.close();
      } finally {
        stderr.close();
        await test.info().attach('MCP diagnostics', {
          contentType: 'application/json',
          body: JSON.stringify({ profile, events }),
        });
      }
    },
    connect: () => client.connect(transport),
    list: () => client.listTools() as Promise<{ tools: Array<{ name: string }> }>,
    call: (name: string, args: Record<string, unknown>) =>
      client.callTool({ name, arguments: args }) as Promise<ToolWireResult>,
    readResource: (uri: string) => client.readResource({ uri }),
  };
}

function diagnosticEvent(line: string): Record<string, unknown> | undefined {
  if (line.length > 1024 || !line.startsWith('{')) return;
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(line);
  } catch {
    return;
  }
  const { component, event } = value;
  if (component !== 'mcp') return;
  if (event === 'process.exited' || event === 'process.launch_failed') {
    return {
      event,
      exit_code: Number.isInteger(value.exit_code) ? value.exit_code : undefined,
      signal: typeof value.signal === 'string' && /^SIG[A-Z0-9]{1,12}$/.test(value.signal) ? value.signal : undefined,
    };
  }
  if (event !== 'tool.finished' && event !== 'api.finished') return;
  const fields: Record<string, unknown> = { event };
  for (const [key, pattern] of Object.entries({
    timestamp: /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/,
    call_id: /^[a-f0-9-]{36}$/,
    http_request_id: /^[a-f0-9-]{36}$/,
    tool: /^[a-z_]{1,80}$/,
    action: /^[a-z_]{1,64}$/,
    outcome: /^(?:success|error)$/,
    error_code: /^[A-Z][A-Z0-9_]{0,95}$/,
  })) {
    const item = value[key];
    if (typeof item === 'string' && pattern.test(item)) fields[key] = item;
  }
  for (const key of ['http_status', 'duration_ms']) {
    if (Number.isInteger(value[key])) fields[key] = value[key];
  }
  return fields;
}

export type Mcp = ReturnType<typeof mcpClient>;
export type ApiCall = <T>(
  method: string,
  path: string,
  body?: Record<string, unknown>
) => Promise<T>;
const evidenceText =
  'V1 fixture. Fixture users need to verify the core loop and read the resulting exact Commit. Acceptance: read the fixed Commit.';

export function personApi(request: APIRequestContext, base: string, token?: string): ApiCall {
  return async (method, path, body) => {
    const result = await request.fetch(`${base}${path}`, {
      method,
      data: body,
      headers: token ? { Authorization: `Bearer ${token}` } : { Origin: new URL(base).origin },
    });
    // Response bodies from credential and authentication routes can contain secrets.
    expect(result.ok(), `${method} ${path}: ${result.status()}`).toBe(true);
    return (await result.json()).data;
  };
}

async function uploadEvidence(
  request: APIRequestContext,
  base: string,
  projectId: string,
  token?: string
) {
  const result = await request.post(`${base}/projects/${projectId}/materials/document`, {
    headers: token ? { Authorization: `Bearer ${token}` } : { Origin: new URL(base).origin },
    multipart: {
      file: {
        name: 'core-loop-evidence.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(evidenceText),
      },
    },
  });
  expect(result.ok(), 'Upload fixture evidence').toBe(true);
  return (await result.json()).data as { id: string; content_hash: string };
}

export async function registerDirect(request: APIRequestContext, identity: FixtureAccount) {
  const api = personApi(request, API_BASE);
  const { api_key: session } = await api<{ api_key: string }>('POST', '/auth/register', {
    username: identity.username,
    password: identity.password,
    name: identity.name,
  });
  const actor = personApi(request, API_BASE, session);
  await actor('POST', '/namespaces', { slug: identity.namespace });
  return {
    actor,
    session,
    evidence: (id: string) => uploadEvidence(request, API_BASE, id, session),
  };
}

export function browserApi(page: Page): ApiCall {
  return async (method, path, body) => {
    const result = await page.evaluate(
      async ({ method, path, body }) => {
        const response = await fetch(`/api/v1${path}`, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : {},
          body: body ? JSON.stringify(body) : undefined,
        });
        return {
          status: response.status,
          data: response.ok ? (await response.json()).data : undefined,
        };
      },
      { method, path, body }
    );
    expect(result.status, `${method} ${path}`).toBeLessThan(300);
    return result.data;
  };
}

async function uploadBrowserEvidence(page: Page, projectId: string) {
  const result = await page.evaluate(
    async ({ projectId, evidenceText }) => {
      const form = new FormData();
      form.append(
        'file',
        new File([evidenceText], 'core-loop-evidence.txt', { type: 'text/plain' })
      );
      const response = await fetch(`/api/v1/projects/${projectId}/materials/document`, {
        method: 'POST',
        body: form,
      });
      return { ok: response.ok, data: (await response.json()).data };
    },
    { projectId, evidenceText }
  );
  expect(result.ok, 'Upload fixture evidence through Web').toBe(true);
  return result.data as { id: string; content_hash: string };
}

export async function registerBrowser(page: Page, identity: FixtureAccount) {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Username').fill(identity.username);
  await page.getByLabel('Password').fill(identity.password);
  await page.getByLabel(/Display name/).fill(identity.name);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL('/onboarding/namespace');
  await page.getByLabel('Personal namespace').fill(identity.namespace);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(`/${identity.namespace}`);
  const session = (await page.context().cookies()).find(({ name }) => name === 't3x-session');
  if (!session?.httpOnly) throw new Error('An HTTP-only Web session was not established.');
  return {
    actor: browserApi(page),
    session: session.value,
    evidence: (id: string) => uploadBrowserEvidence(page, id),
  };
}

export async function mintDirect(
  actor: ApiCall,
  projectId: string,
  scopes: string[] = selectedScopes
) {
  return actor<Credential>('POST', '/api-keys', {
    name: 'V1 agent fixture',
    project_id: projectId,
    principal_kind: 'agent',
    transition_scopes: scopes,
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  });
}

export async function mintBrowser(page: Page, projectId: string, screenshot: string) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/settings/api-tokens');
  await page.getByRole('button', { name: 'Create token', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Token type').selectOption('agent');
  await dialog.getByLabel('Token name').fill('V1 Web Agent');
  await dialog.getByLabel('Project ID').fill(projectId);
  await expect(dialog.getByLabel('Expires in (days)')).toHaveValue('7');
  for (const name of [
    'Accept changes',
    'Reject changes',
    'Create commits',
    'Advance branch refs',
  ]) {
    await dialog.getByRole('checkbox', { name, exact: true }).check();
  }
  await page.screenshot({ path: screenshot, animations: 'disabled' });
  const issued = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v1/api-keys'
  );
  await dialog.getByRole('button', { name: /^Create/ }).click();
  const response = await issued;
  expect(response.status()).toBe(201);
  const { data } = (await response.json()) as { data: Credential };
  expect(data.project_id).toBe(projectId);
  expect([...data.transition_scopes].sort()).toEqual([...selectedScopes].sort());
  expect(Math.abs(Date.parse(data.expires_at) - Date.now() - 7 * 86400000)).toBeLessThan(30000);
  await page.goto('/settings/api-tokens');
  await expect(page.getByText('V1 Web Agent', { exact: true }).first()).toBeVisible();
  return data;
}

export async function revokeBrowser(page: Page) {
  await page.goto('/settings/api-tokens');
  await page.getByRole('button', { name: 'Actions for V1 Web Agent', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  const revoked = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' &&
      new URL(response.url()).pathname.startsWith('/api/v1/api-keys/')
  );
  await page.getByText('Revoke token', { exact: true }).click();
  expect((await revoked).ok()).toBe(true);
  await expect(page.getByText('API token revoked', { exact: true })).toBeVisible();
}

export async function invoke<T>(
  client: Mcp,
  tool: string,
  args: Record<string, unknown>
): Promise<T> {
  const result = await client.call(tool, args).catch(() => {
    throw new Error(`${tool}: MCP call interrupted. See the attached process diagnostics.`);
  });
  let payload: { error?: { code?: unknown; call_id?: unknown; write_outcome?: unknown } };
  try {
    payload = JSON.parse(result.content[0]?.text ?? '');
  } catch {
    throw new Error(`${tool}: MCP returned a result without readable JSON. See the attached diagnostics.`);
  }
  if (result.isError) {
    const { code, call_id, write_outcome } = payload?.error ?? {};
    const reason = typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,95}$/.test(code) ? code : 'TOOL_ERROR';
    const reference = typeof call_id === 'string' && /^[a-f0-9-]{36}$/.test(call_id) ? ` Call ${call_id}.` : '';
    const outcome = write_outcome === 'unconfirmed' ? ' Write result unconfirmed. Read back the authorized result before retrying.' : '';
    throw new Error(`${tool}: ${reason}.${reference}${outcome}`);
  }
  return payload as T;
}

export async function denied(client: Mcp, tool: string, args: Record<string, unknown>) {
  const result = await client.call(tool, args).catch((error: unknown) => {
    if (!(error instanceof Error) || !('code' in error) || error.code !== -32602 ||
      !error.message.includes('Unknown tool.')) throw error;
    return { isError: true };
  });
  expect(result.isError, tool).toBe(true);
}
