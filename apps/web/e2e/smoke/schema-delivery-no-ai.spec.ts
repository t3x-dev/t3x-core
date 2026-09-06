import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { API_BASE, cleanupProject, createTestProject } from '../fixtures/api-helpers';
import { expect, test } from '../fixtures/test';

test('no-AI definition adoption, native repair, reviewed decision and exact Commit export', async ({ page, request }, testInfo) => {
  test.setTimeout(120000);
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
    await page.goto(`${path}?tab=schemas&schemaView=discover`, { waitUntil: 'networkidle' });
    await page.getByRole('textbox', { name: 'Search definitions' }).fill('Care checklist');
    await page.getByRole('textbox', { name: 'Search definitions' }).press('Enter');
    await expect(page).toHaveURL(/schemaView=browse/);
    await page.getByRole('button', { name: 'Explore Care checklist 1.0.0', exact: true }).click();
    await page.getByRole('button', { name: 'Add to Studio', exact: true }).click();
    await page.getByRole('button', { name: 'Add & open Studio', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Definition preview' })).toBeVisible();
    await page.getByLabel('Target Workspace').selectOption(workspaceId);
    await page.getByRole('button', { name: 'Review & apply', exact: true }).click();
    await page.getByRole('dialog', { name: 'Apply exact definition' }).getByRole('button', { name: 'Confirm & apply' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Exact definition applied' })).toBeVisible();
    const applied = (await (await request.get(endpoint)).json()).data.workspace;
    expect(applied.schemaBindings[0].rootKey).toBe('candidate');
    expect(applied.schemaReview.verdict).toBe('needs_review');
    await page.goto(`${path}?tab=workspaces&workspace=${workspaceId}`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: testInfo.outputPath('delivery-workspace.png'), animations: 'disabled' });

    // A human-authored structured input uses the real Workspace review API. No model, mocked
    // response, inserted Commit, synthetic validation verdict or validation override is used.
    const content = (withTask: boolean) => ({ trees: [{ key: 'candidate', slots: {}, children: [
      { key: 'checklist', slots: { title: 'Daily dog care' }, children: [] },
      { key: 'items', slots: {}, children: [{ key: 'water', slots: { done: false, ...(withTask ? { task: 'Refresh the water bowl' } : {}) }, children: [] }] },
    ] }], relations: [] });
    const review = async (withTask: boolean) => {
      const current = (await (await request.get(endpoint)).json()).data.workspace;
      const result = await request.post(`${endpoint}/transition/review`, { data: { content: content(withTask), if_revision: current.revision, why: withTask ? 'Supply the missing task before committing.' : 'Review the incomplete checklist.' } });
      expect(result.ok(), await result.text()).toBe(true);
      return (await result.json()).data;
    };
    const incomplete = await review(false);
    await page.goto(`${path}/changes/${workspaceId}/${incomplete.review_snapshot.snapshotId}`);
    await expect(page.getByRole('button', { name: 'Approve and save', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Continue anyway and save', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('delivery-blocked.png'), fullPage: true, animations: 'disabled' });
    const repaired = await review(true);
    expect(repaired.precondition.effect_digest).not.toBe(incomplete.precondition.effect_digest);
    await page.goto(`${path}/changes/${workspaceId}/${repaired.review_snapshot.snapshotId}`);
    await expect(page.getByRole('button', { name: 'Approve and save', exact: true })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('delivery-review.png'), fullPage: true, animations: 'disabled' });
    const decisionResponse = page.waitForResponse((response) => response.url().endsWith(`/workspaces/${workspaceId}/transition/decide`) && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Approve and save', exact: true }).click();
    const decision = await decisionResponse;
    expect(decision.ok(), await decision.text()).toBe(true);
    const result = (await decision.json()).data;
    expect(result.commit.schema).toBe('t3x/commit/v2');
    const commitHash = result.review_snapshot.objects.commit.digest;
    expect(commitHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.workspace.schemaBindings[0]).toEqual(applied.schemaBindings[0]);
    expect(result.workspace.schemaReview.verdict).toBe('ready');
    const retained = await request.get(`${endpoint}/transition/review-snapshots/${incomplete.review_snapshot.snapshotId}`);
    expect(retained.ok()).toBe(true);
    expect((await retained.json()).data.snapshot_digest).toBe(incomplete.review_snapshot.snapshotDigest);

    await page.goto(`${path}?tab=schemas&schemaView=active`);
    await expect(page.getByRole('region', {name: 'Active schema bindings'})).toContainText('Native YSchema validation passed');
    await page.screenshot({ path: testInfo.outputPath('delivery-active.png'), animations: 'disabled' });
    await page.goto(`${path}?commit=${encodeURIComponent(commitHash)}`);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText(commitHash);
    await page.getByRole('radio', { name: 'JSON' }).check();
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const download = await downloadEvent;
    const bytes = await readFile((await download.path())!, 'utf8');
    const exported = await request.get(`${API_BASE}/commits/${encodeURIComponent(commitHash)}/export?project_id=${projectId}&format=json`);
    expect(bytes).toBe((await exported.json()).data.content);
    expect(bytes).toContain('Refresh the water bowl');
    await page.screenshot({ path: testInfo.outputPath('delivery-export.png'), animations: 'disabled' });
    // A separately authorized override must preserve failed-check status even if the
    // input draft carries a stale Ready flag. It must not alter the earlier export.
    const overrideEndpoint = `${API_BASE}/projects/${projectId}/workspaces/care-override`;
    const overrideSaved = await request.patch(overrideEndpoint, { data: { workspace: { ...workspace, id: 'care-override', baseCommitHash: commitHash, schemaBindings: applied.schemaBindings } } });
    expect(overrideSaved.ok(), await overrideSaved.text()).toBe(true);
    const overrideRevision = (await overrideSaved.json()).data.workspace.revision;
    const failedReviewResponse = await request.post(`${overrideEndpoint}/transition/review`, { data: { content: content(false), if_revision: overrideRevision } });
    expect(failedReviewResponse.ok(), await failedReviewResponse.text()).toBe(true);
    const failedReview = (await failedReviewResponse.json()).data;
    const overriddenResponse = await request.post(`${overrideEndpoint}/transition/decide`, { data: { transition_id: failedReview.transition_id, precondition: failedReview.precondition, outcome: 'overridden', decision_reason: 'Qualification: preserve a failed native check under an explicit override.' } });
    expect(overriddenResponse.ok(), await overriddenResponse.text()).toBe(true);
    const overridden = (await overriddenResponse.json()).data;
    expect(overridden.workspace.schemaReview.verdict).toBe('needs_review');
    expect(overridden.workspace.schemaReview.gaps.join(' ')).toContain('task');
    const originalExport = await request.get(`${API_BASE}/commits/${encodeURIComponent(commitHash)}/export?project_id=${projectId}&format=json`);
    expect((await originalExport.json()).data.content).toBe(bytes);
    expect(errors).toEqual([]);
  } finally { await cleanupProject(request, projectId); }
});
