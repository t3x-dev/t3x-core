import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { API_BASE, API_ORIGIN } from '../fixtures/api-helpers';

const authEnabled = process.env.T3X_E2E_AUTH_ENABLED === '1';
const qualificationPhase = process.env.T3X_E2E_MCP_PHASE;
const root = resolve(process.cwd(), '../..');
const requireMcp = createRequire(resolve(root, 'apps/mcp/package.json'));
const { Client } = requireMcp('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = requireMcp('@modelcontextprotocol/sdk/client/stdio.js');
const capabilities =
  'read-only,workspace,workspace:write,schemas:write,transitions,transitions:prepare,transitions:verify,decision:accept,decision:reject,commit';
const authoringScopes = ['transition:inspect', 'transition:propose', 'transition:verify'];
const selectedScopes = [
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

interface Credential {
  id: string;
  key: string;
  transition_scopes: string[];
  project_id: string;
  expires_at: string;
}

interface DraftVersion {
  workspaceRevision: number;
  compositionRevision: number;
  basis: { refHead: string | null };
}

interface PreparedReview {
  view: { transition_id: string; precondition: Record<string, unknown> };
  review: { snapshot_id: string; snapshot_digest: string; address_number: string };
}

interface ToolWireResult {
  isError?: boolean;
  content: Array<{ text?: string }>;
}

function account(prefix: string): FixtureAccount {
  const run = randomUUID().slice(0, 10);
  return {
    username: `mcp_${prefix}_${run}`,
    name: `MCP ${prefix}`,
    password: randomUUID(),
    namespace: `mcp-${prefix}-${run}`,
  };
}

function mcpClient(token: string, profile = capabilities) {
  const client = new Client({ name: 't3x-mcp-core-qualification', version: '1.0.0' });
  return {
    close: () => client.close(),
    connect: () =>
      client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: ['apps/mcp/dist/index.js'],
          cwd: root,
          stderr: 'pipe',
          env: {
            T3X_MCP_BACKEND: 'api',
            T3X_API_URL: `${API_ORIGIN}/api`,
            T3X_API_KEY: token,
            T3X_CONFIG_PATH: '/dev/null',
            T3X_MCP_CAPABILITIES: profile,
          },
        })
      ),
    list: () => client.listTools() as Promise<{ tools: Array<{ name: string }> }>,
    call: (name: string, args: Record<string, unknown>) =>
      client.callTool({ name, arguments: args }) as Promise<ToolWireResult>,
    readResource: (uri: string) => client.readResource({ uri }),
  };
}

type Mcp = ReturnType<typeof mcpClient>;
type ApiCall = <T>(method: string, path: string, body?: Record<string, unknown>) => Promise<T>;
const evidenceText =
  'V1 fixture. Fixture users need to verify the core loop and read the resulting exact Commit. Acceptance: read the fixed Commit.';

function personApi(request: APIRequestContext, base: string, token?: string): ApiCall {
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

async function registerDirect(request: APIRequestContext, identity: FixtureAccount) {
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

function browserApi(page: Page): ApiCall {
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

async function registerBrowser(page: Page, identity: FixtureAccount) {
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

async function mintDirect(actor: ApiCall, projectId: string, scopes: string[] = selectedScopes) {
  return actor<Credential>('POST', '/api-keys', {
    name: 'V1 agent fixture',
    project_id: projectId,
    principal_kind: 'agent',
    transition_scopes: scopes,
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  });
}

async function mintBrowser(page: Page, projectId: string, screenshot: string) {
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

async function revokeBrowser(page: Page) {
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

async function invoke<T>(client: Mcp, tool: string, args: Record<string, unknown>): Promise<T> {
  const result = await client.call(tool, args);
  expect(result.isError, `${tool}: ${result.content[0]?.text ?? 'missing result'}`).not.toBe(true);
  return JSON.parse(result.content[0]?.text ?? '{}') as T;
}

async function denied(client: Mcp, tool: string, args: Record<string, unknown>) {
  expect((await client.call(tool, args)).isError, tool).toBe(true);
}

function policyFor(agent: Credential) {
  const any = { mode: 'any' };
  const claim = {
    allowedModes: ['authored', 'inferred', 'stated', 'unspecified'],
    minimumEvidence: 0,
    humanConfirmation: 'not_required',
  };
  const allow = { issuers: any, tools: any, environments: any };
  return {
    schema: 't3x.dev/acceptance-policy/v1',
    version: 1,
    authorization: {
      decide: {
        actors: { mode: 'one_of', values: [{ kind: 'agent', id: `agent:api-key:${agent.id}` }] },
      },
      override: {
        actors: { mode: 'one_of', values: [{ kind: 'human', id: 'user:no-override-fixture' }] },
      },
      allowSelfApproval: false,
    },
    claims: { intent: claim, rationale: claim },
    checks: {
      replay: allow,
      validation: { ...allow, requirement: 'optional', profiles: any, schemas: any, contexts: any },
      humanConfirmation: { issuers: any },
    },
    override: {
      allowClaimFailures: false,
      allowFailedValidation: false,
      allowMissingHumanConfirmation: false,
      allowMissingValidation: false,
    },
  };
}

async function qualifyCore(input: {
  actor: ApiCall;
  operatorSession: string;
  namespace: string;
  outsiderSession: string;
  issue: (id: string) => Promise<Credential>;
  evidence: (id: string) => Promise<{ id: string; content_hash: string }>;
  web?: Page;
}) {
  const repo = 'Core-loop-fixture';
  const { project_id } = await input.actor<{ project_id: string }>('POST', '/projects', {
    name: repo,
    namespace: input.namespace,
  });
  const projectUrl = `/projects/${project_id}`;
  const agent = await input.issue(project_id);
  const otherKey = await mintDirect(input.actor, project_id, authoringScopes);
  const [human, machine, outsider, limited, readonly] = [
    mcpClient(input.operatorSession),
    mcpClient(agent.key),
    mcpClient(input.outsiderSession),
    mcpClient(otherKey.key),
    mcpClient(agent.key, 'read-only'),
  ];
  try {
    await Promise.all(
      [human, machine, outsider, limited, readonly].map((client) => client.connect())
    );
    expect((await readonly.list()).tools.map(({ name }) => name)).not.toContain('t3x_commit');
    await denied(readonly, 't3x_query', { target: 'workspace_activity', project_id, id: 'hidden' });
    await expect(
      readonly.readResource(`t3x://projects/${project_id}/workspaces/hidden`)
    ).rejects.toThrow();
    const context = await invoke<{ actor_kind: string; project_id: string }>(
      machine,
      't3x_context',
      {}
    );
    expect(context).toMatchObject({ actor_kind: 'agent', project_id });
    expect(await invoke(human, 't3x_context', {})).toMatchObject({ actor_kind: 'human' });

    const repository = `${input.namespace}/${repo}`;
    const branch = (client: Mcp, ref: string) =>
      invoke<{ head_commit_hash: string | null; canonical_path: string }>(
        client,
        't3x_resolve_repository',
        { repository, ref }
      );
    const empty = await branch(machine, 'main');
    expect(empty.head_commit_hash).toBeNull();
    await denied(outsider, 't3x_resolve_repository', { repository, ref: 'main' });

    // Pin the first Schema through the existing human Web Workspace entry on the empty ref.
    const material = await input.evidence(project_id);
    const workspace_id = 'core-first-schema';
    const workspaceUrl = `${projectUrl}/workspaces/${workspace_id}`;
    const created = await input.actor<{ workspace: { revision: number } }>('PATCH', workspaceUrl, {
      workspace: {
        id: workspace_id,
        title: 'First Schema',
        targetBranch: 'main',
        status: 'draft',
        baseCommitHash: null,
        sourceBundle: [
          {
            id: `material:${material.id}`,
            type: 'document',
            title: 'core-loop-evidence.txt',
            materialId: material.id,
            contentHash: material.content_hash,
          },
        ],
        schemaBindings: [
          {
            canonicalName: 't3x/prd',
            version: 'v2',
            mode: 'pinned',
            rootKey: 'prd',
          },
        ],
        yopsDraft: { id: 'core-first-draft', operations: [] },
      },
    });
    await input.actor('POST', `${workspaceUrl}/authoring`, {
      request_id: randomUUID(),
      expected_workspace_revision: created.workspace.revision,
      expected_ref_head: null,
    });

    const activity = (id: string) =>
      invoke<DraftVersion>(human, 't3x_query', { target: 'workspace_activity', project_id, id });
    const exactDraft = (draft: DraftVersion) => ({
      expected_workspace_revision: draft.workspaceRevision,
      expected_revision: draft.compositionRevision,
      expected_ref_head: draft.basis.refHead,
    });
    const prepare = async (id: string, client = human) =>
      invoke<PreparedReview>(client, 't3x_draft_review', {
        action: 'prepare',
        project_id,
        workspace_id: id,
        request_id: randomUUID(),
        ...exactDraft(await activity(id)),
      });
    const machineSchema = await machine.call('t3x_edit', {
      mode: 'schema',
      project_id,
      workspace_id,
      request_id: randomUUID(),
      ...exactDraft(await activity(workspace_id)),
      schema_settings: {
        action: 'add_node',
        nodePath: '',
        name: 'disallowed',
        definition: {},
        intent: 'Fixture negative human-only check',
      },
    });
    expect(machineSchema.isError).toBe(true);
    expect(machineSchema.content[0]?.text).toContain('human principal');
    const firstReview = await prepare(workspace_id);
    const decideArgs = (review: PreparedReview, outcome: 'accepted' | 'rejected') => ({
      project_id,
      transition_id: review.view.transition_id,
      request_id: randomUUID(),
      outcome,
      precondition: review.view.precondition,
    });
    const fromSnapshot = await invoke<{ snapshot_digest: string }>(human, 't3x_draft_review', {
      action: 'read',
      project_id,
      workspace_id,
      snapshot_id: firstReview.review.snapshot_id,
    });
    expect(fromSnapshot.snapshot_digest).toBe(firstReview.review.snapshot_digest);
    await denied(machine, 'decide_transition', decideArgs(firstReview, 'accepted'));
    let initialCommit: string | null;
    if (input.web) {
      const page = input.web;
      await page.goto(`${empty.canonical_path}/reviews/${firstReview.review.address_number}`);
      const confirmation = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().includes('/transition/decide')
      );
      await page.getByRole('button', { name: 'Approve and commit', exact: true }).click();
      expect((await confirmation).ok()).toBe(true);
      initialCommit = (await branch(human, 'main')).head_commit_hash;
    } else {
      const accepted = await invoke<{ decision_digest: string }>(
        human,
        'decide_transition',
        decideArgs(firstReview, 'accepted')
      );
      expect((await branch(human, 'main')).head_commit_hash).toBeNull();
      const result = await invoke<{ commit_digest: string }>(human, 'commit_transition', {
        project_id,
        transition_id: firstReview.view.transition_id,
        request_id: randomUUID(),
        decision_digest: accepted.decision_digest,
        expected_head: null,
      });
      initialCommit = result.commit_digest;
    }
    expect(initialCommit).toMatch(/^sha256:/);

    // Only this isolated fixture ref gets a policy that permits machine Decision.
    const ref = 'machine-qualification';
    await input.actor('POST', '/branches', {
      project_id,
      name: ref,
      parent_branch: 'main',
      head_commit_hash: initialCommit,
    });
    await input.actor('PUT', `${projectUrl}/transition-policy-binding`, {
      ref_name: ref,
      uri: 't3x://policies/mcp-core-qualification/v1',
      policy: policyFor(agent),
    });
    const open = { project_id, ref, expected_head: initialCommit };
    const [one, two] = await Promise.all(
      [human, machine].map((client) =>
        invoke<{ workspace_id: string }>(client, 't3x_open_workspace', {
          ...open,
          request_id: randomUUID(),
        })
      )
    );
    expect(one.workspace_id).toBe(two.workspace_id);

    const write = async (content: Record<string, unknown>) =>
      invoke(machine, 't3x_edit', {
        mode: 'draft',
        project_id,
        workspace_id: one.workspace_id,
        request_id: randomUUID(),
        ...exactDraft(await activity(one.workspace_id)),
        operations: [{ set: { path: 'prd', value: content } }],
      });
    const valid = {
      title: 'V1 fixture',
      summary: {
        problem: 'Verify the core loop',
        audience: 'Fixture users',
        outcome: 'An exact Commit',
      },
      requirements: {
        core: {
          title: 'Complete the loop',
          priority: 'must',
          acceptance: ['Read the fixed Commit'],
        },
      },
    };
    await write({
      ...valid,
      requirements: { core: { ...valid.requirements.core, priority: 'invalid-priority' } },
    });
    const invalid = await prepare(one.workspace_id);
    await denied(machine, 'decide_transition', decideArgs(invalid, 'accepted'));
    const rejection = await invoke(machine, 'decide_transition', decideArgs(invalid, 'rejected'));
    expect(rejection).toMatchObject({ decision: { predicate: { outcome: 'rejected' } } });
    expect((await branch(human, ref)).head_commit_hash).toBe(initialCommit);
    await write(valid);
    const selfReview = await prepare(one.workspace_id, machine);
    await denied(machine, 'decide_transition', decideArgs(selfReview, 'accepted'));
    const review = await prepare(one.workspace_id);
    const args = decideArgs(review, 'accepted');
    await denied(limited, 'decide_transition', args);
    const decision = await invoke<{ decision_digest: string }>(machine, 'decide_transition', args);
    expect((await branch(human, ref)).head_commit_hash).toBe(initialCommit);
    const commitArgs = {
      project_id,
      transition_id: review.view.transition_id,
      request_id: randomUUID(),
      decision_digest: decision.decision_digest,
      expected_head: initialCommit,
    };
    await denied(limited, 'commit_transition', commitArgs);
    await denied(machine, 'commit_transition', {
      ...commitArgs,
      request_id: randomUUID(),
      expected_head: null,
    });
    const committed = await invoke<{ commit_digest: string }>(
      machine,
      'commit_transition',
      commitArgs
    );
    expect(await invoke(machine, 'commit_transition', commitArgs)).toMatchObject({
      reused: true,
      commit_digest: committed.commit_digest,
    });
    expect((await branch(human, ref)).head_commit_hash).toBe(committed.commit_digest);
    const bound = await invoke(machine, 't3x_committed_state', {
      action: 'schema_binding',
      project_id,
      commit_digest: committed.commit_digest,
    });
    expect(bound).toMatchObject({ status: 'bound', commit_digest: committed.commit_digest });
    const state = await invoke<{
      sourceState: { digest: string };
      value: Record<string, unknown>;
    }>(machine, 't3x_committed_state', {
      action: 'read',
      project_id,
      commit_digest: committed.commit_digest,
    });
    expect(state.value).toMatchObject({ prd: valid });
    const artifact = await invoke<{ content: string; byteDigest: string; byteLength: number }>(
      machine,
      't3x_committed_state',
      {
        action: 'export',
        project_id,
        commit_digest: committed.commit_digest,
        state_digest: state.sourceState.digest,
        format: 'json',
      }
    );
    expect(JSON.parse(artifact.content)).toEqual(state.value);
    expect(artifact.byteLength).toBe(Buffer.byteLength(artifact.content, 'utf8'));
    expect(artifact.byteDigest).toBe(
      `sha256:${createHash('sha256').update(artifact.content, 'utf8').digest('hex')}`
    );
    const result = await invoke(machine, 't3x_commit_result', {
      project_id,
      transition_id: review.view.transition_id,
      commit_digest: committed.commit_digest,
    });
    expect(result).toMatchObject({
      commit: { digest: committed.commit_digest },
      branch: { head_commit_hash: committed.commit_digest },
    });
    // Two fixed Reviews observe one basis. Advancing it invalidates the loser.
    await write({
      ...valid,
      summary: { ...valid.summary, outcome: 'Keep the previous Commit readable' },
    });
    const losingReview = await prepare(one.workspace_id);
    const winningReview = await prepare(one.workspace_id);
    const winningDecision = await invoke<{ decision_digest: string }>(
      machine,
      'decide_transition',
      decideArgs(winningReview, 'accepted')
    );
    const advanced = await invoke<{ commit_digest: string }>(machine, 'commit_transition', {
      project_id,
      transition_id: winningReview.view.transition_id,
      request_id: randomUUID(),
      decision_digest: winningDecision.decision_digest,
      expected_head: committed.commit_digest,
    });
    expect(advanced.commit_digest).not.toBe(committed.commit_digest);
    await denied(machine, 'decide_transition', decideArgs(losingReview, 'accepted'));
    const historical = await invoke(machine, 't3x_commit_result', {
      project_id,
      transition_id: review.view.transition_id,
      commit_digest: committed.commit_digest,
    });
    expect(historical).toMatchObject({
      commit: { digest: committed.commit_digest },
      branch: { head_commit_hash: advanced.commit_digest },
    });
    if (input.web) {
      await revokeBrowser(input.web);
    } else {
      await input.actor('DELETE', `/api-keys/${agent.id}`);
    }
    const revoked = await machine.call('t3x_context', {});
    expect(revoked.isError).toBe(true);
    expect(JSON.parse(revoked.content[0]?.text ?? '{}')).toMatchObject({ error: { status: 401 } });
    await input.actor('DELETE', `/api-keys/${otherKey.id}`);
  } finally {
    await Promise.allSettled(
      [human, machine, outsider, limited, readonly].map((client) => client.close())
    );
  }
}

// Issuance returns a one-time key. Playwright artifacts must never capture it.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test.describe('MCP core qualification', () => {
  test.skip(!authEnabled, 'Requires the isolated authentication-enabled stack.');

  test('isolated API credentials and real stdio', async ({ request }) => {
    test.skip(qualificationPhase !== 'api', 'Run the API phase on a fresh qualification stack.');
    test.setTimeout(120000);
    const owner = account('direct');
    const [person, outsider] = await Promise.all([
      registerDirect(request, owner),
      registerDirect(request, account('outsider')),
    ]);
    await qualifyCore({
      ...person,
      operatorSession: person.session,
      namespace: owner.namespace,
      outsiderSession: outsider.session,
      issue: (id) => mintDirect(person.actor, id),
    });
  });

  test('Web-issued Agent credential and trusted Web confirmation', async ({
    page,
    request,
  }, testInfo) => {
    test.skip(qualificationPhase !== 'web', 'Run the Web phase on a fresh qualification stack.');
    test.setTimeout(120000);
    const owner = account('web');
    const person = await registerBrowser(page, owner);
    const outsider = await registerDirect(request, account('other'));
    await qualifyCore({
      ...person,
      operatorSession: person.session,
      namespace: owner.namespace,
      outsiderSession: outsider.session,
      issue: (id) => mintBrowser(page, id, testInfo.outputPath('agent-token-form.png')),
      web: page,
    });
  });
});
