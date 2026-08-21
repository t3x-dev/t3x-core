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

function flattenCandidateFields(fields: unknown[]): Array<Record<string, unknown>> {
  return fields.flatMap((field) => {
    if (!field || typeof field !== 'object') return [];
    const record = field as Record<string, unknown>;
    const children = Array.isArray(record.children) ? record.children : [];
    return [record, ...flattenCandidateFields(children)];
  });
}

test('complex workspace: multiple sources flow through proposal, validation, preview, and audited commit', async ({
  page,
  request,
}) => {
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

    const workspaceUrl =
      `/t3x-dev/${repoSlug(projectName)}/workspaces` +
      `?workspace=${encodeURIComponent(workspaceId)}`;
    await page.goto(workspaceUrl);

    await expect(
      page.getByRole('heading', { exact: true, name: 'T3X Workspace' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { exact: true, name: 'Main workspace' })
    ).toBeVisible();
    for (const source of COMPLEX_SOURCES) {
      await expect(page.getByText(source.title, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText('3 sources', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Generate candidate proposal' }).click();
    await expect(page.getByRole('tab', { name: /Proposal/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    const extractedResponse = await request.get(
      `${API_BASE}/projects/${projectId}/workspaces/${encodeURIComponent(workspaceId)}`
    );
    const extractedPayload = await extractedResponse.json();
    expect(extractedResponse.status(), JSON.stringify(extractedPayload)).toBe(200);
    expect(extractedPayload.data.workspace.schemaCandidate.summary).toMatch(
      /Deterministic scaffold mapped \d+ schema fields from 3 sources/
    );
    const candidateFields = flattenCandidateFields(
      extractedPayload.data.workspace.schemaCandidate.fields as unknown[]
    );
    expect(candidateFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'requirements.evidence_coverage_matrix.title',
          value: 'Evidence coverage matrix',
        }),
        expect.objectContaining({
          path: 'requirements.validation_recovery_loop.title',
          value: 'Validation recovery loop',
        }),
        expect.objectContaining({
          path: 'requirements.branch_head_precondition.title',
          value: 'Branch head precondition',
        }),
      ])
    );

    await page.getByRole('button', { name: 'Generate YOps proposal' }).click();
    await expect(page.getByRole('tab', { name: /Validation/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByText('Proposal ready', { exact: true })).toBeVisible();

    const yopsResponse = await request.get(
      `${API_BASE}/projects/${projectId}/workspaces/${encodeURIComponent(workspaceId)}`
    );
    const yopsPayload = await yopsResponse.json();
    expect(yopsResponse.status(), JSON.stringify(yopsPayload)).toBe(200);
    expect(yopsPayload.data.workspace.yopsDraft.operations).toHaveLength(12);
    expect(yopsPayload.data.workspace.yopsDraft.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          op: 'add',
          path: 'prd/requirements/branch_head_precondition/acceptance/-',
        }),
      ])
    );

    await page.getByRole('button', { name: /Validate proposal/ }).click();
    await expect(page.getByText('Proposal validated', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Apply YOps/ })).toBeEnabled();

    await page.getByRole('button', { name: /Apply YOps/ }).click();
    await expect(page.getByRole('tab', { name: /Preview/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByRole('region', { name: 'PRD preview' })).toContainText(
      'Branch head precondition'
    );
    await expect(page.getByRole('region', { name: 'PRD preview' })).toContainText(
      'Review is blocked when the target branch differs from the verified workspace branch.'
    );
    await expect(page.getByText('Preview ready for commit', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Continue to Commit' }).click();
    await page.getByLabel('Change note (optional)').fill(
      'Verify multi-source evidence, deterministic validation, and branch-safe commit review.'
    );
    await page.getByRole('button', { name: 'Review change' }).click();
    await expect(page.getByLabel('Validation: passed')).toContainText('passed');
    await expect(page.getByRole('heading', { name: 'Decide in Changes' })).toBeVisible();
    await page.getByRole('link', { name: 'Open Changes' }).last().click();
    await expect(page).toHaveURL(/\/changes\//);
    await expect(
      page.getByText('Changes is the review and decision surface backed by an immutable ReviewSnapshot.')
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve and save' })).toBeEnabled();
    await page.getByRole('button', { name: 'Approve and save' }).click();
    await expect(page.getByRole('region', { name: 'Saved change review' })).toContainText(
      'Saved change'
    );

    await page.goto(workspaceUrl);
    await page.getByRole('tab', { name: /Commit/ }).click();
    await expect(page.getByRole('tab', { name: /Commit/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByRole('button', { name: 'View in State' })).toBeVisible();
    await expect(page.getByText(/sha256:[0-9a-f]{64}/).first()).toBeVisible();

    await page.getByRole('link', { name: 'Pull requests' }).click();
    await page.getByRole('button', { name: /Create PR/i }).click();
    await expect(page.getByRole('heading', { name: 'Open pull request' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'base:' })).toContainText('main');
    await expect(
      page.getByText('No other committed branches can be compared with this base.')
    ).toBeVisible();
    await expect(page.getByText('Loading branch comparisons...')).toHaveCount(0);
    expect(browserErrors).toEqual([]);

    test.info().annotations.push({
      type: 'workspace-url',
      description: `http://localhost:3000${workspaceUrl}`,
    });
  } finally {
    if (!KEEP_FIXTURE) await cleanupProject(request, projectId).catch(() => {});
  }
});
