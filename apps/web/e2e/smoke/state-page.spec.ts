import { expect, test } from '../fixtures/test';
import {
  API_BASE,
  cleanupProject,
  createTestCommitFromTrees,
  createTestProject,
} from '../fixtures/api-helpers';

const PRD_TREE = [
  {
    key: 'prd',
    slots: { title: 'PRD audience handoff' },
    children: [
      {
        key: 'summary',
        slots: {
          problem: 'You: i need food and drink',
          audience: '',
          outcome: 'Office workers',
        },
        children: [],
      },
      {
        key: 'requirements',
        slots: {},
        children: [
          {
            key: 'you_i_need_food_and_drink',
            slots: {
              title: 'Find food and drinks',
              priority: 'P1',
              acceptance: 'Users can quickly find satisfying options',
            },
            children: [],
          },
        ],
      },
    ],
  },
];

test('State page smoke: repository controls, snapshot views, and Canvas remain operational', async ({
  page,
  request,
}) => {
  const { projectId } = await createTestProject(request, 'State page smoke PRD');

  try {
    const commitHash = await createTestCommitFromTrees(request, projectId, PRD_TREE, {
      branch: 'feature/prd-audience',
      message: 'Workspace commit: PRD audience handoff',
    });

    const workspaceResponse = await request.patch(
      `${API_BASE}/projects/${projectId}/workspaces/workspace_prd_handoff`,
      {
        data: {
          workspace: {
            baseCommitHash: null,
            id: 'workspace_prd_handoff',
            lastCommitHash: commitHash,
            outputTargets: [],
            projectId,
            schemaBindings: [{ mode: 'pinned', schemaName: 'PRD Schema', version: 'v2' }],
            schemaCandidate: { fields: [], summary: '' },
            schemaReview: {
              gaps: [],
              summary: 'The staged state is ready for the smoke test commit.',
              verdict: 'ready',
            },
            sourceBundle: [],
            status: 'committed',
            summary: 'Reviewed PRD workspace',
            targetBranch: 'feature/prd-audience',
            title: 'PRD audience handoff',
            updatedAt: new Date().toISOString(),
            yopsDraft: {
              id: 'draft:workspace_prd_handoff',
              operations: [
                {
                  afterValue: 'You: i need food and drink',
                  id: 'op_backend_1',
                  op: 'set',
                  path: 'prd/summary/problem',
                  summary: 'Set summary.problem',
                },
                {
                  afterValue: 'Office workers',
                  id: 'op_backend_2',
                  op: 'set',
                  path: 'prd/summary/outcome',
                  summary: 'Set summary.outcome',
                },
                {
                  afterValue: 'Find food and drinks',
                  id: 'op_backend_3',
                  op: 'set',
                  path: 'prd/requirements/you_i_need_food_and_drink/title',
                  summary: 'Set requirements title',
                },
              ],
            },
          },
        },
      }
    );
    expect(workspaceResponse.status()).toBe(200);
    const workspaceResponseBody = await workspaceResponse.json();
    const workspaceRevision = workspaceResponseBody.data.workspace.revision;
    expect(workspaceRevision).toBeGreaterThan(0);
    const workspaceCommitResponse = await request.post(
      `${API_BASE}/projects/${projectId}/workspaces/workspace_prd_handoff/commit`,
      {
        data: {
          content: { trees: PRD_TREE, relations: [] },
          if_revision: workspaceRevision,
          message: 'Workspace commit: PRD audience handoff',
        },
      }
    );
    expect(workspaceCommitResponse.status()).toBe(200);

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push('pageerror: ' + error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push('console.error: ' + message.text());
    });

    const response = await page.goto(
      `/project/${projectId}?branch=${encodeURIComponent('feature/prd-audience')}`,
      { waitUntil: 'networkidle' }
    );
    expect(response?.status() ?? 200).toBeLessThan(400);

    await expect(page.getByRole('heading', { name: 'State' }).first()).toBeVisible();
    await expect(page.getByRole('tab', { name: /Snapshot/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByLabel('Branch focus')).toHaveValue('feature/prd-audience');
    await expect(page.getByText('Workspace commit: PRD audience handoff')).toBeVisible();
    await expect(page.getByText('Path / Key')).toBeVisible();
    await expect(page.getByText('01 SET').first()).toBeVisible();
    await expect(page.getByText('02 SET').first()).toBeVisible();
    await expect(page.getByText('03 SET').first()).toBeVisible();

    await page.getByRole('button', { name: 'New branch' }).click();
    await expect(page.getByRole('dialog')).toContainText('Create a new branch');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    const validationResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes(`/api/v1/projects/${projectId}/yschema-validation/runs`)
    );
    await page.getByRole('button', { name: 'Run validation' }).click();
    expect((await validationResponsePromise).status()).toBe(201);

    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByText('Workspace commit: PRD audience handoff')).toBeVisible();

    await page.getByRole('tab', { name: /Render/ }).click();
    await expect(
      page.getByRole('heading', { exact: true, name: 'PRD audience handoff' })
    ).toBeVisible();
    await expect(page.getByText('This field is required by the schema.')).toBeVisible();

    await page.getByRole('tab', { name: /Code/ }).click();
    const codeView = page.getByRole('region', { name: 'YAML code view' });
    await expect(codeView).toContainText('prd:');
    await expect(codeView).toContainText('summary:');
    await expect(codeView).not.toContainText('trees:');
    await expect(codeView).not.toContainText('slots:');

    await page.getByRole('tab', { name: /Canvas/ }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('view') === 'canvas');
    const canvasRegion = page.getByRole('region', { name: 'Multi-commit state canvas' });
    await expect(canvasRegion).toBeVisible();
    await expect(page.getByRole('tree', { name: 'State graph canvas' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'History' })).toHaveAttribute(
      'href',
      /view=canvas/
    );

    const canvasBox = await canvasRegion.boundingBox();
    const repositoryBox = await canvasRegion.locator('..').boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(repositoryBox).not.toBeNull();
    expect(
      Math.abs(
        (canvasBox?.y ?? 0) + (canvasBox?.height ?? 0) -
          ((repositoryBox?.y ?? 0) + (repositoryBox?.height ?? 0))
      )
    ).toBeLessThanOrEqual(2);

    await page.getByRole('link', { name: 'History' }).click();
    await expect(page.getByRole('region', { name: 'Multi-commit state canvas' })).toBeVisible();
    await page.getByRole('tab', { name: /Snapshot/ }).click();
    await expect(page.getByRole('region', { name: 'YAML code view' })).toBeVisible();

    await page.getByRole('link', { name: 'Open workspace' }).click();
    await expect(page).toHaveURL((url) => {
      return (
        url.pathname.endsWith('/workspaces') &&
        url.searchParams.get('branch') === 'feature/prd-audience'
      );
    });
    await expect(page.getByRole('link', { name: 'Workspaces' })).toHaveAttribute(
      'aria-current',
      'page'
    );

    expect(errors, errors.join('\n')).toEqual([]);
  } finally {
    await cleanupProject(request, projectId);
  }
});
