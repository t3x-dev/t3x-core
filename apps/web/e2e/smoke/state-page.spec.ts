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
          audience: 'Office workers',
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
}, testInfo) => {
  test.setTimeout(90_000);
  const { projectId } = await createTestProject(request, 'State page smoke PRD');

  try {
    const commitHash = await createTestCommitFromTrees(request, projectId, PRD_TREE, {
      branch: 'feature/prd-audience',
      message: 'Workspace commit: PRD audience handoff',
    });
    const workspacesResponse = await request.get(
      `${API_BASE}/projects/${projectId}/workspaces`
    );
    expect(workspacesResponse.ok(), await workspacesResponse.text()).toBe(true);
    const branchWorkspace = (await workspacesResponse.json()).data.workspaces.find(
      (workspace: { targetBranch?: string }) =>
        workspace.targetBranch === 'feature/prd-audience'
    );
    expect(branchWorkspace).toBeDefined();
    const workspaceId = branchWorkspace.id as string;

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push('pageerror: ' + error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push('console.error: ' + message.text());
    });

    const response = await page.goto(
      `/project/${projectId}?view=structure&branch=${encodeURIComponent('feature/prd-audience')}`,
      { waitUntil: 'networkidle' }
    );
    expect(response?.status() ?? 200).toBeLessThan(400);

    await expect(page.getByRole('heading', { name: 'State' }).first()).toBeVisible();
    await expect(page.getByRole('tab', { name: /Structure/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByRole('button', { name: 'Switch branches/tags, current branch feature/prd-audience' })).toBeVisible();
    await expect(page.getByText('Workspace commit: PRD audience handoff')).toBeVisible();
    const rootRow = page
      .getByRole('region', { name: 'State structure rows' })
      .getByRole('row', { name: /Collapse prd/ });
    expect((await rootRow.boundingBox())!.height).toBeLessThanOrEqual(40);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('state-structure-desktop.png') });
    await page.getByRole('button', { name: 'Switch branches/tags, current branch feature/prd-audience' }).click();
    await expect(page.getByRole('menuitemradio', { name: 'feature/prd-audience' })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');

    // Transition commits carry native review evidence; legacy validation runs do not apply.
    await page.getByRole('tab', { name: /Overview/ }).click();
    const committedState = page.getByRole('region', { name: 'Committed State' });
    await expect(committedState.getByRole('heading', { name: 'Structure' })).toBeVisible();
    await expect(committedState.getByText('PRD audience handoff')).toBeVisible();

    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('state-render-desktop.png') });
    await committedState.getByRole('button', { name: 'Open full view' }).click();
    await page.getByRole('button', { name: 'Code', exact: true }).click();
    const codeView = page.getByRole('region', { name: 'State structure' });
    await expect(codeView).toContainText('prd:');
    await expect(codeView).toContainText('summary:');
    await expect(codeView).not.toContainText('trees:');
    await expect(codeView).not.toContainText('slots:');
    await codeView.getByRole('button', { name: 'JSON', exact: true }).click();
    await expect(codeView.getByRole('button', { name: 'JSON', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await codeView.getByRole('button', { name: 'Find in code', exact: true }).click();
    await codeView.getByRole('textbox', { name: 'Find in code' }).fill('Office workers');
    await expect(codeView).toContainText('2 matching lines');
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('state-code-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(codeView.getByRole('button', { name: 'Raw', exact: true })).toBeVisible();
    await codeView.getByRole('button', { name: 'Raw', exact: true }).click();
    await expect(codeView.getByRole('button', { name: 'Raw', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('state-code-mobile.png') });
    await page.setViewportSize({ width: 1280, height: 720 });


    await page.getByRole('tab', { name: 'Canvas', exact: true }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('view') === 'canvas');
    const canvasRegion = page.getByRole('region', { name: 'Multi-commit state canvas' });
    await expect(canvasRegion).toBeVisible();
    await expect(page.getByRole('tree', { name: 'State graph canvas' })).toBeVisible();
    await expect(canvasRegion).toContainText('1 commit');

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

    await page.getByRole('tab', { name: /Snapshot/ }).click();
    await expect(page.getByRole('region', { name: 'State structure' })).toBeVisible();

    await page.getByRole('link', { name: 'Propose change' }).click();
    await expect(page).toHaveURL((url) => {
      return (
        (url.pathname.endsWith('/workspaces') || url.searchParams.get('tab') === 'workspaces') &&
        url.searchParams.get('branch') === 'feature/prd-audience'
      );
    });
    await expect(page.getByRole('link', { name: 'Workspace' })).toHaveAttribute(
      'aria-current',
      'page'
    );

    expect(errors, errors.join('\n')).toEqual([]);
  } finally {
    await cleanupProject(request, projectId).catch(() => {});
  }
});
