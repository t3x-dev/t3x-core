import { expect, test } from '../fixtures/test';
import {
  API_BASE,
  cleanupProject,
  createTestCommitFromTrees,
  createTestConversation,
  createTestProject,
} from '../fixtures/api-helpers';

const PRD_HEAD_TREE = [
  {
    key: 'prd',
    slots: { title: 'Checkout rollout guardrails' },
    children: [
      {
        key: 'summary',
        slots: {
          problem:
            'Checkout-api release risk is hard to audit without deterministic rollout evidence.',
          audience: 'Release managers and checkout platform engineers',
          outcome: 'Service checkout-api currently has replicas 4',
          scope: 'checkout-api canary rollout',
          source: 'source_chat:conv_d4d239f3',
        },
        children: [],
      },
      {
        key: 'requirements',
        slots: {},
        children: [
          {
            key: 'checkout_api_rollout',
            slots: {
              title: 'Service checkout-api currently has replicas 4',
              priority: 'P1',
              owner: 'Checkout platform',
              service: 'checkout-api',
              environment: 'production',
              acceptance: 'Replay confirms desired replicas before traffic promotion',
              release_gate: 'Replay verifies canary rollout before commit',
              rollback: 'Restore baseline replicas and disable canary traffic',
              metric: 'checkout error rate remains below 0.2 percent',
            },
            children: [],
          },
          {
            key: 'traffic_guardrails',
            slots: {
              title: 'Guard canary traffic before promotion',
              priority: 'P1',
              owner: 'Release agent',
              service: 'checkout-api',
              environment: 'production',
              acceptance: 'Promotion only proceeds after replay and schema checks pass',
              rollback: 'Hold at current exposure and page release owner',
              metric: 'p95 latency remains within rollout budget',
            },
            children: [],
          },
        ],
      },
      {
        key: 'metadata',
        slots: {
          version: '1.0.0',
          source: 'source_chat:conv_d4d239f3',
          owner: 'Release agent',
          review_mode: 'pull-request level',
        },
        children: [],
      },
      {
        key: 'rollout_plan',
        slots: {},
        children: [
          {
            key: 'phase_1',
            slots: {
              title: 'Progressive exposure and promotion gates',
              owner: 'Release agent',
              exposure: '10 percent traffic',
              rollback: 'Kill switch',
              success_gate: 'No duplicate orders',
              verification_window: 'Seventh rollout field remains visible',
              schedule: 'weekday business-hours release window',
            },
            children: [],
          },
        ],
      },
      {
        key: 'verification',
        slots: {
          replay: 'matched',
          schema: 'valid',
          evidence_review: 'pending',
          reviewer: 'release-agent',
        },
        children: [],
      },
    ],
  },
];

const PRD_BASE_TREE = [
  {
    key: 'prd',
    slots: { title: 'Checkout rollout guardrails' },
    children: [
      {
        key: 'summary',
        slots: {
          problem: 'Manual rollout steps make checkout-api releases hard to audit.',
          audience: 'Release managers and checkout platform engineers',
          outcome: 'Reduce deployment risk with manual review checkpoints.',
          scope: 'checkout-api canary rollout',
          source: 'source_chat:conv_d4d239f3',
        },
        children: [],
      },
      {
        key: 'requirements',
        slots: {},
        children: [
          {
            key: 'checkout_api_rollout',
            slots: {
              title: 'Scale checkout-api manually before launch',
              priority: 'P1',
              owner: 'Checkout platform',
              service: 'checkout-api',
              environment: 'production',
              acceptance: 'Replay confirms desired replicas before traffic promotion',
              legacy_gate: 'Manual approver confirms launch note before merge',
              rollback: 'Restore baseline replicas and disable canary traffic',
              metric: 'checkout error rate remains below 0.2 percent',
            },
            children: [],
          },
          {
            key: 'traffic_guardrails',
            slots: {
              title: 'Guard canary traffic before promotion',
              priority: 'P1',
              owner: 'Release agent',
              service: 'checkout-api',
              environment: 'production',
              acceptance: 'Promotion only proceeds after replay and schema checks pass',
              rollback: 'Hold at current exposure and page release owner',
              metric: 'p95 latency remains within rollout budget',
            },
            children: [],
          },
        ],
      },
      ...PRD_HEAD_TREE[0]!.children.slice(2),
    ],
  },
];

test('State page smoke: repository controls, Structure, Render, Code, and Canvas remain operational', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const { projectId } = await createTestProject(request, 'State page smoke PRD');

  try {
    const baseCommitHash = await createTestCommitFromTrees(request, projectId, PRD_BASE_TREE, {
      branch: 'feature/prd-audience',
      message: 'Workspace baseline: Checkout rollout guardrails',
    });
    const conversationId = await createTestConversation(
      request,
      projectId,
      'State page smoke source'
    );
    const workspaceResponse = await request.patch(
      `${API_BASE}/projects/${projectId}/workspaces/workspace_prd_handoff`,
      {
        data: {
          workspace: {
            baseCommitHash,
            id: 'workspace_prd_handoff',
            outputTargets: [],
            projectId,
            schemaBindings: [{ mode: 'pinned', schemaName: 'PRD Schema', version: 'v2' }],
            schemaCandidate: { fields: [], summary: '' },
            schemaReview: {
              gaps: [],
              summary: 'The staged state is ready for the smoke test commit.',
              verdict: 'needs_review',
            },
            sourceBundle: [
              {
                conversationId,
                id: `source:${conversationId}`,
                title: 'State page smoke source',
                type: 'chat',
              },
            ],
            status: 'schema_review',
            summary: 'Reviewed PRD workspace',
            targetBranch: 'feature/prd-audience',
            title: 'Checkout rollout guardrails',
            updatedAt: new Date().toISOString(),
            yopsDraft: {
              id: 'draft:workspace_prd_handoff',
              operations: [
                {
                  afterValue:
                    'Checkout-api release risk is hard to audit without deterministic rollout evidence.',
                  beforeValue: 'Manual rollout steps make checkout-api releases hard to audit.',
                  id: 'op_backend_1',
                  op: 'set',
                  path: 'prd/summary/problem',
                  summary: 'Set summary.problem',
                },
                {
                  afterValue: 'Service checkout-api currently has replicas 4',
                  beforeValue: 'Reduce deployment risk with manual review checkpoints.',
                  id: 'op_backend_2',
                  op: 'set',
                  path: 'prd/summary/outcome',
                  summary: 'Set summary.outcome',
                },
                {
                  afterValue: 'Service checkout-api currently has replicas 4',
                  beforeValue: 'Scale checkout-api manually before launch',
                  id: 'op_backend_3',
                  op: 'set',
                  path: 'prd/requirements/checkout_api_rollout/title',
                  summary: 'Set checkout rollout title',
                },
                {
                  beforeValue: 'Manual approver confirms launch note before merge',
                  id: 'op_backend_4',
                  op: 'remove',
                  path: 'prd/requirements/checkout_api_rollout/legacy_gate',
                  summary: 'Remove legacy release gate',
                },
                {
                  afterValue: 'Replay verifies canary rollout before commit',
                  id: 'op_backend_5',
                  op: 'add',
                  path: 'prd/requirements/checkout_api_rollout/release_gate',
                  summary: 'Add replay-backed release gate',
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
    const commitResponse = await request.post(
      `${API_BASE}/projects/${projectId}/workspaces/workspace_prd_handoff/commit`,
      {
        data: {
          content: { relations: [], trees: PRD_HEAD_TREE },
          if_revision: workspaceRevision,
          message: 'Workspace commit: Checkout rollout guardrails',
          validationOverride: {
            blockers: ['Resolve schema review before committing.'],
            kind: 'schema_review',
            reason: 'E2E fixture accepted for State page workflow coverage.',
          },
        },
      }
    );
    const commitResponseBody = await commitResponse.json();
    expect(commitResponse.status(), JSON.stringify(commitResponseBody)).toBe(200);

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push('pageerror: ' + error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push('console.error: ' + message.text());
    });

    const response = await page.goto(
      `/project/${projectId}?branch=${encodeURIComponent('feature/prd-audience')}&view=structure`,
      { waitUntil: 'networkidle' }
    );
    expect(response?.status() ?? 200).toBeLessThan(400);

    await expect(page.getByRole('heading', { name: 'State' }).first()).toBeVisible();
    await expect(page.getByRole('tab', { name: /Structure/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByLabel('Branch focus')).toHaveValue('feature/prd-audience');
    await expect(page.getByText('Workspace commit: Checkout rollout guardrails')).toBeVisible();
    const stateRows = page.getByRole('region', { name: 'State rows' });
    await expect(stateRows.locator('tr[data-diff-exact="true"]')).toHaveCount(5);
    await expect(
      stateRows.locator('tr[data-diff-exact="true"][data-diff-kind="added"]')
    ).toHaveCount(1);
    await expect(
      stateRows.locator('tr[data-diff-exact="true"][data-diff-kind="removed"]')
    ).toHaveCount(1);
    await expect(
      stateRows.locator('tr[data-diff-exact="true"][data-diff-kind="modified"]')
    ).toHaveCount(3);
    expect(await stateRows.locator('tbody tr').count()).toBeGreaterThanOrEqual(30);

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
    await expect(page.getByText('Workspace commit: Checkout rollout guardrails')).toBeVisible();

    await page.getByRole('tab', { name: /Render/ }).click();
    await expect(
      page.getByRole('heading', {
        name: /Product Requirements.*Checkout Rollout Guardrails/,
      })
    ).toBeVisible();
    await expect(page.getByText('Release managers and checkout platform engineers')).toBeVisible();
    await expect(
      page.getByText('Service checkout-api currently has replicas 4').first()
    ).toBeVisible();

    await page.getByRole('tab', { name: /Code/ }).click();
    const codeView = page.getByRole('region', { name: 'YAML code view' });
    await expect(codeView).toContainText('prd:');
    await expect(codeView).toContainText('summary:');
    await expect(codeView).not.toContainText('trees:');
    await expect(codeView).not.toContainText('slots:');

    await page.getByRole('button', { name: /Canvas/ }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('view') === 'canvas');
    const canvasRegion = page.getByRole('region', { name: 'Multi-commit state canvas' });
    await expect(canvasRegion).toBeVisible();
    await expect(page.getByRole('tree', { name: 'State graph canvas' })).toBeVisible();
    await expect(canvasRegion).toContainText('2 commits');

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
    await cleanupProject(request, projectId).catch(() => {});
  }
});
