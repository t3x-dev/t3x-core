import type { APIRequestContext } from '@playwright/test';
import {
  API_BASE,
  cleanupProject,
  createTestBranch,
  createTestMaterial,
  createTestProject,
} from '../fixtures/api-helpers';
import { expect, test } from '../fixtures/test';

const WORKSPACE_PRD = {
  title: 'Post-commit workspace smoke',
  summary: {
    problem: 'Users need to continue working after a commit.',
    audience: 'Product teams',
    outcome: 'A fresh iteration keeps the committed baseline.',
  },
  requirements: {
    continue_after_commit: {
      title: 'Continue after commit',
      priority: 'must',
      acceptance: ['Users can continue from the committed baseline.'],
    },
  },
};

interface RenewedWorkspaceFixture {
  commitHash: string;
  projectId: string;
  repoPath: string;
  workspaceId: string;
}

function repoSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

async function createRenewedWorkspaceFixture(
  request: APIRequestContext,
  scenario: string
): Promise<RenewedWorkspaceFixture> {
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const projectName = `Post commit ${scenario} ${token}`;
  const { projectId } = await createTestProject(request, projectName);
  const material = await createTestMaterial(
    request,
    projectId,
    'Product teams need to continue working from the committed PRD baseline.'
  );
  const workspaceId = 'workspace_branch:main';
  const endpoint = `${API_BASE}/projects/${projectId}/workspaces/${encodeURIComponent(workspaceId)}`;
  try {
    let currentResponse = await request.get(endpoint);
    if (currentResponse.status() === 404) {
      const created = await request.patch(endpoint, {
        data: {
          workspace: {
            id: workspaceId,
            projectId,
            title: 'Main workspace',
            targetBranch: 'main',
            status: 'draft',
            summary: '',
            updatedAt: new Date().toISOString(),
            baseCommitHash: null,
            sourceBundle: [
              {
                id: `material:${material.materialId}`,
                type: 'document',
                title: 'release-evidence.txt',
                materialId: material.materialId,
                contentHash: material.contentHash,
              },
            ],
            schemaBindings: [
              {
                canonicalName: 't3x/prd',
                mode: 'pinned',
                schemaName: 'PRD Schema',
                version: 'v2',
              },
            ],
            schemaCandidate: { summary: '', fields: [] },
            schemaReview: { verdict: 'ready', summary: '', gaps: [] },
            yopsDraft: { id: `draft:${workspaceId}`, operations: [] },
            outputTargets: [],
          },
        },
      });
      expect(created.ok(), await created.text()).toBe(true);
      currentResponse = await request.get(endpoint);
    }
    expect(currentResponse.ok(), await currentResponse.text()).toBe(true);
    const current = (await currentResponse.json()).data.workspace;
    const initialized = await request.post(`${endpoint}/authoring`, {
      data: {
        request_id: `initialize-${token}`,
        expected_workspace_revision: current.revision,
        expected_ref_head: null,
      },
    });
    expect(initialized.ok(), await initialized.text()).toBe(true);
    const initializedData = (await initialized.json()).data;
    const action = await request.post(`${endpoint}/authoring/actions`, {
      data: {
        request_id: `action-${token}`,
        expected_workspace_revision: initializedData.workspaceRevision,
        expected_revision: initializedData.compositionRevision,
        expected_ref_head: null,
        operations: [{ set: { path: 'prd', value: WORKSPACE_PRD } }],
        reason: `Prepare the ${scenario} post-commit baseline.`,
      },
    });
    expect(action.ok(), await action.text()).toBe(true);
    const actionData = (await action.json()).data;
    const review = await request.post(`${endpoint}/authoring/reviews`, {
      data: {
        request_id: `review-${token}`,
        expected_workspace_revision: actionData.workspaceRevision,
        expected_revision: actionData.compositionRevision,
        expected_ref_head: null,
      },
    });
    expect(review.ok(), await review.text()).toBe(true);
    const reviewed = (await review.json()).data;
    const decision = await request.post(
      `${API_BASE}/projects/${projectId}/transitions/${reviewed.view.transition_id}/decisions`,
      {
        data: {
          request_id: `decision-${token}`,
          outcome: 'accepted',
          precondition: reviewed.view.precondition,
        },
      }
    );
    expect(decision.ok(), await decision.text()).toBe(true);
    const decisionData = (await decision.json()).data;
    const committed = await request.post(
      `${API_BASE}/projects/${projectId}/transitions/${reviewed.view.transition_id}/commits`,
      {
        data: {
          request_id: `commit-${token}`,
          decision_digest: decisionData.decision_digest,
          expected_head: reviewed.view.precondition.ref_head,
        },
      }
    );
    expect(committed.ok(), await committed.text()).toBe(true);
    const commitHash = (await committed.json()).data.commit_digest as string;
    return {
      commitHash,
      projectId,
      repoPath: `/t3x-dev/${repoSlug(projectName)}`,
      workspaceId,
    };
  } catch (error) {
    await cleanupProject(request, projectId).catch(() => {});
    throw error;
  }
}

async function readWorkspace(request: APIRequestContext, fixture: RenewedWorkspaceFixture) {
  const response = await request.get(
    `${API_BASE}/projects/${fixture.projectId}/workspaces/${encodeURIComponent(fixture.workspaceId)}`
  );
  expect(response.status()).toBe(200);
  return (await response.json()).data.workspace;
}

test('post-commit: accepted change renews the main Workspace from the committed baseline', async ({
  page,
  request,
}) => {
  const fixture = await createRenewedWorkspaceFixture(request, 'continue');
  try {
    const workspace = await readWorkspace(request, fixture);
    expect(workspace.status).toBe('draft');
    expect(workspace.baseCommitHash).toBe(fixture.commitHash);
    expect(workspace.lastCommitHash).toBe(fixture.commitHash);
    expect(workspace.authoringLedger.compositionRevision).toBe(0);

    await page.goto(
      `${fixture.repoPath}/workspaces?workspace=${encodeURIComponent(fixture.workspaceId)}`
    );
    await expect(page.getByRole('region', { name: 'Workspace detail' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Compose', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByRole('complementary', { name: 'Post-commit actions' })).toHaveCount(0);

    await page.goto(`${fixture.repoPath}?view=overview&commit=${encodeURIComponent(fixture.commitHash)}`);
    await expect(
      page.getByRole('region', { name: 'Committed State' }).getByText('Post-commit workspace smoke')
    ).toBeVisible();
  } finally {
    await cleanupProject(request, fixture.projectId);
  }
});

test('post-commit: a new branch inherits the committed head and gets its own Workspace', async ({
  page,
  request,
}) => {
  const fixture = await createRenewedWorkspaceFixture(request, 'branch');
  const branchName = `feature/post-commit-${Date.now().toString(36)}`;
  try {
    await createTestBranch(request, fixture.projectId, branchName, { parentBranch: 'main' });
    const workspaceId = `workspace_branch:${encodeURIComponent(branchName)}`;
    const response = await request.get(
      `${API_BASE}/projects/${fixture.projectId}/workspaces/${encodeURIComponent(workspaceId)}`
    );
    expect(response.ok(), await response.text()).toBe(true);
    const workspace = (await response.json()).data.workspace;
    expect(workspace.status).toBe('draft');
    expect(workspace.baseCommitHash).toBe(fixture.commitHash);
    expect(workspace.targetBranch).toBe(branchName);

    await page.goto(
      `${fixture.repoPath}/workspaces?branch=${encodeURIComponent(branchName)}&workspace=${encodeURIComponent(workspaceId)}`
    );
    await expect(page.getByText(`Branch workspace: ${branchName}`).first()).toBeVisible();
  } finally {
    await cleanupProject(request, fixture.projectId);
  }
});

test('post-commit: exact committed State export remains stable after Workspace renewal', async ({
  request,
}) => {
  const fixture = await createRenewedWorkspaceFixture(request, 'export');
  try {
    const endpoint = `${API_BASE}/commits/${encodeURIComponent(fixture.commitHash)}/export?project_id=${fixture.projectId}&format=yaml`;
    const first = await request.get(endpoint);
    const second = await request.get(endpoint);
    expect(first.ok(), await first.text()).toBe(true);
    expect(second.ok(), await second.text()).toBe(true);
    expect((await second.json()).data.content).toBe((await first.json()).data.content);
    expect((await readWorkspace(request, fixture)).baseCommitHash).toBe(fixture.commitHash);
  } finally {
    await cleanupProject(request, fixture.projectId);
  }
});
