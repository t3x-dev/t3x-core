import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getProjectRepoPath } from '../../src/domain/project/repoPath';
import { expect, test } from '../fixtures/test';
import { API_BASE, cleanupProject, createTestCommitFromTrees, createTestProject } from '../fixtures/api-helpers';

test('discover real releases, filter, inspect an exact introduction and open Studio', async ({ page, request }, testInfo) => {
  test.setTimeout(90000);
  const { projectId } = await createTestProject(request, `Catalog journey ${randomUUID().slice(0, 8)}`);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const owned = (await (await request.get(`${API_BASE}/projects/${projectId}`)).json()).data;
    expect(owned.project_id).toBe(projectId);
    const projectPath = getProjectRepoPath({ id: owned.project_id, name: owned.name });
    const commitDigest = await createTestCommitFromTrees(request, projectId, [{ key: 'service', slots: { image: 'app:v1' }, children: [] }]);
    const base64 = readFileSync('../../docs/plans/state-schema-delivery-2026-09-05/verification/state-overview/desktop.png').toString('base64');
    const presentationResponse = await request.post(`${API_BASE}/projects/${projectId}/commits/${encodeURIComponent(commitDigest)}/presentation`, { data: {
      description: 'Review a service definition before delivery.', readme: '# Team release guide\n\nKeep configuration changes reviewable.\n\n## Delivery\n\nReview the version before connecting your workflow.', tags: ['infrastructure'],
      resources: [{ path: 'images/overview.png', alt: 'Team supplied State overview', mediaType: 'image/png', base64 }], avatarPath: 'images/overview.png',
    } });
    expect(presentationResponse.ok(), await presentationResponse.text()).toBeTruthy();
    const presentationDigest = (await presentationResponse.json()).data.presentation.digest;
    const workspaceId = 'catalog-studio';
    const workspace = { id: workspaceId, projectId, title: 'Catalog Studio', targetBranch: 'main', status: 'draft', summary: 'Schema publication', updatedAt: new Date().toISOString(), baseCommitHash: commitDigest, sourceBundle: [], schemaBindings: [], schemaCandidate: { summary: '', fields: [] }, schemaReview: { verdict: 'ready', summary: '', gaps: [] }, yopsDraft: { id: 'draft', operations: [] }, outputTargets: [] };
    const saved = await request.patch(`${API_BASE}/projects/${projectId}/workspaces/${workspaceId}`, { data: { workspace } });
    expect(saved.ok(), await saved.text()).toBeTruthy();
    const revision = (await saved.json()).data.workspace.revision;
    const composition = { apiVersion: 't3x.dev/yschema-composition/v2', id: 'catalog-composition', revision: 0, status: 'draft', modules: [{ canonicalName: 't3x/prd-core', version: '1.1.0', presentationOrder: 10 }] };
    const compositionResponse = await request.put(`${API_BASE}/projects/${projectId}/workspaces/${workspaceId}/schema-composition`, { data: { composition, if_revision: revision } });
    expect(compositionResponse.ok(), await compositionResponse.text()).toBeTruthy();
    const compiled = (await compositionResponse.json()).data;
    const canonicalName = `catalog-${projectId.toLowerCase().replace(/[^a-z0-9]/g, '')}/release`;
    const published = await request.post(`${API_BASE}/projects/${projectId}/workspaces/${workspaceId}/schema-composition/publish`, { data: {
      composition_revision: compiled.composition.revision, composition_hash: compiled.preview.compositionHash,
      canonical_name: canonicalName, version: '1.2.3', title: 'Team release definition', description: 'Review a service definition before delivery.', tags: ['infrastructure', 'ecosystem:t3x'],
      presentation_ref: { commitDigest, presentationDigest, coverPath: 'images/overview.png' },
    } });
    expect(published.ok(), await published.text()).toBeTruthy();
    await page.setViewportSize({ width: 1480, height: 900 });
    await page.goto(`${projectPath}/schemas`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'What will you define next?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Explore Team release definition 1.2.3' })).toBeVisible();
    await expect(page.getByAltText('Team supplied State overview')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('discover-desktop.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByAltText('Team supplied State overview')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('discover-mobile.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 1480, height: 900 });
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Explore definitions' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('browse-all-desktop.png'), animations: 'disabled' });
    await page.getByRole('textbox', { name: 'Tags', exact: true }).fill('not-a-real-tag');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByRole('heading', { name: 'No matching definitions' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await page.getByRole('textbox', { name: 'Ecosystem', exact: true }).fill('t3x');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).toHaveURL(/ecosystem=t3x/);
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('browse-mobile.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 1480, height: 900 });
    await page.getByRole('textbox', { name: 'Search definitions' }).fill('Team release');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/schemaView=browse.*q=Team\+release/);
    await expect(page.getByRole('heading', { name: 'Explore definitions' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('browse-desktop.png'), animations: 'disabled' });
    await page.getByRole('button', { name: /Team release definition/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Team release guide' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('release-desktop.png'), animations: 'disabled' });
    await dialog.getByRole('link', { name: 'Project introduction' }).click();
    await expect(page).toHaveURL(new RegExp(encodeURIComponent(commitDigest)));
    await expect(page.getByTestId('state-overview')).toBeVisible();
    await page.goBack({ waitUntil: 'networkidle' });
    await expect(page.getByRole('textbox', { name: 'Search definitions' })).toHaveValue('Team release');
    await page.getByRole('button', { name: /Team release definition/ }).click();
    await page.getByRole('button', { name: 'Open in Studio' }).click();
    await expect(page).toHaveURL(/schemaView=studio.*catalogVersion=1.2.3/);
    await expect(page.getByRole('radio', { name: /1.2.3/ })).toBeChecked();
    await page.screenshot({ path: testInfo.outputPath('studio-desktop.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Compose with modules' }).click();
    await page.getByRole('button', { name: 'Verify composition' }).click();
    await expect(page.getByRole('button', { name: 'Publish Schema version' })).toBeEnabled();
    await page.getByRole('button', { name: 'Publish Schema version' }).click();
    const publishDialog = page.getByRole('dialog');
    await publishDialog.getByLabel('Canonical name', { exact: true }).fill(canonicalName);
    await publishDialog.getByLabel('Version', { exact: true }).fill('1.2.4');
    await expect(publishDialog.getByRole('checkbox', { name: /Include project introduction/ })).toBeEnabled();
    await publishDialog.getByRole('checkbox', { name: /Include project introduction/ }).check();
    await publishDialog.getByLabel('Release cover image').selectOption('images/overview.png');
    await page.screenshot({ path: testInfo.outputPath('publish-desktop.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await publishDialog.getByLabel('Release cover image').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('publish-mobile.png'), animations: 'disabled' });
    const publication = page.waitForResponse((response) => response.url().endsWith('/schema-composition/publish') && response.request().method() === 'POST');
    await publishDialog.getByRole('button', { name: 'Publish 1.2.4', exact: true }).click();
    const final = await publication;
    expect(final.ok(), await final.text()).toBeTruthy();
    expect(final.request().postDataJSON().presentation_ref).toEqual({ commitDigest, presentationDigest, coverPath: 'images/overview.png' });
    const catalog = (await (await request.get(`${API_BASE}/projects/${projectId}/yschema/catalog?q=${encodeURIComponent(canonicalName)}`)).json()).data;
    expect(catalog.items.find((item: { release: { version: string } }) => item.release.version === '1.2.4').presentationRef).toEqual({ projectId, commitDigest, presentationDigest, coverPath: 'images/overview.png' });
    expect(errors).toEqual([]);
  } finally { await cleanupProject(request, projectId); }
});
