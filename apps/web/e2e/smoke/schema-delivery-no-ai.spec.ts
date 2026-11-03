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
    await expect(page.getByRole('button', { name: 'Review Schema changes', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Review Schema changes', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Review Schema changes' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Change summary' })).toBeVisible();
    await page.getByRole('button', { name: 'Approve and commit', exact: true }).click();
    await expect(page.getByText('This revision is committed. Open State to inspect or export it.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'View State & export' })).toBeVisible();
    const applied = (await (await request.get(endpoint)).json()).data.workspace;
    expect(applied.schemaBindings[0].rootKey).toBe('candidate');
    expect(applied.schemaReview.verdict).toBe('ready');
    await page.goto(`${path}?tab=workspaces&workspace=${workspaceId}`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: testInfo.outputPath('delivery-workspace.png'), animations: 'disabled' });

    // Browser authoring below uses the real native review. This content helper is only
    // for the separate adversarial API override qualification at the end.
    const content = (withTask: boolean) => ({ trees: [{ key: 'candidate', slots: {}, children: [
      { key: 'checklist', slots: { title: 'Daily dog care' }, children: [] },
      { key: 'items', slots: {}, children: [{ key: 'water', slots: { done: false, ...(withTask ? { task: 'Refresh the water bowl' } : {}) }, children: [] }] },
    ] }], relations: [] });
    await page.getByRole('button', { name: 'Advanced tools', exact: true }).press('Enter');
    await page.getByRole('menuitem', { name: 'Edit Draft', exact: true }).press('Enter');
    const editor = page;
    let dialog = editor.getByRole('dialog', { name: 'Edit Workspace Draft' });
    await expect(dialog).toBeVisible();
    const addNode = async (parent: string, name: string) => {
      await dialog.getByRole('button', { name: `Add inside ${parent.split('/').at(-1)}`, exact: true }).click();
      await dialog.getByLabel('New name').fill(name);
      await dialog.getByLabel('What to add').selectOption('node');
      await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
    };
    const addField = async (parent: string, name: string, value: string) => {
      await dialog.getByRole('button', { name: `Add inside ${parent.split('/').at(-1)}`, exact: true }).click();
      await dialog.getByLabel('New name').fill(name);
      await dialog.getByLabel('What to add').selectOption('field');
      await dialog.getByLabel('New value').fill(value);
      await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
    };
    await addNode('root', 'candidate');
    await addNode('candidate', 'checklist');
    await addField('candidate/checklist', 'title', 'Daily dog care');
    await addNode('candidate', 'items');
    await addNode('candidate/items', 'water');
    await addField('candidate/items/water', 'done', 'false');
    const saveDraftChanges = async () => {
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      const response = page.waitForResponse((candidate) => candidate.url().endsWith(`/workspaces/${workspaceId}/authoring/actions`) && candidate.request().method() === 'POST');
      await page.getByRole('button', { name: /^Save selected as P/ }).click();
      expect((await response).ok()).toBe(true);
      await expect(page.getByRole('button', { name: /^Save selected as P/ })).toBeHidden();
    };
    const browserReview = async () => {
      const response = page.waitForResponse((response) => response.url().endsWith(`/workspaces/${workspaceId}/authoring/reviews`) && response.request().method() === 'POST');
      await page.getByRole('tab', { name: 'Review', exact: true }).click();
      const unsaved = page.getByRole('dialog', { name: 'Unsaved Content changes' });
      if (await unsaved.isVisible()) {
        await unsaved.getByRole('button', { name: 'Discard local changes and continue' }).click();
      }
      const prepare = page.getByRole('button', { name: 'Prepare review', exact: true });
      if (await prepare.isVisible()) await prepare.click();
      const result = await response;
      expect(result.ok(), await result.text()).toBe(true);
      await expect(page).toHaveURL(/reviewSnapshot=/);
      const data = (await result.json()).data;
      const snapshotId = new URL(page.url()).searchParams.get('reviewSnapshot')!;
      const snapshotResponse = await request.get(`${endpoint}/transition/review-snapshots/${snapshotId}`);
      expect(snapshotResponse.ok(), await snapshotResponse.text()).toBe(true);
      const snapshot = (await snapshotResponse.json()).data;
      return {
        ...data,
        review_snapshot: { snapshotId, snapshotDigest: snapshot.snapshot_digest },
      };
    };
    await saveDraftChanges();
    const incomplete = await browserReview();
    await page.screenshot({ path: testInfo.outputPath('delivery-blocked.png'), animations: 'disabled' });
    await expect(page.getByText('Schema validation failed', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Commit with override', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Edit in Compose', exact: true }).click();
    await expect(page).toHaveURL(/workspaceMode=compose/);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Advanced tools', exact: true }).press('Enter');
    await page.getByRole('menuitem', { name: 'Edit Draft', exact: true }).press('Enter');
    dialog = editor.getByRole('dialog', { name: 'Edit Workspace Draft' });
    await addField('candidate/items/water', 'task', 'Refresh the water bowl');
    await saveDraftChanges();
    const repaired = await browserReview();
    expect(repaired.view.precondition.effect_digest).not.toBe(incomplete.view.precondition.effect_digest);
    await page.screenshot({ path: testInfo.outputPath('delivery-editor.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('delivery-editor-mobile.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 1480, height: 960 });
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
    const retained = await request.get(`${endpoint}/transition/review-snapshots/${incomplete.review_snapshot.snapshotId}`);
    expect(retained.ok()).toBe(true);
    expect((await retained.json()).data.snapshot_digest).toBe(incomplete.review_snapshot.snapshotDigest);

    await page.goto(`${path}?tab=workspaces&workspace=${workspaceId}`);
    await expect(page.getByRole('region', { name: 'Workspace detail' })).toContainText('Daily care');
    await page.screenshot({ path: testInfo.outputPath('delivery-active.png'), animations: 'disabled' });
    const exported = await request.get(`${API_BASE}/commits/${encodeURIComponent(commitHash)}/export?project_id=${projectId}&format=json`);
    const repeatedExport = await request.get(`${API_BASE}/commits/${encodeURIComponent(commitHash)}/export?project_id=${projectId}&format=json`);
    const bytes = (await exported.json()).data.content as string;
    expect((await repeatedExport.json()).data.content).toBe(bytes);
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
