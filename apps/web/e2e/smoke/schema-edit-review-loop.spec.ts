import { randomUUID } from 'node:crypto';
import type { APIResponse } from '@playwright/test';
import { API_BASE, cleanupProject, createTestProject } from '../fixtures/api-helpers';
import { expect, test } from '../fixtures/test';

test('saved snapshot → edit → Review → commit → edit again, including empty content and required fields', async ({ page, request }, testInfo) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const { projectId } = await createTestProject(request, `Schema loop ${randomUUID().slice(0, 8)}`);
  const workspaceId = 'schema-loop';
  const endpoint = `${API_BASE}/projects/${projectId}/workspaces/${workspaceId}`;
  const studio = `${API_BASE}/projects/${projectId}/schema-studio`;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const data = async (response: APIResponse) => {
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).data;
  };
  try {
    // API setup reproduces a saved snapshot without studioSources. All subsequent
    // edits, content repair, reviews and commits use the actual browser controls.
    const saved = await data(await request.patch(endpoint, { data: { workspace: {
      id: workspaceId, projectId, title: 'Schema loop', targetBranch: 'main', status: 'draft',
      summary: '', updatedAt: new Date().toISOString(), baseCommitHash: null, sourceBundle: [],
      schemaBindings: [], schemaCandidate: { summary: '', fields: [] },
      schemaReview: { verdict: 'ready', summary: '', gaps: [] },
      yopsDraft: { id: 'schema-loop-draft', operations: [] }, outputTargets: [],
    } } }));
    await data(await request.post(`${endpoint}/authoring`, { data: {
      request_id: randomUUID(), expected_workspace_revision: saved.workspace.revision, expected_ref_head: null,
    } }));
    const source = await data(await request.post(`${studio}/candidates`, { data: { canonicalName: 't3x/prd-core', version: '1.1.0' } }));
    const candidateIds = [source.id];
    const base = await data(await request.post(`${studio}/preview`, { data: { candidateIds, workspaceId } }));
    const edit = await data(await request.put(`${studio}/edit-candidates/${workspaceId}`, { data: {
      workspaceId, candidateIds, ifRevision: 0, retryKey: randomUUID(), intent: 'Isolated empty-content fixture', origin: 'studio', localContribution: {},
      baseSchemaHash: base.schemaHash,
      schemaDefinition: { ...base.schema, relationTypes: {}, rules: [], nodes: { item: { slots: { title: { type: 'string' } } } } },
    } }));
    const schemaEditCandidate = { candidateId: edit.candidate.candidateId, revision: edit.candidate.revision };
    const preview = await data(await request.post(`${studio}/preview`, { data: { candidateIds, workspaceId, schemaEditCandidate } }));
    const input = { target: { kind: 'studio', candidateIds, schemaEditCandidate, reviewHash: preview.reviewHash }, ifRevision: preview.workspace.revision, commands: [], confirmedChanges: [] };
    const checked = await data(await request.post(`${studio}/preparation/${workspaceId}/preview`, { data: input }));
    expect(checked.canPrepare).toBe(true);
    await data(await request.post(`${studio}/preparation/${workspaceId}`, { data: { ...input, previewHash: checked.previewHash, requestId: randomUUID() } }));
    const bound = (await data(await request.get(endpoint))).workspace;
    expect(bound.schemaBindings[0].studioSources).toBeUndefined();
    expect(bound.baseCommitHash).toBeNull();

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/project/${projectId}?tab=schemas&schemaView=studio&workspace=${workspaceId}&branch=main`);
    await expect(page.getByLabel('Type item/title', { exact: true })).toHaveValue('string');
    await expect(page.getByText('Saved to Draft · not committed', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('saved-draft-editable.png'), fullPage: true });

    const commit = async () => {
      await expect(page.getByRole('button', { name: 'Approve and commit', exact: true })).toBeEnabled();
      const response = page.waitForResponse((response) => response.url().endsWith(`/workspaces/${workspaceId}/transition/decide`) && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Approve and commit', exact: true }).click();
      const result = await data(await response);
      expect(result.commit.schema).toBe('t3x/commit/v2');
      await page.getByRole('link', { name: 'Continue editing Schema', exact: true }).click();
      await expect(page.getByText(/^Committed · /)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Review Schema changes' })).toBeDisabled();
    };
    // Dirty Review saves the exact definition and reviews unchanged empty content.
    await page.getByRole('treeitem').filter({ has: page.getByLabel('Type item/title', { exact: true }) }).click();
    await page.getByLabel('Type item/title', { exact: true }).selectOption('number');
    await page.getByRole('button', { name: 'Review Schema changes' }).click();
    await expect(page).toHaveURL(/reviewSnapshot=/);
    await expect(page.getByRole('region', { name: 'Change summary', exact: true })).toContainText('Schema definition changes');
    await expect(page.getByRole('region', { name: 'Draft Schema', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('empty-content-review.png'), fullPage: true });
    await commit();
    await expect(page.getByLabel('Type item/title', { exact: true })).toHaveValue('number');

    // Save without committing, then reload and keep editing the saved definition.
    await page.getByRole('treeitem').filter({ has: page.getByLabel('Type item/title', { exact: true }) }).click();
    await page.getByLabel('Type item/title', { exact: true }).selectOption('string');
    await page.getByRole('button', { name: 'Save candidate', exact: true }).click();
    await expect(page.getByText('Changes saved · not committed', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Type item/title', { exact: true })).toHaveValue('string');
    await expect(page.getByText('Changes saved · not committed', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Review Schema changes' }).click();
    await commit();

    // Once real content exists, new required nodes and slots must be repaired.
    const contentDraft = await data(await request.get(`${endpoint}/authoring`));
    await data(await request.post(`${endpoint}/authoring/actions`, { data: {
      request_id: randomUUID(), expected_workspace_revision: contentDraft.workspaceRevision,
      expected_revision: contentDraft.compositionRevision, expected_ref_head: contentDraft.basis.refHead,
      operations: [{ set: { path: 'candidate', value: { existing: { note: 'Existing business content' } } } }],
    } }));
    await page.reload();
    // Required content is explicit: create the missing node, then enter its title.
    await page.getByRole('treeitem').filter({ has: page.getByLabel('Required item', { exact: true }) }).click();
    await page.getByLabel('Required item', { exact: true }).check();
    await page.getByRole('treeitem').filter({ has: page.getByLabel('Required item/title', { exact: true }) }).click();
    await page.getByLabel('Required item/title', { exact: true }).check();
    await page.getByRole('button', { name: 'Review Schema changes' }).click();
    const repair = page.getByRole('dialog', { name: 'Resolve Schema content', exact: true });
    await expect(repair).toBeVisible();
    await expect(repair.getByRole('button', { name: 'Save Draft & continue to Review' })).toBeDisabled();
    await repair.getByRole('button', { name: 'Add node item', exact: true }).click();
    await repair.getByRole('button', { name: 'Preview migration' }).click();
    await repair.getByRole('button', { name: 'Fill item/title', exact: true }).click();
    await repair.getByLabel('Value for change 2', { exact: true }).fill('User supplied title');
    await repair.getByRole('button', { name: 'Preview migration' }).click();
    await expect(repair.getByRole('button', { name: 'Save Draft & continue to Review' })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('required-content-repair.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('required-content-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await repair.getByRole('button', { name: 'Save Draft & continue to Review' }).click();
    await commit();
    const final = await data(await request.get(`${endpoint}/authoring`));
    expect(final.hasChanges).toBe(false);
    expect(final.current).toEqual({ candidate: { existing: { note: 'Existing business content' }, item: { title: 'User supplied title' } } });
    expect(final.currentSchema.definition.nodes.item.requiredSlots).toEqual(['title']);
    expect(final.currentSchema.definition.nodes.item.required).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await cleanupProject(request, projectId);
  }
});


test('new empty project adopts the unmodified Skill Schema, commits, and stays editable', async ({ page, request }, testInfo) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(15000);
  const { projectId } = await createTestProject(request, `Initial Skill ${randomUUID().slice(0, 8)}`);
  const workspaceId = 'initial-skill';
  const endpoint = `${API_BASE}/projects/${projectId}/workspaces/${workspaceId}`;
  const data = async (response: APIResponse) => {
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).data;
  };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await data(await request.patch(endpoint, { data: { workspace: {
      id: workspaceId, projectId, title: 'Initial Skill', targetBranch: 'main', status: 'draft',
      summary: '', updatedAt: new Date().toISOString(), baseCommitHash: null, sourceBundle: [],
      schemaBindings: [], schemaCandidate: { summary: '', fields: [] },
      schemaReview: { verdict: 'ready', summary: '', gaps: [] },
      yopsDraft: { id: 'initial-skill-draft', operations: [] }, outputTargets: [],
    } } }));
    const candidate = await data(await request.post(`${API_BASE}/projects/${projectId}/schema-studio/candidates`, {
      data: { canonicalName: 't3x/skill-core', version: '1.0.0' },
    }));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/project/${projectId}?tab=schemas&schemaView=studio&workspace=${workspaceId}&branch=main&candidate=${candidate.id}`);
    await expect(page.getByLabel('Required activation', { exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Review Schema changes' }).click();
    await expect(page).toHaveURL(/reviewSnapshot=/);
    await expect(page.getByRole('dialog', { name: 'Resolve Schema content' })).toHaveCount(0);
    await expect(page.getByText('Not applicable: no business content is being submitted. Required fields apply when content is added.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve and commit', exact: true })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('initial-skill-review.png'), fullPage: true });
    const response = page.waitForResponse(response => response.url().endsWith(`/workspaces/${workspaceId}/transition/decide`) && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Approve and commit', exact: true }).click();
    expect((await data(await response)).commit.schema).toBe('t3x/commit/v2');
    await page.getByRole('link', { name: 'Continue editing Schema', exact: true }).click();
    await expect(page.getByText(/^Committed · /)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/^Committed · /)).toBeVisible();
    for (const node of ['activation', 'checks', 'contract', 'instructions', 'manifest', 'workflows'])
      await expect(page.getByLabel(`Required ${node}`, { exact: true })).toBeChecked();
    const final = await data(await request.get(`${endpoint}/authoring`));
    expect(final.current).toEqual({});
    expect(final.hasChanges).toBe(false);
    await page.screenshot({ path: testInfo.outputPath('initial-skill-committed-editable.png'), fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    await cleanupProject(request, projectId);
  }
});
