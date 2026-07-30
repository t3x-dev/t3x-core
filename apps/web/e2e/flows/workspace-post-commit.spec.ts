import type { APIRequestContext, Page } from '@playwright/test';
import {
  cleanupProject,
  createTestProject,
} from '../fixtures/api-helpers';
import { expect, test } from '../fixtures/test';

const API_BASE = 'http://localhost:8000/api/v1';

const WORKSPACE_TREE = [
  {
    key: 'prd',
    slots: { title: 'Post-commit workspace smoke' },
    children: [
      {
        key: 'summary',
        slots: {
          problem: 'Users need to continue working after a commit.',
          audience: 'Product teams',
          outcome: 'A fresh iteration keeps the committed baseline.',
        },
        children: [],
      },
    ],
  },
];

interface CommittedWorkspaceFixture {
  commitHash: string;
  projectId: string;
  projectName: string;
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

async function createCommittedWorkspaceFixture(
  request: APIRequestContext,
  scenario: string
): Promise<CommittedWorkspaceFixture> {
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const projectName = `Post commit ${scenario} ${token}`;
  const { projectId } = await createTestProject(request, projectName);
  const workspaceId = `workspace_post_commit_${scenario}_${token.replaceAll('-', '_')}`;
  const message = `Post-commit ${scenario} baseline`;
  try {
    const saveResponse = await request.patch(
      `${API_BASE}/projects/${projectId}/workspaces/${workspaceId}`,
      {
        data: {
          workspace: {
            baseCommitHash: null,
            id: workspaceId,
            outputTargets: [],
            projectId,
            schemaBindings: [{ mode: 'pinned', schemaName: 'PRD Schema', version: 'v2' }],
            schemaCandidate: {
              fields: [
                {
                  id: 'field_problem',
                  label: 'Problem',
                  path: 'prd/summary/problem',
                  required: true,
                  status: 'covered',
                  type: 'string',
                  value: 'Users need to continue working after a commit.',
                },
              ],
              summary: 'Committed workspace candidate for live E2E verification.',
            },
            schemaReview: {
              gaps: [],
              summary: 'Ready to commit.',
              verdict: 'ready',
            },
            sourceBundle: [
              {
                id: 'source_chat_before_commit',
                title: 'Committed source chat',
                type: 'chat',
                previewTurns: [
                  {
                    author: 'User',
                    content: 'Keep this conversation in the committed history.',
                    id: 'turn_before_commit',
                    role: 'user',
                  },
                ],
              },
              {
                id: 'source_material_kept',
                previewText: 'Persistent source material for the next iteration.',
                title: 'Persistent material',
                type: 'text',
              },
            ],
            status: 'schema_review',
            summary: 'Verify the post-commit continuation workflow.',
            targetBranch: 'main',
            title: `Post-commit ${scenario} workspace`,
            updatedAt: new Date().toISOString(),
            yopsDraft: {
              id: `draft:${workspaceId}`,
              operations: [
                {
                  afterValue: 'Users need to continue working after a commit.',
                  id: 'op_problem',
                  op: 'set',
                  path: 'prd/summary/problem',
                  summary: 'Set the product problem.',
                },
              ],
            },
          },
        },
      }
    );
    expect(saveResponse.status()).toBe(200);
    const savePayload = await saveResponse.json();
    const workspaceRevision = savePayload.data.workspace.revision as number;
    expect(workspaceRevision).toBeGreaterThan(0);

    const commitResponse = await request.post(
      `${API_BASE}/projects/${projectId}/workspaces/${workspaceId}/commit`,
      {
        data: {
          content: { relations: [], trees: WORKSPACE_TREE },
          if_revision: workspaceRevision,
          message,
        },
      }
    );
    expect(commitResponse.status()).toBe(200);
    const commitPayload = await commitResponse.json();
    const commitHash = commitPayload.data.commit.hash as string;
    expect(commitPayload.data.workspace.status).toBe('committed');
    expect(commitPayload.data.workspace.lastCommitHash).toBe(commitHash);

    return {
      commitHash,
      projectId,
      projectName,
      repoPath: `/t3x-dev/${repoSlug(projectName)}`,
      workspaceId,
    };
  } catch (error) {
    await cleanupProject(request, projectId).catch(() => {});
    throw error;
  }
}

function watchRelevantBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const url = response.url();
    if (!/\/api\/v1\/(projects|workspaces|conversations|branches|commits)/.test(url)) return;
    errors.push(`api ${response.status()}: ${response.request().method()} ${url}`);
  });
  return errors;
}

async function openCommittedWorkspace(page: Page, fixture: CommittedWorkspaceFixture) {
  await page.goto(
    `${fixture.repoPath}/workspaces?workspace=${encodeURIComponent(fixture.workspaceId)}`
  );
  await expect(page.getByRole('heading', { exact: true, name: 'T3X Workspace' })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('tab', { exact: true, name: 'Commit' }).click();
  await expect(page.getByRole('complementary', { name: 'Post-commit actions' })).toBeVisible();
}

async function readWorkspace(request: APIRequestContext, fixture: CommittedWorkspaceFixture) {
  const response = await request.get(
    `${API_BASE}/projects/${fixture.projectId}/workspaces/${fixture.workspaceId}`
  );
  expect(response.status()).toBe(200);
  return (await response.json()).data.workspace;
}

async function readWorkspaceConversations(
  request: APIRequestContext,
  fixture: CommittedWorkspaceFixture
) {
  const response = await request.get(
    `${API_BASE}/conversations?project_id=${encodeURIComponent(fixture.projectId)}`
  );
  expect(response.status()).toBe(200);
  const payload = await response.json();
  return payload.data.conversations.filter(
    (conversation: { metadata?: { workspace_id?: string } | null }) =>
      conversation.metadata?.workspace_id === fixture.workspaceId
  );
}

test('post-commit: View in State focuses the commit, then Continue starts a main iteration', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const fixture = await createCommittedWorkspaceFixture(request, 'continue');
  const browserErrors = watchRelevantBrowserErrors(page);

  try {
    await openCommittedWorkspace(page, fixture);

    await page.getByRole('button', { exact: true, name: 'View in State' }).click();
    await expect(page).toHaveURL((url) => {
      return (
        url.pathname === fixture.repoPath &&
        url.searchParams.get('view') === 'canvas' &&
        url.searchParams.get('branch') === 'main' &&
        url.searchParams.get('commit') === fixture.commitHash
      );
    });
    await expect(page.getByRole('region', { name: 'Multi-commit state canvas' })).toBeVisible();
    await expect(
      page.locator(`.react-flow__node.selected[data-id="${fixture.commitHash}"]`)
    ).toBeVisible({ timeout: 15_000 });

    await openCommittedWorkspace(page, fixture);
    const workspaceSave = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().endsWith(
          `/api/v1/projects/${fixture.projectId}/workspaces/${fixture.workspaceId}`
        )
    );
    const conversationCreate = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/api/v1/conversations')
    );
    await page.getByRole('button', { exact: true, name: 'Continue on main' }).click();
    const [workspaceSaveResponse, conversationCreateResponse] = await Promise.all([
      workspaceSave,
      conversationCreate,
    ]);
    expect(workspaceSaveResponse.status()).toBe(200);
    expect(conversationCreateResponse.status()).toBe(201);

    await expect(page.getByRole('tab', { exact: true, name: 'Source' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByRole('tab', { exact: true, name: 'Chat' })).toHaveAttribute(
      'data-state',
      'active'
    );
    await expect(page.getByText(`Based on ${fixture.commitHash.slice(7, 19)}`)).toBeVisible();
    await expect(page.getByText('Next commit to main')).toBeVisible();
    await expect(page.getByText('No source chat turns yet.')).toBeVisible();

    const workspace = await readWorkspace(request, fixture);
    expect(workspace.status).toBe('draft');
    expect(workspace.baseCommitHash).toBe(fixture.commitHash);
    expect(workspace.targetBranch).toBe('main');
    expect(workspace.lastCommitHash).toBeUndefined();
    expect(workspace.sourceBundle.map((source: { id: string }) => source.id)).toEqual([
      'source_material_kept',
    ]);
    expect(workspace.schemaCandidate.fields).toEqual([]);
    expect(workspace.yopsDraft.operations).toEqual([]);

    const conversations = await readWorkspaceConversations(request, fixture);
    expect(conversations).toHaveLength(1);
    expect(conversations[0].parent_commit_hash).toBe(fixture.commitHash);
    expect(conversations[0].metadata).toMatchObject({
      target_branch: 'main',
      workspace_id: fixture.workspaceId,
    });
    expect(browserErrors, browserErrors.join('\n')).toEqual([]);
  } finally {
    await cleanupProject(request, fixture.projectId).catch(() => {});
  }
});

test('post-commit: Create a new branch starts a fresh iteration from the committed baseline', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const fixture = await createCommittedWorkspaceFixture(request, 'branch');
  const browserErrors = watchRelevantBrowserErrors(page);
  const branchName = `feature/post-commit-${Date.now().toString(36)}`;

  try {
    await openCommittedWorkspace(page, fixture);
    await page.getByRole('button', { exact: true, name: 'Create a new branch' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create a new branch' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Branch name').fill(branchName);

    const branchCreate = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/api/v1/branches')
    );
    const workspaceSave = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().startsWith(
          `${API_BASE}/projects/${fixture.projectId}/workspaces/workspace_`
        )
    );
    const conversationCreate = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/api/v1/conversations')
    );
    await dialog.getByRole('button', { exact: true, name: 'Start on new branch' }).click();
    const [branchCreateResponse, workspaceSaveResponse, conversationCreateResponse] =
      await Promise.all([branchCreate, workspaceSave, conversationCreate]);
    expect(branchCreateResponse.status()).toBe(201);
    expect(workspaceSaveResponse.status()).toBe(200);
    expect(conversationCreateResponse.status()).toBe(201);
    const workspaceSavePayload = await workspaceSaveResponse.json();
    const nextWorkspaceId = workspaceSavePayload.data.workspace.id as string;
    const nextFixture = { ...fixture, workspaceId: nextWorkspaceId };

    await expect(page.getByRole('tab', { exact: true, name: 'Source' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByText(`Based on ${fixture.commitHash.slice(7, 19)}`)).toBeVisible();
    await expect(page.getByText(`Next commit to ${branchName}`)).toBeVisible();
    await expect(page.getByText('No source chat turns yet.')).toBeVisible();

    const workspace = await readWorkspace(request, nextFixture);
    expect(workspace.status).toBe('draft');
    expect(workspace.baseCommitHash).toBe(fixture.commitHash);
    expect(workspace.targetBranch).toBe(branchName);
    expect(workspace.lastCommitHash).toBeUndefined();

    const branchesResponse = await request.get(
      `${API_BASE}/branches?project_id=${encodeURIComponent(fixture.projectId)}`
    );
    expect(branchesResponse.status()).toBe(200);
    const branchesPayload = await branchesResponse.json();
    const branch = branchesPayload.data.branches.find(
      (item: { name: string }) => item.name === branchName
    );
    expect(branch).toMatchObject({ name: branchName, parent_branch: 'main' });

    const conversations = await readWorkspaceConversations(request, nextFixture);
    expect(conversations).toHaveLength(1);
    expect(conversations[0].parent_commit_hash).toBe(fixture.commitHash);
    expect(conversations[0].metadata).toMatchObject({
      target_branch: branchName,
      workspace_id: nextWorkspaceId,
    });
    expect(browserErrors, browserErrors.join('\n')).toEqual([]);
  } finally {
    await cleanupProject(request, fixture.projectId).catch(() => {});
  }
});
