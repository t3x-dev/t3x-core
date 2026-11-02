import { randomUUID } from 'node:crypto';
import { API_BASE, cleanupProject, createTestProject } from '../fixtures/api-helpers';
import { expect, test } from '../fixtures/test';

test('no-AI definition adoption, native repair, reviewed decision and exact Commit export', async ({ page, request }, testInfo) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(10000);
  const { projectId } = await createTestProject(request, `No AI delivery ${randomUUID().slice(0, 8)}`);
  const workspaceId = 'care-delivery';
  const path = `/project/${projectId}`;
  const endpoint = `${API_BASE}/projects/${projectId}/workspaces/${workspaceId}`;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const workspace = { id: workspaceId, projectId, title: 'Daily care', targetBranch: 'main', status: 'draft', summary: '', updatedAt: new Date().toISOString(), baseCommitHash: null, sourceBundle: [], schemaBindings: [], schemaCandidate: { summary: '', fields: [] }, schemaReview: { verdict: 'ready', summary: '', gaps: [] }, yopsDraft: { id: 'care-draft', operations: [] }, outputTargets: [] };
    const saved = await request.patch(endpoint, { data: { workspace } });
    expect(saved.ok(), await saved.text()).toBe(true);
    await page.setViewportSize({ width: 1480, height: 960 });
    await page.goto(`/explore?view=browse&type=schemas&studioTarget=${projectId}`, {
      waitUntil: 'networkidle',
    });
    await page.getByRole('searchbox', { name: 'Search projects and schemas' }).fill('Care checklist');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('button', { name: 'Explore Care checklist', exact: true }).click();
    await expect(page).toHaveURL(/catalogName=t3x%2Fcare-checklist/);
    await page.getByRole('button', { name: 'Use Schema', exact: true }).click();
    await page.getByLabel('Destination project', { exact: true }).selectOption(projectId);
    await page.getByRole('button', { name: 'Add & open Studio', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Schema Studio', exact: true })).toBeVisible();
    await page.getByLabel('Target Workspace').selectOption(workspaceId);
    await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Review changes', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Workspace Review', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve and commit', exact: true })).toBeEnabled();
    const applied = (await (await request.get(endpoint)).json()).data.workspace;
    expect(applied.schemaBindings[0].rootKey).toBe('candidate');
    expect(applied.schemaReview.verdict).toBe('ready');
    await page.goto(`${path}?tab=workspaces&workspace=${workspaceId}`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: testInfo.outputPath('delivery-workspace.png'), animations: 'disabled' });

    await page.getByRole('tab', { name: 'Compose', exact: true }).click();
    const openEditor = async () => {
      await page.getByRole('button', { name: 'Advanced tools', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Edit Draft', exact: true }).click();
      return page.getByRole('dialog', { name: 'Edit Workspace Draft' });
    };
    const editor = await openEditor();
    const add = async (parent: string, name: string, value?: string) => {
      await editor.getByRole('button', { name: `Add inside ${parent}`, exact: true }).click();
      await editor.getByLabel('New name').fill(name);
      await editor.getByLabel('What to add').selectOption(value === undefined ? 'node' : 'field');
      if (value !== undefined) await editor.getByLabel('New value').fill(value);
      await editor.getByRole('button', { name: 'Apply', exact: true }).click();
      await expect(editor.getByLabel('New name')).toHaveCount(0);
    };
    const save = async () => {
      await editor.getByRole('button', { name: 'Close', exact: true }).click();
      const response = page.waitForResponse(response => response.url().endsWith(`/workspaces/${workspaceId}/authoring/actions`) && response.request().method() === 'POST');
      await page.getByRole('button', { name: /^Save selected as P \(\d+\)$/ }).click();
      const result = await response;
      expect(result.ok(), await result.text()).toBe(true);
    };
    await add('root', 'candidate');
    await add('candidate', 'checklist');
    await add('checklist', 'title', 'Daily dog care');
    await add('candidate', 'items');
    await add('items', 'water');
    await add('water', 'done', 'false');
    await save();
    const browserReview = async () => {
      await page.getByRole('tab', { name: 'Review', exact: true }).click();
      const response = page.waitForResponse(response => response.url().endsWith(`/workspaces/${workspaceId}/authoring/reviews`) && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Prepare review', exact: true }).click();
      const result = await response;
      expect(result.ok(), await result.text()).toBe(true);
      await expect(page).toHaveURL(/reviewSnapshot=/);
      const snapshotId = new URL(page.url()).searchParams.get('reviewSnapshot');
      const snapshot = await request.get(`${endpoint}/transition/review-snapshots/${snapshotId}`);
      expect(snapshot.ok()).toBe(true);
      const snapshotDigest = (await snapshot.json()).data.snapshot_digest;
      expect(snapshotDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
      const { view } = (await result.json()).data;
      const { workspace_revision, ref_head, effect_digest, proposal_digest, statement_digests, policy_digest } = view.precondition;
      return { transition_id: view.transition_id, precondition: { workspace_revision, ref_head, effect_digest, proposal_digest, statement_digests, policy_digest: policy_digest ?? '' }, snapshotId, snapshotDigest };
    };
    const incomplete = await browserReview();
    await page.screenshot({ path: testInfo.outputPath('delivery-blocked.png'), animations: 'disabled' });
    await page.getByRole('link', { name: 'Edit in Compose', exact: true }).click();
    await openEditor();
    await add('water', 'task', 'Refresh the water bowl');
    await page.screenshot({ path: testInfo.outputPath('delivery-editor.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('delivery-editor-mobile.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 1480, height: 960 });
    await save();
    // A saved content edit makes the previous decision precondition stale.
    const stale = await request.post(`${endpoint}/transition/decide`, { data: { transition_id: incomplete.transition_id, precondition: incomplete.precondition, outcome: 'accepted' } });
    expect(stale.status(), await stale.text()).toBe(409);
    const repaired = await browserReview();
    expect(repaired.precondition.effect_digest).not.toBe(incomplete.precondition.effect_digest);
    await expect(page.getByRole('button', { name: 'Approve and commit', exact: true })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('delivery-review.png'), fullPage: true, animations: 'disabled' });
    const decisionResponse = page.waitForResponse((response) => response.url().endsWith(`/workspaces/${workspaceId}/transition/decide`) && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Approve and commit', exact: true }).click();
    const decision = await decisionResponse;
    expect(decision.ok(), await decision.text()).toBe(true);
    const result = (await decision.json()).data;
    expect(result.commit.schema).toBe('t3x/commit/v2');
    const commitHash = result.review_snapshot.objects.commit.digest;
    expect(commitHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.workspace.schemaBindings[0]).toEqual(applied.schemaBindings[0]);
    expect(result.workspace.schemaReview.verdict).toBe('ready');
    const retained = await request.get(`${endpoint}/transition/review-snapshots/${incomplete.snapshotId}`);
    expect(retained.ok()).toBe(true);
    expect((await retained.json()).data.snapshot_digest).toBe(incomplete.snapshotDigest);

    await page.goto(`${path}?tab=workspaces&workspace=${workspaceId}`);
    await page.getByRole('tab', { name: 'Compose', exact: true }).click();
    await page.getByRole('navigation', { name: 'Workspace tools' }).getByRole('button', { name: 'Structure', exact: true }).click();
    await expect(page.getByLabel('Workspace schema').locator('option:checked')).toContainText(
      applied.schemaBindings[0].schemaName
    );
    await page.screenshot({ path: testInfo.outputPath('delivery-active.png'), animations: 'disabled' });
    const exported = await request.get(`${API_BASE}/commits/${encodeURIComponent(commitHash)}/export?project_id=${projectId}&format=json`);
    const repeatedExport = await request.get(`${API_BASE}/commits/${encodeURIComponent(commitHash)}/export?project_id=${projectId}&format=json`);
    const bytes = (await exported.json()).data.content as string;
    expect((await repeatedExport.json()).data.content).toBe(bytes);
    expect(bytes).toContain('Refresh the water bowl');
    await page.screenshot({ path: testInfo.outputPath('delivery-export.png'), animations: 'disabled' });
    // Later invalid content needs an explicit override that preserves failed checks
    // and cannot alter the earlier Commit export.
    const beforeOverride = (await (await request.get(`${endpoint}/authoring`)).json()).data;
    const editedResponse = await request.post(`${endpoint}/authoring/actions`, { data: {
      request_id: randomUUID(), expected_workspace_revision: beforeOverride.workspaceRevision,
      expected_revision: beforeOverride.compositionRevision, expected_ref_head: beforeOverride.basis.refHead,
      operations: [{ unset: { path: 'candidate/items/water/task' } }],
    } });
    expect(editedResponse.ok(), await editedResponse.text()).toBe(true);
    const edited = (await editedResponse.json()).data;
    const failedReviewResponse = await request.post(`${endpoint}/authoring/reviews`, { data: {
      request_id: randomUUID(), expected_workspace_revision: edited.workspaceRevision,
      expected_revision: edited.compositionRevision, expected_ref_head: beforeOverride.basis.refHead,
    } });
    expect(failedReviewResponse.ok(), await failedReviewResponse.text()).toBe(true);
    const failedReview = (await failedReviewResponse.json()).data.view;
    const overridePrecondition = { ...failedReview.precondition };
    delete overridePrecondition.ref_name;
    delete overridePrecondition.review_digest;
    const overriddenResponse = await request.post(`${endpoint}/transition/decide`, { data: { transition_id: failedReview.transition_id, precondition: overridePrecondition, outcome: 'overridden', decision_reason: 'Qualification: preserve a failed native check under an explicit override.' } });
    expect(overriddenResponse.ok(), await overriddenResponse.text()).toBe(true);
    const overridden = (await overriddenResponse.json()).data;
    expect(overridden.workspace.schemaReview.verdict).toBe('needs_review');
    expect(overridden.workspace.schemaReview.gaps.join(' ')).toContain('task');
    const originalExport = await request.get(`${API_BASE}/commits/${encodeURIComponent(commitHash)}/export?project_id=${projectId}&format=json`);
    expect((await originalExport.json()).data.content).toBe(bytes);
    expect(errors).toEqual([]);
  } finally { await cleanupProject(request, projectId); }
});
