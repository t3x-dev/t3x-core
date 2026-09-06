import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures/test';
import {
  API_BASE,
  cleanupProject,
  createTestBranch,
  createTestProject,
} from '../fixtures/api-helpers';

test('reviews a real published upgrade and retains the exact target Workspace through the return path', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120000);
  const { projectId } = await createTestProject(request, `Upgrade ${randomUUID().slice(0, 8)}`);
  const root = `${API_BASE}/projects/${projectId}`;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  async function workspace(id: string) {
    return (await (await request.get(`${root}/workspaces/${id}`)).json()).data.workspace;
  }
  async function create(id: string, title: string) {
    const value = {
      id,
      projectId,
      title,
      targetBranch: id === 'release-target' ? 'main' : id,
      status: 'draft',
      summary: '',
      updatedAt: new Date().toISOString(),
      baseCommitHash: null,
      sourceBundle: [],
      schemaBindings: [],
      schemaCandidate: { summary: '', fields: [] },
      schemaReview: { verdict: 'ready', summary: '', gaps: [] },
      yopsDraft: { id: 'draft', operations: [] },
      outputTargets: [],
    };
    const result = await request.patch(`${root}/workspaces/${id}`, { data: { workspace: value } });
    expect(result.ok(), await result.text()).toBe(true);
  }
  try {
    await createTestBranch(request, projectId, 'publisher', { parentBranch: 'main' });
    await createTestBranch(request, projectId, 'unrelated', { parentBranch: 'main' });
    await create('publisher', 'Definition publication');
    await create('release-target', 'Release migration');
    await create('unrelated', 'Unrelated work');
    const canonicalName = `upgrade-${projectId}/definition`;
    let compositionRevision = 0;
    for (const [version, modules] of [
      ['1.0.0', [{ canonicalName: 't3x/prd-core', version: '1.1.0', presentationOrder: 10 }]],
      [
        '2.0.0',
        [
          { canonicalName: 't3x/prd-core', version: '1.1.0', presentationOrder: 10 },
          { canonicalName: 't3x/prd-system-architecture', version: '1.0.0', presentationOrder: 20 },
        ],
      ],
    ] as const) {
      const current = await workspace('publisher');
      const response = await request.put(`${root}/workspaces/publisher/schema-composition`, {
        data: {
          composition: {
            apiVersion: 't3x.dev/yschema-composition/v2',
            id: 'upgrade',
            revision: compositionRevision,
            status: 'draft',
            modules,
          },
          if_revision: current.revision,
        },
      });
      expect(response.ok(), await response.text()).toBe(true);
      const compiled = (await response.json()).data;
      compositionRevision = compiled.composition.revision;
      const published = await request.post(
        `${root}/workspaces/publisher/schema-composition/publish`,
        {
          data: {
            composition_revision: compiled.composition.revision,
            composition_hash: compiled.preview.compositionHash,
            canonical_name: canonicalName,
            version,
            title: 'Release definition',
          },
        }
      );
      expect(published.ok(), await published.text()).toBe(true);
    }
    const added = await request.post(`${root}/schema-studio/candidates`, {
      data: { sourceProjectId: projectId, canonicalName, version: '1.0.0' },
    });
    expect(added.ok()).toBe(true);
    const first = (await added.json()).data;
    const reviewed = await request.post(`${root}/schema-studio/preview`, {
      data: { candidateIds: [first.id], workspaceId: 'release-target' },
    });
    expect(reviewed.ok(), await reviewed.text()).toBe(true);
    const initial = (await reviewed.json()).data;
    const applied = await request.post(`${root}/schema-studio/apply`, {
      data: {
        candidateIds: [first.id],
        workspaceId: 'release-target',
        ifRevision: initial.workspace.revision,
        reviewHash: initial.reviewHash,
      },
    });
    expect(applied.ok(), await applied.text()).toBe(true);
    await page.setViewportSize({ width: 1480, height: 960 });
    await page.goto(`/project/${projectId}?tab=schemas&schemaView=active`, {
      waitUntil: 'networkidle',
    });
    await expect(page.getByLabel(`Published release for ${canonicalName}`)).toContainText('2.0.0');
    await page.screenshot({
      path: testInfo.outputPath('upgrade-active.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Add to Studio', exact: true }).click();
    await page.getByRole('button', { name: 'Add & open Studio' }).click();
    await expect(page.getByLabel('Target Workspace')).toHaveValue('release-target');
    await expect(page.getByRole('button', { name: 'Review & apply', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Review & apply', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Apply exact definition' });
    await expect(dialog).toContainText('Release migration');
    await expect(dialog).toContainText('system_architecture');
    await page.screenshot({
      path: testInfo.outputPath('upgrade-review.png'),
      animations: 'disabled',
    });
    await dialog.getByRole('button', { name: 'Confirm & apply' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Exact definition applied' })
    ).toBeVisible();
    const current = await workspace('release-target');
    expect(current.schemaBindings[0].studioSources[0].version).toBe('2.0.0');
    expect(current.schemaReview.verdict).toBe('needs_review');
    expect((await workspace('unrelated')).schemaBindings).toEqual([]);
    const candidates = (await (await request.get(`${root}/schema-studio/candidates`)).json()).data
      .items;
    expect(candidates.find((item: { id: string }) => item.id === first.id).source.version).toBe(
      '1.0.0'
    );
    await page.goto(`/project/${projectId}?tab=workspaces&branch=main&workspace=release-target`, {
      waitUntil: 'networkidle',
    });
    await expect(
      page.getByRole('heading', { name: 'Release migration', exact: true })
    ).toBeVisible();
    await page.getByRole('link', { name: 'View definition', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Active schema bindings' })).toContainText(
      `revision ${current.revision}`
    );
    await expect(page.getByRole('region', { name: 'Active schema bindings' })).toContainText(
      'Needs review'
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: testInfo.outputPath('upgrade-mobile.png'),
      animations: 'disabled',
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    expect(errors).toEqual([]);
  } finally {
    await cleanupProject(request, projectId);
  }
});
