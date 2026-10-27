import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures/test';
import {
  API_BASE,
  cleanupProject,
  createTestBranch,
  createTestMaterial,
  createTestProject,
} from '../fixtures/api-helpers';
import { generatePrdSchemaCandidateFields } from '../fixtures/test-data-factory';

test('reviews a real published upgrade and retains the exact target Workspace through the return path', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120000);
  const { projectId } = await createTestProject(request, `Upgrade ${randomUUID().slice(0, 8)}`);
  const root = `${API_BASE}/projects/${projectId}`;
  const publisherWorkspaceId = 'publisher-definition';
  const targetWorkspaceId = 'workspace_branch:target';
  const unrelatedWorkspaceId = 'workspace_branch:unrelated';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  async function workspace(id: string) {
    return (await (await request.get(`${root}/workspaces/${id}`)).json()).data.workspace;
  }
  try {
    const sourceEvidence = await createTestMaterial(
      request,
      projectId,
      'Product teams need reviewable definition upgrades with exact impact.'
    );
    const publisherCreated = await request.patch(
      `${root}/workspaces/${encodeURIComponent(publisherWorkspaceId)}`,
      {
        data: {
          workspace: {
            id: publisherWorkspaceId,
            projectId,
            title: 'Publisher definition',
            targetBranch: 'main',
            status: 'draft',
            summary: '',
            updatedAt: new Date().toISOString(),
            baseCommitHash: null,
            sourceBundle: [sourceEvidence],
            schemaBindings: [],
            schemaCandidate: { summary: '', fields: generatePrdSchemaCandidateFields() },
            schemaReview: { verdict: 'ready', summary: '', gaps: [] },
            yopsDraft: { id: `draft:${publisherWorkspaceId}`, operations: [] },
            outputTargets: [],
          },
        },
      }
    );
    expect(publisherCreated.ok(), await publisherCreated.text()).toBe(true);
    await createTestBranch(request, projectId, 'target', { parentBranch: 'main' });
    await createTestBranch(request, projectId, 'unrelated', { parentBranch: 'main' });
    const targetResponse = await request.get(
      `${root}/workspaces/${encodeURIComponent(targetWorkspaceId)}`
    );
    if (targetResponse.status() === 404) {
      const created = await request.patch(
        `${root}/workspaces/${encodeURIComponent(targetWorkspaceId)}`,
        {
          data: {
            workspace: {
              id: targetWorkspaceId,
              projectId,
              title: 'Branch workspace: target',
              targetBranch: 'target',
              status: 'draft',
              summary: '',
              updatedAt: new Date().toISOString(),
              baseCommitHash: null,
              sourceBundle: [],
              schemaBindings: [],
              schemaCandidate: { summary: '', fields: [] },
              schemaReview: { verdict: 'ready', summary: '', gaps: [] },
              yopsDraft: { id: `draft:${targetWorkspaceId}`, operations: [] },
              outputTargets: [],
            },
          },
        }
      );
      expect(created.ok(), await created.text()).toBe(true);
    } else {
      expect(targetResponse.ok(), await targetResponse.text()).toBe(true);
    }
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
      const current = await workspace(publisherWorkspaceId);
      const response = await request.put(`${root}/workspaces/${encodeURIComponent(publisherWorkspaceId)}/schema-composition`, {
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
        `${root}/workspaces/${encodeURIComponent(publisherWorkspaceId)}/schema-composition/publish`,
        {
          data: {
            composition_revision: compiled.composition.revision,
            composition_hash: compiled.preview.compositionHash,
            canonical_name: canonicalName,
            version,
            title: 'Release definition',
            visibility: 'community',
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
      data: { candidateIds: [first.id], workspaceId: targetWorkspaceId },
    });
    expect(reviewed.ok(), await reviewed.text()).toBe(true);
    const initial = (await reviewed.json()).data;
    const applied = await request.post(`${root}/schema-studio/apply`, {
      data: {
        candidateIds: [first.id],
        workspaceId: targetWorkspaceId,
        ifRevision: initial.workspace.revision,
        reviewHash: initial.reviewHash,
      },
    });
    expect(applied.ok(), await applied.text()).toBe(true);
    const upgradeCandidateResponse = await request.post(`${root}/schema-studio/candidates`, {
      data: { sourceProjectId: projectId, canonicalName, version: '2.0.0' },
    });
    expect(upgradeCandidateResponse.ok(), await upgradeCandidateResponse.text()).toBe(true);
    const upgradeCandidate = (await upgradeCandidateResponse.json()).data;
    await page.setViewportSize({ width: 1480, height: 960 });
    await page.goto(
      `/project/${projectId}?tab=schemas&schemaView=studio&candidate=${upgradeCandidate.id}&workspace=${encodeURIComponent(targetWorkspaceId)}`,
      {
      waitUntil: 'networkidle',
      }
    );
    await expect(page.getByRole('region', { name: 'Schema Studio' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Available Schema sources' })).toContainText(
      '2.0.0'
    );
    await page.screenshot({
      path: testInfo.outputPath('upgrade-active.png'),
      animations: 'disabled',
    });
    await page.getByLabel('Target Workspace').selectOption(targetWorkspaceId);
    await expect(page.getByLabel('Target Workspace')).toHaveValue(targetWorkspaceId);
    await expect(page.getByRole('button', { name: 'Review Schema changes', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Review Schema changes', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Review Schema changes' });
    await expect(dialog).toContainText('Branch workspace: target');
    await expect(dialog).toContainText('system_architecture');
    await page.screenshot({
      path: testInfo.outputPath('upgrade-review.png'),
      animations: 'disabled',
    });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    const current = await workspace(targetWorkspaceId);
    expect(current.schemaBindings[0].studioSources[0].version).toBe('1.0.0');
    expect(current.schemaReview.verdict).toBe('needs_review');
    expect((await workspace(unrelatedWorkspaceId)).schemaBindings).toEqual([]);
    const candidates = (await (await request.get(`${root}/schema-studio/candidates`)).json()).data
      .items;
    expect(candidates.find((item: { id: string }) => item.id === first.id).source.version).toBe(
      '1.0.0'
    );
    await page.goto(`/project/${projectId}?tab=workspaces&branch=target&workspace=${encodeURIComponent(targetWorkspaceId)}`, {
      waitUntil: 'networkidle',
    });
    await expect(page.getByRole('region', { name: 'Workspace detail' })).toContainText(
      'Branch workspace: target'
    );
    await expect(page.getByLabel('Workspace schema')).not.toHaveValue('');
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
