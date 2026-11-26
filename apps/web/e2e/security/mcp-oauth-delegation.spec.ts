import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, type Page, test } from '@playwright/test';
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

type Pending = {
  state: string;
  task: string;
  repository?: string;
  branch: string;
  result: string;
  authUrl?: URL;
  code?: string;
};
function fixtureChat() {
  const path = '/chat/' + randomUUID();
  const transcript: { task: string; result: string }[] = [];
  let pending: Pending | undefined;
  let consentCount = 0;
  const chatUrl = new URL(path, callback).href;
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', callback.origin);
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET' || request.headers.host !== callback.host || !pending) {
      response.writeHead(404).end();
      return;
    }
    if (url.pathname === callback.pathname) {
      if (
        url.searchParams.get('state') !== pending.state ||
        url.searchParams.get('iss') !== issuer ||
        !url.searchParams.get('code') ||
        pending.code
      ) {
        response.writeHead(400).end();
        return;
      }
      pending.code = url.searchParams.get('code')!;
      response.writeHead(303, { Location: path }).end();
      return;
    }
    if (url.pathname === '/connect' && pending.authUrl && !pending.code) {
      consentCount++;
      response.writeHead(302, { Location: pending.authUrl.href }).end();
      return;
    }
    if (url.pathname !== path) {
      response.writeHead(404).end();
      return;
    }
    // All fixture transcript text is served as text; navigation links have fixed paths.
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=UTF-8',
      'Referrer-Policy': 'no-referrer',
    });
    const escaped = (s: string) =>
      s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    response.end(
      '<main>' +
        transcript
          .map((turn) => '<p>' + escaped(turn.task) + '</p><p>' + escaped(turn.result) + '</p>')
          .join('') +
        (pending.code ? '' : '<a href="/connect">Authorize in T3X</a>') +
        '</main>'
    );
  });
  return {
    chatUrl,
    server,
    begin(job: Pending) {
      pending = job;
      transcript.push(job);
    },
    record(task: string, result: string) {
      transcript.push({ task, result });
    },
    count: () => consentCount,
  };
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
  }
) {
  const job: Pending = {
    state: randomUUID(),
    task,
    repository: options.repository,
    branch: options.branch || 'main',
    result: '',
  };
  host.begin(job);
  let tokens: { access_token: string } | undefined;
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
    tokens: () => tokens,
    saveTokens: (value: { access_token: string }) => {
      tokens = value;
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
      if (job.repository) url.searchParams.set('repository', job.repository);
      url.searchParams.set('branch', job.branch);
      url.searchParams.set('task', job.task);
      job.authUrl = url;
    },
  };
  const transport = new StreamableHTTPClientTransport(resource, { authProvider: provider });
  const client = new Client(clientInfo);
  try {
    // The real HTTP 401 challenge drives SDK discovery and PKCE generation.
    await expect(client.connect(transport)).rejects.toThrow();
    expect(job.authUrl, 'the SDK opened an authorization request').toBeDefined();
    if (options.signIn) await page.context().clearCookies();
    await page.goto(host.chatUrl);
    await page.getByRole('link', { name: 'Authorize in T3X' }).click();
    if (options.signIn) {
      await expect(page).toHaveURL((url) => {
        const returnTo = url.searchParams.get('callbackUrl');
        return (
          url.origin === issuer &&
          url.pathname === '/login' &&
          returnTo !== null &&
          new URL(returnTo, issuer).href === job.authUrl?.href
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
      await expect(page.getByText(job.repository!, { exact: true })).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Repository' })).toHaveCount(0);
      if (host.count() === 1)
        await page.locator('article').screenshot({ path: test.info().outputPath('consent.png') });
    }
    if (options.expectedDetail) await expect(page.getByText(options.expectedDetail)).toBeVisible();
    await page.getByRole('button', { name: /Authorize and start|Complete authorization/ }).click();
    await expect(page).toHaveURL(host.chatUrl);
    await expect(page.getByText(task, { exact: true })).toBeVisible();
    if (!job.code) throw new Error('The callback did not resume its pending task.');
    await transport.finishAuth(job.code);
    if (!tokens?.access_token) throw new Error('The client did not receive an MCP access token.');
    return { job, token: tokens.access_token };
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
    task: 'Prepare the first editorial plan.',
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
  const host = fixtureChat();
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
    const message = 'Update the editorial plan and commit it.';
    const { job, token } = await authorize(page, host, message, { repository, signIn: identity });
    const agent = await connectBearer(token);
    clients.push(agent);
    expect(await invoke(agent, 't3x_context', {})).toMatchObject({
      actor_kind: 'agent',
      project_id,
    });
    expect(
      (
        await request.get(API_BASE + '/auth/me/credential', {
          headers: { Authorization: 'Bearer ' + token },
        })
      ).status()
    ).toBe(401);
    const { workspace_id } = await invoke<{ workspace_id: string }>(agent, 't3x_open_workspace', {
      project_id,
      ref: 'main',
      expected_head: base,
      request_id: randomUUID(),
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
    job.result = 'Committed ' + result.value.prd.title + ' at ' + commit;
    await page.reload();
    await expect(page.getByText(job.result, { exact: true })).toBeVisible();

    const reused = await connectBearer(token);
    clients.push(reused);
    const branches = await invoke<Array<{ name: string }>>(reused, 't3x_query', {
      target: 'branches',
      project_id,
    });
    expect(branches.some((branch) => branch.name === 'main')).toBe(true);
    const followup = 'List branches using the current connection.';
    host.record(followup, branches.map((branch) => branch.name).join(', '));
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
  }
});
