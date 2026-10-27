import type { APIRequestContext, Page } from '@playwright/test';
import { API_BASE, cleanupProject, createTestProject } from '../fixtures/api-helpers';
import { expect, test } from '../fixtures/test';

const KEEP_FIXTURE = process.env.T3X_E2E_KEEP_FIXTURE === '1';

const COMPLEX_SOURCES = [
  {
    title: '01-evidence-coverage.txt',
    text: [
      'Problem: Enterprise reviewers cannot trace a generated proposal back to every source.',
      'Audience: Platform product managers and compliance reviewers',
      'Outcome: Every proposed field carries visible and reviewable evidence.',
      'Requirement: Evidence coverage matrix',
      'Priority: must',
      'Acceptance: Preview lists the source behind every generated requirement.',
    ].join('\n'),
  },
  {
    title: '02-validation-recovery.txt',
    text: [
      'Problem: Large edits currently hide validation failures until the final commit step.',
      'Audience: Staff engineers and release owners',
      'Outcome: Reviewers can resolve validation failures before state advances.',
      'Requirement: Validation recovery loop',
      'Priority: must',
      'Acceptance: A failed proposal remains editable and can be validated again without losing sources.',
    ].join('\n'),
  },
  {
    title: '03-branch-safety.txt',
    text: [
      'Problem: A stale workspace can accidentally target a branch whose head has changed.',
      'Audience: Repository maintainers and release engineers',
      'Outcome: Commit review proves the selected branch still matches the workspace baseline.',
      'Requirement: Branch head precondition',
      'Priority: should',
      'Acceptance: Review is blocked when the target branch differs from the verified workspace branch.',
    ].join('\n'),
  },
] as const;

function repoSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

async function uploadTextMaterial(
  request: APIRequestContext,
  projectId: string,
  source: (typeof COMPLEX_SOURCES)[number]
): Promise<string> {
  const response = await request.post(`${API_BASE}/projects/${projectId}/materials/document`, {
    multipart: {
      file: {
        name: source.title,
        mimeType: 'text/plain',
        buffer: Buffer.from(source.text),
      },
    },
  });
  const payload = await response.json();
  expect(response.status(), JSON.stringify(payload)).toBe(200);
  return payload.data.id as string;
}

async function includeMaterial(
  request: APIRequestContext,
  projectId: string,
  materialId: string
): Promise<void> {
  const response = await request.post(`${API_BASE}/projects/${projectId}/pins`, {
    data: { type: 'import', ref_id: materialId },
  });
  const payload = await response.json();
  expect(response.status(), JSON.stringify(payload)).toBe(201);
}

function watchRelevantBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const url = response.url();
    if (!/\/api\/v1\/(projects|materials|pins|workspaces|yops|branches|commits)/.test(url)) {
      return;
    }
    errors.push(`api ${response.status()}: ${response.request().method()} ${url}`);
  });
  return errors;
}

const COMPLEX_TREE = [
  {
    key: 'prd',
    slots: { title: 'Reviewable enterprise changes' },
    children: [
      {
        key: 'summary',
        slots: {
          problem: 'Enterprise reviewers need traceable and safe generated changes.',
          audience: 'Platform product managers, compliance reviewers, and release engineers',
          outcome: 'Every proposed field is reviewable before branch history advances.',
        },
        children: [],
      },
      {
        key: 'requirements',
        slots: {},
        children: COMPLEX_SOURCES.map((source, index) => ({
          key: ['evidence_coverage_matrix', 'validation_recovery_loop', 'branch_head_precondition'][
            index
          ],
          slots: {
            title: source.text.match(/Requirement: (.+)/)?.[1] ?? source.title,
            priority: source.text.match(/Priority: (.+)/)?.[1] ?? 'must',
            acceptance: [source.text.match(/Acceptance: (.+)/)?.[1] ?? 'The change is accepted.'],
          },
          children: [],
        })),
      },
    ],
  },
];

test('complex workspace: multiple sources flow through authoring and a safe review gate', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const projectName = `Workspace complex flow ${token}`;
  const { projectId } = await createTestProject(request, projectName);
  const workspaceId = 'workspace_branch:main';
  const browserErrors = watchRelevantBrowserErrors(page);

  try {
    for (const source of COMPLEX_SOURCES) {
      const materialId = await uploadTextMaterial(request, projectId, source);
      await includeMaterial(request, projectId, materialId);
    }

    // Extraction follows an explicit contract; an unbound workspace only has
    // the generic summary fallback and cannot produce PRD requirements.
    const seeded = await request.patch(`${API_BASE}/projects/${projectId}/workspaces/${workspaceId}`, {
      data: { workspace: {
        id: workspaceId, projectId, title: 'Main workspace', targetBranch: 'main', status: 'draft',
        summary: '', updatedAt: new Date().toISOString(), baseCommitHash: null, sourceBundle: [],
        schemaBindings: [],
        schemaCandidate: { summary: '', fields: [] }, schemaReview: { verdict: 'ready', summary: '', gaps: [] },
        yopsDraft: { id: 'complex-draft', operations: [] }, outputTargets: [],
      } },
    });
    expect(seeded.ok(), await seeded.text()).toBe(true);

    const workspaceUrl =
      `/t3x-dev/${repoSlug(projectName)}/workspaces` +
      `?workspace=${encodeURIComponent(workspaceId)}`;
    await page.goto(workspaceUrl);

    await expect(page.getByRole('region', { name: 'Workspace detail' })).toBeVisible();
    const sources = page.getByRole('button', { name: 'Workspace sources (3 included)' });
    await expect(sources).toBeVisible();
    await sources.click();
    for (const source of COMPLEX_SOURCES) {
      await expect(page.getByText(source.title, { exact: true })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await page.screenshot({ path: testInfo.outputPath('workspace-compose.png') });
    const initialized = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith(`/workspaces/${encodeURIComponent(workspaceId)}/authoring`)
    );
    await page.getByRole('button', { name: 'Enable Draft activity' }).click();
    const initializedResponse = await initialized;
    expect(initializedResponse.ok(), await initializedResponse.text()).toBe(true);
    const initializedPayload = await initializedResponse.json();
    const published = await request.post(
      `${API_BASE}/projects/${projectId}/workspaces/${encodeURIComponent(workspaceId)}/authoring/actions`,
      {
        data: {
          request_id: `complex-${token}`,
          expected_workspace_revision: initializedPayload.data.workspaceRevision,
          expected_revision: initializedPayload.data.compositionRevision,
          expected_ref_head: null,
          operations: [{ set: { path: 'trees', value: COMPLEX_TREE } }],
          reason: 'Combine the three reviewed sources into one explicit PRD draft.',
        },
      }
    );
    expect(published.ok(), await published.text()).toBe(true);
    const authoringResponse = await request.get(
      `${API_BASE}/projects/${projectId}/workspaces/${encodeURIComponent(workspaceId)}/authoring`
    );
    const authoringPayload = await authoringResponse.json();
    expect(authoringResponse.status(), JSON.stringify(authoringPayload)).toBe(200);
    expect(authoringPayload.data.current.trees).toEqual(COMPLEX_TREE);

    await page.reload();
    await expect(page.getByText('Branch head precondition', { exact: true }).first()).toBeVisible();
    await page.getByRole('tab', { name: 'Review', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Review', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'Prepare review', exact: true }).click();
    await expect(page).toHaveURL(/reviewSnapshot=/);
    await page.screenshot({ path: testInfo.outputPath('workspace-review-validated.png') });
    await expect(page.getByRole('button', { name: 'Approve and commit' })).toBeDisabled();
    await expect(page.getByText('The bound Schema has no conclusive validation result.')).toBeVisible();
    expect(browserErrors).toEqual([]);

    test.info().annotations.push({
      type: 'workspace-url',
      description: `http://localhost:3000${workspaceUrl}`,
    });
  } finally {
    if (!KEEP_FIXTURE) await cleanupProject(request, projectId).catch(() => {});
  }
});
