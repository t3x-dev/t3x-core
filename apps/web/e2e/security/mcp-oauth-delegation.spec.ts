import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, type Page, test } from '@playwright/test';
import { ChatTasks, fixtureChat } from '../fixtures/mcp-oauth-chat';
import { API_BASE } from '../fixtures/api-helpers';
import {
  account,
  type DraftVersion,
  initializeQualificationSchema,
  invoke,
  type Mcp,
  mintDirect,
  type PreparedReview,
  registerBrowser,
} from '../fixtures/mcp-qualification';

const requireMcp = createRequire(resolve(process.cwd(), '../../apps/mcp/package.json'));
const { Client } = requireMcp('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = requireMcp(
  '@modelcontextprotocol/sdk/client/streamableHttp.js'
);
const clientId = 't3x-qualification-chat';
const clientInfo = { name: 'Qualification Chat', version: '1.0' };
const callback = new URL(
  process.env.T3X_E2E_MCP_CALLBACK_URL || 'http://127.0.0.1:38497/oauth/callback'
);
const resource = new URL(process.env.T3X_MCP_RESOURCE_URL || 'http://127.0.0.1:3001/mcp');
const issuer = new URL(process.env.WEBUI_URL || 'http://localhost:3000').origin;

test.use({
  trace: 'off',
  screenshot: 'off',
  video: 'off',
  ...(process.env.T3X_E2E_CHROME_CHANNEL === 'chrome' && { channel: 'chrome' }),
});
test.skip(
  process.env.T3X_E2E_MCP_ISOLATED !== '1' ||
    process.env.T3X_E2E_AUTH_ENABLED !== '1' ||
    (process.env.T3X_E2E_MCP_PHASE !== undefined &&
      process.env.T3X_E2E_MCP_PHASE !== 'oauth-delegation') ||
    !process.env.T3X_MCP_RESOURCE_URL,
  'Requires an isolated, authenticated OAuth deployment with a registered callback.'
);

type ToolClient = Pick<Mcp, 'call'>;
type ToolResult = Awaited<ReturnType<ToolClient['call']>>;
async function connectBearer(token: string) {
  const client = new Client(clientInfo);
  await client.connect(
    new StreamableHTTPClientTransport(resource, {
      requestInit: { headers: { Authorization: 'Bearer ' + token } },
    })
  );
  return {
    call: (name: string, args: Record<string, unknown>) =>
      client.callTool({ name, arguments: args }) as Promise<ToolResult>,
    listTools: async () =>
      (await client.listTools()).tools as {
        name: string;
        inputSchema: { properties?: Record<string, { enum?: string[] }> };
      }[],
    close: () => client.close(),
  };
}

async function prepare(client: ToolClient, project_id: string, workspace_id: string) {
  return invoke<PreparedReview>(client, 't3x_draft_review', {
    action: 'prepare',
    project_id,
    workspace_id,
    request_id: randomUUID(),
    ...(await revisions(client, project_id, workspace_id)),
  });
}

async function revisions(client: ToolClient, project_id: string, id: string) {
  const draft = await invoke<DraftVersion>(client, 't3x_query', {
    target: 'workspace_activity',
    project_id,
    id,
  });
  return {
    expected_workspace_revision: draft.workspaceRevision,
    expected_revision: draft.compositionRevision,
    expected_ref_head: draft.basis.refHead,
  };
}

async function acceptAndCommit(
  client: ToolClient,
  project_id: string,
  prepared: PreparedReview,
  expected_head: string | null
) {
  const transition_id = prepared.view.transition_id;
  const { decision_digest } = await invoke<{ decision_digest: string }>(
    client,
    'decide_transition',
    {
      project_id,
      transition_id,
      request_id: randomUUID(),
      outcome: 'accepted',
      precondition: prepared.view.precondition,
    }
  );
  const { commit_digest } = await invoke<{ commit_digest: string }>(client, 'commit_transition', {
    project_id,
    transition_id,
    request_id: randomUUID(),
    decision_digest,
    expected_head,
  });
  return commit_digest;
}

async function authorize(
  page: Page,
  host: ReturnType<typeof fixtureChat>,
  task: string,
  options: {
    repository?: string;
    chooseId?: string;
    branch?: string;
    expectedDetail?: RegExp;
    signIn?: { username: string; password: string };
    run?: (token: string) => Promise<string>;
  }
) {
  const job = host.tasks.start(task);
  const chatUrl = host.chatUrl(job.chat);
  let authUrl: URL | undefined;
  let verifier = '';
  const provider = {
    redirectUrl: callback.href,
    clientMetadata: {
      client_name: clientInfo.name,
      redirect_uris: [callback.href],
      token_endpoint_auth_method: 'none',
    },
    clientInformation: () => ({ client_id: clientId, issuer, token_endpoint_auth_method: 'none' }),
    state: () => job.state,
    tokens: () => {
      const token = host.tasks.find(job.state)?.token;
      return token ? { access_token: token } : undefined;
    },
    saveTokens: (value: { access_token: string }) => {
      if (!host.tasks.storeToken(job.state, value.access_token))
        throw new Error('This task no longer accepts the credential.');
    },
    saveCodeVerifier: (value: string) => {
      verifier = value;
    },
    codeVerifier: () => verifier,
    redirectToAuthorization: (url: URL) => {
      expect(url.origin).toBe(issuer);
      expect(url.searchParams.get('resource')).toBe(resource.href);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('scope')).toBe('repository:commit');
      if (options.repository) url.searchParams.set('repository', options.repository);
      url.searchParams.set('branch', options.branch || 'main');
      expect(url.searchParams.has('task')).toBe(false);
      authUrl = url;
    },
  };
  const transport = new StreamableHTTPClientTransport(resource, { authProvider: provider });
  host.connections.set(job.state, {
    url: () => authUrl,
    exchange: (code) => transport.finishAuth(code),
    run:
      options.run ??
      (async (token) => {
        const verified = await connectBearer(token);
        try {
          const context = await invoke<{ project_id: string }>(verified, 't3x_context', {});
          if (options.chooseId && context.project_id !== options.chooseId)
            throw new Error('This connection belongs to another repository.');
          return 'Connected to ' + context.project_id;
        } finally {
          await verified.close();
        }
      }),
  });
  const client = new Client(clientInfo);
  try {
    // The real HTTP 401 challenge drives SDK discovery and PKCE generation.
    await expect(client.connect(transport)).rejects.toThrow();
    expect(authUrl, 'the SDK opened an authorization request').toBeDefined();
    if (options.signIn) await page.context().clearCookies();
    await page.goto(chatUrl);
    await page.getByRole('link', { name: 'Authorize in T3X' }).click();
    if (options.signIn) {
      await expect(page).toHaveURL((url) => {
        const returnTo = url.searchParams.get('callbackUrl');
        return (
          url.origin === issuer &&
          url.pathname === '/login' &&
          returnTo !== null &&
          new URL(returnTo, issuer).href === authUrl?.href
        );
      });
      await page.getByLabel('Username').fill(options.signIn.username);
      await page.getByLabel('Password').fill(options.signIn.password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    }
    if (options.chooseId) {
      const picker = page.getByRole('combobox', { name: 'Repository' });
      await expect(picker).toBeVisible();
      await page
        .locator('article')
        .screenshot({ path: test.info().outputPath('choose-repository.png') });
      await picker.selectOption(options.chooseId);
    } else {
      await expect(page.getByText(options.repository!, { exact: true })).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Repository' })).toHaveCount(0);
      if (host.count() === 1)
        await page.locator('article').screenshot({ path: test.info().outputPath('consent.png') });
    }
    if (options.expectedDetail) await expect(page.getByText(options.expectedDetail)).toBeVisible();
    await page.getByRole('button', { name: /Authorize and start|Complete authorization/ }).click();
    await expect(page).toHaveURL(chatUrl, { timeout: 40_000 });
    await expect(page.getByText(task, { exact: true })).toBeVisible();
    const finished = host.tasks.find(job.state);
    if (!finished?.token || finished.stage !== 'done')
      throw new Error('The original chat did not complete its authenticated continuation.');
    return { job: finished, token: finished.token };
  } finally {
    await client.close();
  }
}

async function previewSchemaReadiness(
  page: Page,
  repository: string,
  expected: string,
  screenshotName: string
) {
  const verifier = randomBytes(32).toString('base64url');
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback.href,
    response_type: 'code',
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    resource: resource.href,
    scope: 'repository:commit',
    state: randomUUID(),
    repository,
    branch: 'main',
  });
  const [response] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === '/api/v1/mcp-delegations/consent'),
    page.goto(issuer + '/settings/agent-access/authorize?' + query),
  ]);
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    repositoryLocked: true,
    selected: { name: repository, branch: 'main', outcome: 'eligible', readinessDetail: expected },
  });
  const card = page.locator('article');
  await expect(card.getByText(expected, { exact: false })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Authorize and start' })).toBeEnabled();
  await card.screenshot({ path: test.info().outputPath(screenshotName) });
}

test('resume an OAuth task in its originating chat and verify the exact agent commit', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const identity = account('oauth');
  const owner = await registerBrowser(page, identity);
  const { project_id } = await owner.actor<{ project_id: string }>('POST', '/projects', {
    name: 'editorial',
    namespace: identity.namespace,
  });
  const other = await owner.actor<{ project_id: string }>('POST', '/projects', {
    name: 'reviewed',
    namespace: identity.namespace,
  });
  const repository = identity.namespace + '/editorial';
  const absent = await page.request.get(
    issuer + '/api/v1/projects/' + project_id + '/transition-policy-binding?ref_name=main'
  );
  expect(absent.status()).toBe(404);
  await test.step('preview a new repository without a Schema', async () => {
    await previewSchemaReadiness(
      page,
      repository,
      'The Agent can collect sources now. Choose a Schema before its first content commit.',
      'empty-repository-consent.png'
    );
  });
  const schemaWorkspace = 'first-personal-schema';
  await initializeQualificationSchema(
    owner.actor,
    project_id,
    schemaWorkspace,
    await owner.evidence(project_id)
  );
  await test.step('preview the selected first Schema before human approval', async () => {
    await previewSchemaReadiness(
      page,
      repository,
      'This Workspace has a selected Schema. Its first Schema needs your approval.',
      'first-schema-consent.png'
    );
  });
  const human = await connectBearer(owner.session);
  const host = fixtureChat(callback, issuer);
  if (callback.hostname !== '127.0.0.1' || callback.protocol !== 'http:')
    throw new Error('The test callback must be local loopback.');
  host.server.listen(Number(callback.port), '127.0.0.1');
  await once(host.server, 'listening');
  const clients = [human];
  try {
    const base = await acceptAndCommit(
      human,
      project_id,
      await prepare(human, project_id, schemaWorkspace),
      null
    );
    await initializeQualificationSchema(
      owner.actor,
      other.project_id,
      schemaWorkspace,
      await owner.evidence(other.project_id)
    );
    const protectedBase = await acceptAndCommit(
      human,
      other.project_id,
      await prepare(human, other.project_id, schemaWorkspace),
      null
    );
    await owner.actor('PUT', '/branches/rules', {
      project_id: other.project_id,
      branch_name: 'main',
      rules: { commit: { require_independent_review: true } },
    });
    const prd = {
      title: 'December editorial plan',
      summary: { problem: 'Organize topics', audience: 'Editors', outcome: 'Approved plan' },
      requirements: {
        core: {
          title: 'Update editorial plan',
          priority: 'must',
          acceptance: ['Read back the exact plan'],
        },
      },
    };
    const message = 'Update the editorial plan and commit it.';
    const { job, token } = await authorize(page, host, message, {
      repository,
      signIn: identity,
      async run(token) {
        const agent = await connectBearer(token);
        try {
          expect(await invoke(agent, 't3x_context', {})).toMatchObject({
            actor_kind: 'agent',
            credential_kind: 'mcp',
            project_id,
            transition_scopes: expect.arrayContaining([
              'transition:propose',
              'transition:verify',
              'transition:decide:accept',
              'transition:commit:create',
              'transition:ref:advance',
            ]),
          });
          expect(
            await invoke(agent, 't3x_resolve_repository', { repository, ref: 'main' })
          ).toMatchObject({ project_id, ref: 'main', head_commit_hash: base });
          const tools = await agent.listTools();
          const reviewActions = tools.find((tool) => tool.name === 't3x_draft_review');
          const decisions = tools.find((tool) => tool.name === 'decide_transition');
          expect(reviewActions?.inputSchema.properties?.action?.enum).toContain('prepare');
          expect(decisions?.inputSchema.properties?.outcome?.enum).toContain('accepted');
          expect(tools.some((tool) => tool.name === 'commit_transition')).toBe(true);
          const { workspace_id } = await invoke<{ workspace_id: string }>(
            agent,
            't3x_open_workspace',
            {
              project_id,
              ref: 'main',
              expected_head: base,
              request_id: randomUUID(),
            }
          );
          await invoke(agent, 't3x_edit', {
            mode: 'draft',
            project_id,
            workspace_id,
            request_id: randomUUID(),
            ...(await revisions(agent, project_id, workspace_id)),
            operations: [{ set: { path: 'prd', value: prd } }],
          });
          const review = await prepare(agent, project_id, workspace_id);
          expect(
            await invoke(agent, 't3x_draft_review', {
              action: 'read',
              project_id,
              workspace_id,
              snapshot_id: review.review.snapshot_id,
            })
          ).toMatchObject({ snapshot_digest: review.review.snapshot_digest });
          const commit = await acceptAndCommit(agent, project_id, review, base);
          expect(
            await invoke(agent, 't3x_commit_result', {
              project_id,
              transition_id: review.view.transition_id,
              commit_digest: commit,
            })
          ).toMatchObject({
            commit: { digest: commit },
            branch: { head_commit_hash: commit },
          });
          const result = await invoke<{ value: { prd: { title: string } } }>(
            agent,
            't3x_committed_state',
            { action: 'read', project_id, commit_digest: commit }
          );
          expect(result.value.prd).toMatchObject(prd);
          return 'Committed ' + result.value.prd.title + ' at ' + commit;
        } finally {
          await agent.close();
        }
      },
    });
    await expect(page.getByText(job.result!, { exact: true })).toBeVisible();
    const agent = await connectBearer(token);
    clients.push(agent);
    expect(
      (
        await request.get(API_BASE + '/auth/me/credential', {
          headers: { Authorization: 'Bearer ' + token },
        })
      ).status()
    ).toBe(401);
    const reused = await connectBearer(token);
    clients.push(reused);
    const branches = await invoke<Array<{ name: string }>>(reused, 't3x_query', {
      target: 'branches',
      project_id,
    });
    expect(branches.some((branch) => branch.name === 'main')).toBe(true);
    const followup = 'List branches using the current connection.';
    host.tasks.record(job.chat, followup, branches.map((branch) => branch.name).join(', '));
    await page.reload();
    await expect(page.getByText(followup, { exact: true })).toBeVisible();
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Authorize in T3X' })).toHaveCount(0);
    expect(host.count()).toBe(1);
    const denied = await agent.call('t3x_query', {
      target: 'branches',
      project_id: other.project_id,
    });
    expect(denied.isError).toBe(true);

    const otherGrant = await authorize(page, host, 'List the repository branches.', {
      chooseId: other.project_id,
      expectedDetail: /reviewer must approve/i,
    });
    const second = await connectBearer(otherGrant.token);
    clients.push(second);
    expect(await invoke(second, 't3x_context', {})).toMatchObject({ project_id: other.project_id });
    const protectedWorkspace = await invoke<{ workspace_id: string }>(
      second,
      't3x_open_workspace',
      {
        project_id: other.project_id,
        ref: 'main',
        expected_head: protectedBase,
        request_id: randomUUID(),
      }
    );
    const protectedScope = {
      project_id: other.project_id,
      workspace_id: protectedWorkspace.workspace_id,
    };
    await invoke(second, 't3x_edit', {
      ...protectedScope,
      mode: 'draft',
      request_id: randomUUID(),
      ...(await revisions(second, protectedScope.project_id, protectedScope.workspace_id)),
      operations: [{ set: { path: 'prd', value: prd } }],
    });
    const protectedReview = await prepare(
      second,
      protectedScope.project_id,
      protectedScope.workspace_id
    );
    const selfApproval = await second.call('decide_transition', {
      project_id: other.project_id,
      transition_id: protectedReview.view.transition_id,
      request_id: randomUUID(),
      outcome: 'accepted',
      precondition: protectedReview.view.precondition,
    });
    expect(selfApproval.isError).toBe(true);
    expect(
      await invoke(second, 't3x_resolve_repository', {
        repository: identity.namespace + '/reviewed',
        ref: 'main',
      })
    ).toMatchObject({ head_commit_hash: protectedBase });
    await page.goto(issuer + '/' + repository + '/settings?view=agent-access');
    const management = page.getByRole('region', { name: 'Agent access' });
    await expect(management.getByRole('button', { name: 'Revoke access' })).toBeVisible();
    await management.screenshot({ path: test.info().outputPath('repository-agent-access.png') });
    await page.getByRole('button', { name: 'Revoke access' }).click();
    await expect(page.getByText(/^Revoked ·/)).toBeVisible();
    await expect(agent.call('t3x_context', {})).rejects.toMatchObject({ code: 401 });
    expect(await invoke(second, 't3x_context', {})).toMatchObject({ project_id: other.project_id });
    await authorize(page, host, 'Read the latest editorial plan.', { repository });
    expect(host.count()).toBe(3);
    await test.step('repair a pre-issued Agent token and resume its checked Draft', async () => {
      // All three clients and both browsers share one real IP quota in this isolated stack.
      // Start the separate legacy journey with enough budget for its guarded writes.
      const budget = await request.get(API_BASE + '/auth/me/credential', {
        headers: { Authorization: 'Bearer ' + owner.session },
      });
      expect([200, 429]).toContain(budget.status());
      const remaining = Number(budget.headers()['x-ratelimit-remaining']);
      const reset = Number(budget.headers()['x-ratelimit-reset']) * 1000;
      if (remaining < 90 && reset > Date.now()) {
        await delay(Math.min(61_000, reset - Date.now() + 150));
      }
      await page.goto(issuer + '/' + identity.namespace);
      const { project_id: id } = await owner.actor<{ project_id: string }>('POST', '/projects', {
        name: 'uat-recovery',
        namespace: identity.namespace,
      });
      const ref = { project_id: id, ref: 'main' };
      const globalPolicy =
        issuer + '/api/v1/projects/' + id + '/transition-policy-binding?ref_name=main';
      expect((await page.request.get(globalPolicy)).status()).toBe(404);
      await initializeQualificationSchema(
        owner.actor,
        id,
        schemaWorkspace,
        await owner.evidence(id)
      );
      const head = await acceptAndCommit(
        human,
        id,
        await prepare(human, id, schemaWorkspace),
        null
      );
      const existing = await mintDirect(owner.actor, id);
      const legacy = await connectBearer(existing.key);
      clients.push(legacy);
      const { workspace_id } = await invoke<{ workspace_id: string }>(
        legacy,
        't3x_open_workspace',
        {
          ...ref,
          expected_head: head,
          request_id: randomUUID(),
        }
      );
      const scope = { project_id: id, workspace_id };
      const content = { ...prd, title: 'Recovered UAT draft' };
      await invoke(legacy, 't3x_edit', {
        ...scope,
        mode: 'draft',
        request_id: randomUUID(),
        ...(await revisions(legacy, id, workspace_id)),
        operations: [{ set: { path: 'prd', value: content } }],
      });
      const saved = await revisions(legacy, id, workspace_id);
      const prepareArgs = { ...scope, ...saved, action: 'prepare' };
      const failed = await legacy.call('t3x_draft_review', {
        ...prepareArgs,
        request_id: randomUUID(),
      });
      expect(failed.isError).toBe(true);
      expect(JSON.parse(failed.content[0]?.text ?? '{}')).toMatchObject({
        error: {
          code: 'REVIEW_SNAPSHOT_POLICY_REQUIRED',
          details: {
            checks: {
              replay: { outcomes: ['verified'] },
              validation: { outcomes: ['passed'] },
            },
          },
        },
      });
      await page.goto(
        issuer + '/' + identity.namespace + '/uat-recovery/settings?view=agent-access'
      );
      const row = page
        .getByRole('article')
        .filter({ has: page.getByRole('heading', { name: 'V1 agent fixture' }) });
      await row.screenshot({ path: test.info().outputPath('repair-saved-draft.png') });
      const repaired = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          new URL(response.url()).pathname === '/api/v1/mcp-delegations'
      );
      await row.getByRole('button', { name: 'Complete authorization' }).click();
      const response = await repaired;
      expect(response.ok()).toBe(true);
      expect((await response.json()).grant.id).toBe(existing.id);
      // Retry with the identical token, workspace, composition and base; only the request ID changes.
      expect(await revisions(legacy, id, workspace_id)).toEqual(saved);
      const snapshot = await invoke<PreparedReview>(legacy, 't3x_draft_review', {
        ...prepareArgs,
        request_id: randomUUID(),
      });
      expect(
        await invoke(legacy, 't3x_draft_review', {
          ...scope,
          action: 'read',
          snapshot_id: snapshot.review.snapshot_id,
        })
      ).toMatchObject({ snapshot_digest: snapshot.review.snapshot_digest });
      const committed = await acceptAndCommit(legacy, id, snapshot, head);
      expect(
        await invoke(legacy, 't3x_committed_state', {
          action: 'read',
          project_id: id,
          commit_digest: committed,
        })
      ).toMatchObject({ value: { prd: content } });
      expect((await page.request.get(globalPolicy)).status()).toBe(404);
    });
  } finally {
    await Promise.allSettled(clients.map((client) => client.close()));
    host.server.closeAllConnections();
    await new Promise<void>((done) => host.server.close(() => done()));
    host.tasks.dispose();
  }
});

test('the host recovers the original task and suppresses stale continuations', async () => {
  const tasks = new ChatTasks();
  const first = tasks.start('First chat');
  const second = tasks.start('Second chat');
  let writes = 0;
  const run = async () => 'completed ' + ++writes;
  try {
    expect(tasks.beginExchange(first.state)).toBe(true);
    expect(tasks.storeToken(first.state, 'synthetic-only')).toBe(true);
    const restarted = new ChatTasks(tasks.directory);
    await Promise.all([restarted.recover(first.state, run), restarted.resume(first.state, run)]);
    expect(restarted.find(first.state)?.result).toBe('completed 1');
    expect(restarted.find(second.state)?.stage).toBe('waiting');
    expect(restarted.beginExchange(first.state)).toBe(false);

    const newState = restarted.retry(second.state, 'Revised second task');
    expect(restarted.find(newState)?.id).toBe(second.id);
    expect(restarted.beginExchange(second.state)).toBe(false);
    expect(restarted.beginExchange(newState)).toBe(true);
    expect(restarted.cancel(newState)).toBe(true);
    expect(restarted.storeToken(newState, 'synthetic-only')).toBe(false);
    await restarted.resume(newState, run);

    const third = restarted.start('Interrupted write');
    restarted.beginExchange(third.state);
    restarted.storeToken(third.state, 'synthetic-only');
    let finish!: () => void;
    const inFlight = restarted.resume(third.state, async () => {
      writes++;
      await new Promise<void>((done) => {
        finish = done;
      });
      return 'late result';
    });
    const recovery = new ChatTasks(tasks.directory);
    await recovery.recover(third.state, run);
    finish();
    await inFlight;
    expect(recovery.find(third.state)?.stage).toBe('uncertain');
    expect(writes).toBe(2);
  } finally {
    tasks.dispose();
  }
});

function oauthQuery(repository?: string) {
  const verifier = randomBytes(32).toString('base64url');
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback.href,
    response_type: 'code',
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    resource: resource.href,
    scope: 'repository:commit',
    state: randomUUID(),
    ...(repository ? { repository } : {}),
  });
  return { verifier, query };
}

test('Web preselection and Chat consent share one guarded repository approval', async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const route = issuer + '/api/v1/mcp-delegations';
  const consent = (query: URLSearchParams) => route + '/consent?' + query;
  const screen = (query: URLSearchParams) => issuer + '/settings/agent-access/authorize?' + query;
  const origin = { Origin: issuer };
  const legacy = oauthQuery().query;
  legacy.set('task', 'fixture-private-instruction');
  await page.goto(screen(legacy));
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/login' &&
      !new URL(url.searchParams.get('callbackUrl')!, issuer).searchParams.has('task')
  );
  expect(decodeURIComponent(page.url()).includes('fixture-private-instruction')).toBe(false);

  const accountA = account('coordinate');
  const owner = await registerBrowser(page, accountA);
  const { project_id: projectId } = await owner.actor<{ project_id: string }>('POST', '/projects', {
    name: 'personal',
    namespace: accountA.namespace,
  });
  const repository = accountA.namespace + '/personal';
  const listGrants = async () =>
    (await (await page.request.get(route + '?projectId=' + projectId)).json()).grants;

  await page.goto(issuer + '/' + repository + '/settings?view=agent-access');
  await page.getByRole('link', { name: 'Connect an Agent' }).click();
  await expect(page.getByRole('combobox', { name: 'Repository' })).toHaveValue(projectId);
  await page.getByRole('combobox', { name: 'Agent', exact: true }).selectOption(clientId);
  await page
    .locator('article')
    .screenshot({ path: test.info().outputPath('web-direct-selection.png') });
  const saved = page.waitForResponse(
    (res) =>
      new URL(res.url()).pathname.endsWith('/preselections') && res.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Continue in client' }).click();
  const selection = (await (await saved).json()) as { id: string };
  await expect(page.getByText(/Selection saved for/)).toBeVisible();
  await expect(page.getByText(resource.href, { exact: true })).toBeVisible();
  await page.locator('article').screenshot({ path: test.info().outputPath('manual-oauth-connection.png') });
  expect(await listGrants()).toHaveLength(0);

  const { query } = oauthQuery();
  const consentPage = await page.context().newPage();
  await consentPage.goto(screen(query));
  const savedPicker = consentPage.getByRole('combobox', { name: 'Use this saved selection' });
  await expect(savedPicker).toHaveValue('');
  await savedPicker.selectOption(selection.id);
  await expect(consentPage.getByText(/Edit content on all branches/)).toBeVisible();
  await consentPage.getByText('Advanced settings', { exact: true }).click();
  await consentPage.getByRole('combobox', { name: 'Writable branches' }).selectOption('current');
  await expect(consentPage.getByText('Read this repository. Edit content only on main.')).toBeVisible();
  await consentPage.getByRole('combobox', { name: 'Agent actions' }).selectOption('read');
  await expect(consentPage.getByText('Read this repository.', { exact: true })).toBeVisible();
  await consentPage.setViewportSize({ width: 390, height: 844 });
  await consentPage.locator('article').screenshot({ path: test.info().outputPath('narrow-consent.png') });
  expect(await consentPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );

  // Use the registered callback without retaining its code or full URL in diagnostics.
  await consentPage.route(callback.origin + '/**', (request) =>
    request.fulfill({ status: 200, body: 'Returned to client' })
  );
  await consentPage.getByRole('button', { name: 'Authorize and start' }).click();
  await expect(consentPage.getByText('Returned to client')).toBeVisible();
  await consentPage.close();
  await page.bringToFront();
  await expect(page.getByText(/This selection was used to authorize/)).toBeVisible();
  await expect(page.getByText(/Selection expires/)).toHaveCount(0);
  await page.locator('article').screenshot({ path: test.info().outputPath('used-selection.png') });
  await page.getByRole('link', { name: 'View repository Agent access' }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('view') === 'agent-access');
  const active = (await listGrants()).filter((grant: { revoked: boolean }) => !grant.revoked);
  expect(active).toHaveLength(1);
  expect(active[0].mode).toBe('read');

  const explicit = oauthQuery().query;
  explicit.set('preselection', selection.id);
  expect((await page.request.get(consent(explicit))).ok()).toBe(false);

  const otherContext = await browser.newContext({ baseURL: issuer });
  try {
    const other = await registerBrowser(await otherContext.newPage(), account('colead'));
    const person = await other.actor<{ id: string }>('GET', '/auth/me');
    await owner.actor('PUT', '/projects/' + projectId + '/guests', {
      principal: { kind: 'human', principal_id: person.id },
      role: 'admin',
      expires_at: null,
    });
    const attempt = oauthQuery(repository).query;
    const endpoint = consent(attempt);
    const preview = await (await page.request.get(endpoint)).json();
    const approve = {
      decision: 'approve',
      previewVersion: preview.previewVersion,
      projectId,
      branch: 'main',
      branchOnly: false,
      mode: 'commit',
      days: 7,
    };
    const cancel = { decision: 'cancel', previewVersion: preview.previewVersion };
    for (const data of [approve, cancel]) {
      expect((await otherContext.request.post(endpoint, { data, headers: origin })).status()).toBe(
        404
      );
    }
    expect((await (await page.request.get(endpoint)).json()).status).toBe('pending');
    expect((await page.request.post(endpoint, { data: cancel, headers: origin })).ok()).toBe(true);
    expect((await page.request.post(endpoint, { data: approve, headers: origin })).status()).toBe(
      409
    );
    await page.goto(screen(attempt));
    await expect(page.getByText(/cancelled/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Authorize and start' })).toHaveCount(0);
    expect((await listGrants()).filter((g: { revoked: boolean }) => !g.revoked)[0].id).toBe(
      active[0].id
    );

    const earlier = oauthQuery(repository).query;
    const later = oauthQuery(repository).query;
    const old = await (await page.request.get(consent(earlier))).json();
    const fresh = await (await page.request.get(consent(later))).json();
    const decision = (params: URLSearchParams, version: string) =>
      page.request.post(consent(params), {
        headers: origin,
        data: { ...approve, previewVersion: version },
      });
    expect((await decision(later, fresh.previewVersion)).ok()).toBe(true);
    expect((await decision(earlier, old.previewVersion)).status()).toBe(409);
    expect((await decision(later, fresh.previewVersion)).ok()).toBe(true);
    const current = (await listGrants()).filter((g: { revoked: boolean }) => !g.revoked);
    expect(current).toHaveLength(1);
    expect(current[0].id).not.toBe(active[0].id);
  } finally {
    await otherContext.close();
  }
});

test('a registered Web launcher carries its preselection through PKCE to the selected repository', async ({
  page,
  request,
}) => {
  const identity = account('launcher');
  const owner = await registerBrowser(page, identity);
  const { project_id } = await owner.actor<{ project_id: string }>('POST', '/projects', {
    name: 'personal',
    namespace: identity.namespace,
  });
  const { query, verifier } = oauthQuery();
  const launcher = 't3x-qualification-launcher';
  query.set('client_id', launcher);
  query.set('scope', 'repository:read');
  let receivedCode = '';
  // The fixture owns the client pages. Web, consent, token exchange and MCP use the live stack.
  await page.route(callback.origin + '/connect?*', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.size !== 1 || !params.get('preselection')) return route.abort();
    query.set('preselection', params.get('preselection')!);
    return route.fulfill({
      status: 302,
      headers: { location: issuer + '/settings/agent-access/authorize?' + query },
    });
  });
  await page.route(callback.href + '?*', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('iss') !== issuer || params.get('state') !== query.get('state'))
      return route.abort();
    receivedCode = params.get('code') ?? '';
    return route.fulfill({ body: 'Returned to launcher' });
  });
  await page.goto(issuer + '/settings/agent-access');
  await page.getByRole('combobox', { name: 'Repository' }).selectOption(project_id);
  await page.getByRole('combobox', { name: 'Agent', exact: true }).selectOption(launcher);
  await page.getByRole('button', { name: 'Continue in client' }).click();
  await expect(page.getByRole('heading', { name: /Let Qualification Launcher/ })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Repository' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Authorize and start' }).click();
  await expect(page.getByText('Returned to launcher')).toBeVisible();
  const exchange = await request.post(issuer + '/api/mcp-oauth/token', {
    form: {
      grant_type: 'authorization_code',
      client_id: launcher,
      code: receivedCode,
      code_verifier: verifier,
      resource: resource.href,
      redirect_uri: callback.href,
    },
  });
  expect(exchange.status()).toBe(200);
  const { access_token, scope } = await exchange.json();
  expect(scope).toBe('repository:read');
  const client = await connectBearer(access_token);
  try {
    expect(await invoke(client, 't3x_context', {})).toMatchObject({
      project_id,
      transition_scopes: ['transition:inspect'],
    });
  } finally {
    await client.close();
  }
});
