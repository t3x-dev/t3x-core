import { expect, test } from '../fixtures/test';
import {
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
          outcome: '办公室上班族',
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
              title: '找到食物和饮品',
              priority: 'P1',
              acceptance: '用户能快速找到并满意',
            },
            children: [],
          },
        ],
      },
    ],
  },
];

test('State page smoke: initial commit renders Points, Render, and Code', async ({ page, request }) => {
  const { projectId } = await createTestProject(request, 'State page smoke PRD');

  try {
    const commitHash = await createTestCommitFromTrees(request, projectId, PRD_TREE, {
      branch: 'feature/prd-audience',
      message: 'Workspace commit: PRD audience handoff',
    });

    const workspaceResponse = await request.patch(
      'http://localhost:8000/api/v1/projects/' + projectId + '/workspaces/workspace_prd_handoff',
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
              gaps: ['summary.audience'],
              summary: 'Audience still needs review.',
              verdict: 'needs_review',
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
                  afterValue: '办公室上班族',
                  id: 'op_backend_2',
                  op: 'set',
                  path: 'prd/summary/outcome',
                  summary: 'Set summary.outcome',
                },
                {
                  afterValue: '找到食物和饮品',
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
    const workspaceCommitResponse = await request.post(
      'http://localhost:8000/api/v1/projects/' + projectId + '/workspaces/workspace_prd_handoff/commit',
      {
        data: {
          content: { trees: PRD_TREE, relations: [] },
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

    const response = await page.goto('/project/' + projectId, { waitUntil: 'networkidle' });
    expect(response?.status() ?? 200).toBeLessThan(400);

    await expect(page.getByRole('heading', { name: 'State' }).first()).toBeVisible();
    await expect(page.getByLabel('Branch focus')).toHaveValue('feature/prd-audience');
    await expect(page.getByText('Workspace commit: PRD audience handoff')).toBeVisible();
    await expect(page.getByText('Path / Key')).toBeVisible();
    await expect(page.getByText('01 SET').first()).toBeVisible();
    await expect(page.getByText('02 SET').first()).toBeVisible();
    await expect(page.getByText('03 SET').first()).toBeVisible();
    await expect(page.getByText('missing').first()).toBeVisible();

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

    expect(errors, errors.join('\n')).toEqual([]);
  } finally {
    await cleanupProject(request, projectId);
  }
});
