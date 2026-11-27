import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import type { WorkspaceAuthoringOutcome, WorkspaceAuthoringView } from '@t3x-dev/api-client';
import { API_BASE } from '../fixtures/api-helpers';
import {
  account,
  authoringScopes,
  type DraftVersion,
  invoke,
  mcpClient,
  mintDirect,
  type PreparedReview,
  registerBrowser,
} from '../fixtures/mcp-qualification';

const seed = promisify(execFile);
const deletedPath = 'prd/requirements/retired';
const repo = 'Candidate-publication-fixture';
const workspace_id = 'mcp-candidate-publication';
const baseContent = {
  title: 'MCP publication fixture',
  summary: {
    problem: 'One requirement is retired.',
    audience: 'Fixture reviewers',
    outcome: 'Keep the supported requirement.',
  },
  requirements: {
    keep: { title: 'Keep this requirement', priority: 'must', acceptance: ['Still present.'] },
    retired: { title: 'Remove this requirement', priority: 'could', acceptance: ['Retired.'] },
  },
};
const authoringProfile = 'read-only,workspace,workspace:write,transitions,transitions:prepare';

function exactDraft(draft: DraftVersion) {
  return {
    expected_workspace_revision: draft.workspaceRevision,
    expected_revision: draft.compositionRevision,
    expected_ref_head: draft.basis.refHead,
  };
}

async function seedCandidates(
  projectId: string,
  materialId: string,
  userId: string,
  revision: number
) {
  const { stdout } = await seed(
    'pnpm',
    [
      '--filter',
      '@t3x-dev/api',
      'exec',
      'tsx',
      'src/__tests__/fixtures/mcp-workspace-generation.ts',
      projectId,
      workspace_id,
      materialId,
      userId,
      String(revision),
    ],
    { cwd: resolve(process.cwd(), '../..'), timeout: 40_000 }
  );
  const pair = stdout.match(/^(trn_[0-9a-f]{32}),(trn_[0-9a-f]{32})$/m);
  if (!pair) throw new Error('The candidate fixture did not return two Transition IDs.');
  return pair.slice(1);
}

// Keep the test credential out of automatic browser artifacts.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('MCP applies a governed candidate and a signed-in Web reviewer confirms its deletion', async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    process.env.T3X_E2E_AUTH_ENABLED !== '1' ||
      process.env.T3X_E2E_MCP_PHASE !== 'workspace-candidate',
    'Run workspace-candidate on a fresh authenticated qualification stack.'
  );
  test.setTimeout(120_000);
  page.setDefaultTimeout(10_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const owner = account('candidate');
  const person = await registerBrowser(page, owner);
  const { id: userId } = await person.actor<{ id: string }>('GET', '/auth/me');
  const { project_id } = await person.actor<{ project_id: string }>('POST', '/projects', {
    name: repo,
  });
  const projectUrl = `/projects/${project_id}`;
  const workspaceUrl = `${projectUrl}/workspaces/${workspace_id}`;
  const material = await person.evidence(project_id);
  const agent = await mintDirect(person.actor, project_id, authoringScopes);
  const human = mcpClient(person.session, authoringProfile);
  const machine = mcpClient(agent.key, `${authoringProfile},workspace:candidates:write`);

  try {
    await Promise.all([human.connect(), machine.connect()]);
    expect((await machine.list()).tools.map(({ name }) => name)).toContain('t3x_publish_candidate');
    expect((await human.list()).tools.map(({ name }) => name)).not.toContain(
      't3x_publish_candidate'
    );
    const repository = await invoke<{ canonical_path: string }>(human, 't3x_resolve_repository', {
      repository: `${owner.namespace}/${repo}`,
      ref: 'main',
    });
    const created = await person.actor<{ workspace: { revision: number } }>('PATCH', workspaceUrl, {
      workspace: {
        id: workspace_id,
        title: 'Candidate publication fixture',
        targetBranch: 'main',
        status: 'draft',
        baseCommitHash: null,
        sourceBundle: [
          {
            id: `material:${material.id}`,
            type: 'document',
            title: 'Candidate evidence',
            materialId: material.id,
            contentHash: material.content_hash,
          },
        ],
        schemaBindings: [
          { canonicalName: 't3x/prd', version: 'v2', mode: 'pinned', rootKey: 'prd' },
        ],
        yopsDraft: { id: 'mcp-candidate-fixture', operations: [] },
      },
    });
    await person.actor('POST', `${workspaceUrl}/authoring`, {
      request_id: randomUUID(),
      expected_workspace_revision: created.workspace.revision,
      expected_ref_head: null,
    });
    const activity = () =>
      invoke<WorkspaceAuthoringView>(machine, 't3x_query', {
        target: 'workspace_activity',
        project_id,
        id: workspace_id,
      });
    const draft = await activity();
    await invoke(human, 't3x_edit', {
      mode: 'draft',
      project_id,
      workspace_id,
      request_id: randomUUID(),
      ...exactDraft(draft),
      operations: [{ set: { path: 'prd', value: baseContent } }],
    });
    const before = await activity();
    const [transition_id, stale] = await seedCandidates(
      project_id,
      material.id,
      userId,
      before.workspaceRevision
    );
    expect((await activity()).pendingCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'candidate', transitionId: transition_id }),
        expect.objectContaining({ status: 'candidate', transitionId: stale }),
      ])
    );
    const args = { project_id, workspace_id, transition_id, request_id: randomUUID() };
    const applied = await invoke<WorkspaceAuthoringOutcome>(machine, 't3x_publish_candidate', args);
    expect(applied).toMatchObject({ kind: 'published', action: { actionId: args.request_id } });
    const after = await activity();
    expect(after.current).toEqual({
      prd: { ...baseContent, requirements: { keep: baseContent.requirements.keep } },
    });
    expect(after.actions).toContainEqual(
      expect.objectContaining({
        actionId: args.request_id,
        deletionConfirmation: { status: 'required', paths: [deletedPath] },
      })
    );
    expect(after.pendingCandidates).toContainEqual(
      expect.objectContaining({ transitionId: stale, status: 'stale' })
    );
    expect(await invoke(machine, 't3x_publish_candidate', args)).toMatchObject({
      kind: 'reused',
      workspaceRevision: applied.workspaceRevision,
      compositionRevision: applied.compositionRevision,
      action: { actionId: args.request_id },
    });
    const failed = await machine.call('t3x_publish_candidate', {
      ...args,
      transition_id: stale,
      request_id: randomUUID(),
    });
    expect(failed.isError).toBe(true);
    expect(JSON.parse(failed.content[0]?.text ?? '{}')).toMatchObject({
      error: { status: 409, code: 'DRAFT_CONFLICT' },
    });
    const confirmPath = `${workspaceUrl}/authoring/actions/${args.request_id}/deletion-confirmation`;
    const machineConfirm = await request.post(`${API_BASE}${confirmPath}`, {
      headers: { Authorization: `Bearer ${agent.key}` },
      data: exactDraft(after),
    });
    expect(machineConfirm.status()).toBe(403);
    expect((await machineConfirm.json()).error.message).toBe('Only a human can confirm deletion');
    expect(await activity()).toEqual(after);
    const prepare = (version: DraftVersion) =>
      invoke<PreparedReview>(human, 't3x_draft_review', {
        action: 'prepare',
        project_id,
        workspace_id,
        request_id: randomUUID(),
        ...exactDraft(version),
      });
    const unconfirmed = await prepare(after);
    expect(JSON.stringify(unconfirmed)).toContain('SOURCE_REPLACEMENT_NOT_ALLOWED');

    await page.goto(
      `${repository.canonical_path}/branches/main/workspaces?workspace=${workspace_id}&workspaceMode=compose`
    );
    const openDraft = page.getByRole('button', { name: 'Open Draft', exact: true });
    await openDraft.click();
    await expect(openDraft).toHaveAttribute('aria-expanded', 'true');
    const confirmation = page.getByRole('button', { name: 'Confirm deletion', exact: true });
    await expect(confirmation).toBeVisible();
    await page.locator('details summary').filter({ hasText: '删除范围' }).click();
    await expect(page.locator('details[open] code').filter({ hasText: deletedPath })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('candidate-deletion-confirmation.png') });
    const receiptResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === `/api/v1${confirmPath}`
    );
    await confirmation.click();
    const receipt = await receiptResponse;
    expect(receipt.ok()).toBe(true);
    expect((await receipt.json()).data.authorization).toMatchObject({
      actionId: args.request_id,
      paths: [deletedPath],
      actor: { kind: 'human', id: `user:${userId}` },
    });
    const confirmed = await activity();
    expect(confirmed.current).toEqual(after.current);
    expect(confirmed.compositionRevision).toBe(after.compositionRevision);
    expect(confirmed.actions).toContainEqual(
      expect.objectContaining({
        actionId: args.request_id,
        deletionConfirmation: { status: 'confirmed', paths: [deletedPath] },
      })
    );
    const review = await prepare(confirmed);
    expect(review.review.snapshot_digest).not.toBe(unconfirmed.review.snapshot_digest);
    expect(JSON.stringify(review)).toContain('HUMAN_CONFIRMED_DELETION');
    expect(confirmed.basis.refHead).toBe(null);
  } finally {
    await Promise.allSettled([human.close(), machine.close()]);
  }
});
