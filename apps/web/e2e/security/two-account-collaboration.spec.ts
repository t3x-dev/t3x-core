import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

const authEnabled = process.env.T3X_E2E_AUTH_ENABLED === '1';
const runId = `${Date.now()}-${process.pid}`;
const accountA = {
  username: `collab_a_${runId}`,
  password: 'collab-a-password-123',
  displayName: `Collaboration A ${runId}`,
  namespace: `collab-a-${runId}`,
};
const accountB = {
  username: `collab_b_${runId}`,
  password: 'collab-b-password-123',
  displayName: `Collaboration B ${runId}`,
  namespace: `collab-b-${runId}`,
};

test.describe('two-account browser collaboration', () => {
  test.skip(!authEnabled, 'Run through pnpm e2e:auth with authentication enabled.');

  test('creates, invites, commits, opens a pull request, and merges using only the UI', async ({
    browser,
  }, testInfo) => {
    test.setTimeout(180_000);
    const contextA = await browser.newContext({
      extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.10' },
    });
    const contextB = await browser.newContext({
      extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.11' },
    });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    pageA.setDefaultTimeout(10_000);
    pageB.setDefaultTimeout(10_000);
    const repositoryName = `collab-${runId}`;
    const branchName = `feature/collab-${runId}`;
    const pullRequestTitle = `Merge browser collaboration ${runId}`;

    try {
      await registerAndOnboard(pageA, accountA);
      await registerAndOnboard(pageB, accountB);

      await pageA.getByRole('link', { name: 'New repository', exact: true }).first().click();
      await pageA.getByLabel('Repository name', { exact: true }).fill(repositoryName);
      await pageA.getByLabel('Description', { exact: true }).fill('Two-account browser qualification');
      await pageA.getByRole('switch', { name: 'Initialize PRD starter' }).check();
      const createRepository = pageA.waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/projects') && response.request().method() === 'POST'
      );
      await pageA.getByRole('button', { name: 'Create repository', exact: true }).click();
      expect((await createRepository).status()).toBe(201);
      await expect(pageA).toHaveURL(new RegExp(`/${accountA.namespace}/${repositoryName}/workspaces`));
      await pageA.screenshot({
        path: testInfo.outputPath('01-account-a-created-repository.png'),
        fullPage: true,
        animations: 'disabled',
      });

      const initialSourcesButton = pageA.getByRole('button', { name: /Workspace sources/ });
      await initialSourcesButton.press('Enter');
      const initialFileChooser = pageA.waitForEvent('filechooser');
      await pageA.getByRole('menuitem', { name: 'Add source', exact: true }).click();
      await (await initialFileChooser).setFiles({
        name: `prd-starter-evidence-${runId}.txt`,
        mimeType: 'text/plain',
        buffer: Buffer.from(
          'The initial PRD records product collaborators and provides a reviewed baseline for account B.'
        ),
      });
      await expect(pageA.getByText(/prd-starter-evidence-.* added as source evidence/)).toBeVisible();

      const advancedToolsA = pageA.getByRole('button', { name: 'Advanced tools', exact: true });
      await advancedToolsA.press('Enter');
      await pageA.getByRole('menuitem', { name: 'Edit Draft', exact: true }).click();
      const initialDraftDialog = pageA.getByRole('dialog', { name: 'Edit Workspace Draft' });
      await initialDraftDialog.getByRole('button', { name: 'Edit audience', exact: true }).click();
      await initialDraftDialog.getByLabel('Value').fill('Product collaborators');
      await initialDraftDialog.getByRole('button', { name: 'Apply', exact: true }).click();
      await expect(initialDraftDialog.getByRole('button', { name: 'Edit audience' })).toBeVisible();
      await initialDraftDialog.getByRole('button', { name: 'Close', exact: true }).click();
      const saveInitialDraft = pageA.waitForResponse(
        (response) =>
          /\/workspaces\/[^/]+\/authoring\/actions$/.test(new URL(response.url()).pathname) &&
          response.request().method() === 'POST'
      );
      await pageA.getByRole('button', { name: /^Save selected as P/ }).click();
      expect((await saveInitialDraft).ok()).toBe(true);
      await pageA.getByRole('tab', { name: 'Review', exact: true }).click();
      const initialUnsavedDialog = pageA.getByRole('dialog', {
        name: 'Unsaved Content changes',
      });
      if (await initialUnsavedDialog.isVisible()) {
        await initialUnsavedDialog
          .getByRole('button', { name: 'Discard local changes and continue' })
          .click();
      }
      const prepareInitialReview = pageA.waitForResponse(
        (response) =>
          /\/workspaces\/[^/]+\/authoring\/reviews$/.test(new URL(response.url()).pathname) &&
          response.request().method() === 'POST'
      );
      await pageA.getByRole('button', { name: 'Prepare review', exact: true }).click();
      expect((await prepareInitialReview).ok()).toBe(true);
      const commitInitialReview = pageA.waitForResponse(
        (response) =>
          /\/workspaces\/[^/]+\/transition\/decide$/.test(new URL(response.url()).pathname) &&
          response.request().method() === 'POST'
      );
      await pageA.getByRole('button', { name: 'Approve and commit', exact: true }).click();
      expect((await commitInitialReview).ok()).toBe(true);
      const initialCommitted = pageA.getByText('Committed', { exact: true }).first();
      await expect(initialCommitted)
        .toBeVisible({ timeout: 2_000 })
        .catch(async () => {
          const retryInitialDecision = pageA.waitForResponse(
            (response) =>
              /\/workspaces\/[^/]+\/transition\/decide$/.test(
                new URL(response.url()).pathname
              ) && response.request().method() === 'POST'
          );
          await pageA.getByRole('button', { name: 'Retry original decision' }).click();
          expect((await retryInitialDecision).ok()).toBe(true);
          await expect(initialCommitted).toBeVisible();
        });

      await pageA.getByRole('link', { name: 'Settings', exact: true }).click();
      await pageA.getByRole('link', { name: 'Access', exact: true }).click();
      const projectAccess = pageA.getByRole('region', { name: 'Project access' });
      await projectAccess.getByLabel('Project invitee username or email').fill(accountB.username);
      const createInvitation = pageA.waitForResponse(
        (response) =>
          /\/api\/v1\/projects\/[^/]+\/invitations$/.test(new URL(response.url()).pathname) &&
          response.request().method() === 'POST'
      );
      await projectAccess.getByRole('button', { name: 'Invite', exact: true }).click();
      expect((await createInvitation).status()).toBe(201);
      const invitationCode = projectAccess.locator('code').filter({ hasText: '/invite#' });
      await expect(invitationCode).toBeVisible();
      const invitationUrl = (await invitationCode.textContent())?.trim();
      expect(invitationUrl).toMatch(/\/invite#token=/);
      await pageA.screenshot({
        path: testInfo.outputPath('02-account-a-invited-account-b.png'),
        fullPage: true,
        animations: 'disabled',
      });

      await pageB.goto(invitationUrl as string);
      await expect(pageB.getByRole('heading', { name: 'Invitation accepted' })).toBeVisible();
      await pageB.getByRole('link', { name: 'Open project', exact: true }).click();
      await expect(pageB.getByRole('link', { name: 'State', exact: true })).toHaveAttribute(
        'aria-current',
        'page'
      );

      const branchSwitcher = pageB.getByRole('button', {
        name: 'Switch branches/tags, current branch main',
      });
      const branchSearch = pageB.getByLabel('Find or create branch');
      await branchSwitcher.click();
      await expect(branchSearch)
        .toBeVisible({ timeout: 1_000 })
        .catch(async () => branchSwitcher.click());
      await branchSearch.fill(branchName);
      const createBranch = pageB.waitForResponse(
        (response) =>
          new URL(response.url()).pathname.endsWith('/api/v1/branches') &&
          response.request().method() === 'POST'
      );
      const branchWorkspaceReady = pageB.waitForResponse(
        (response) =>
          /\/workspaces\/[^/]+\/authoring$/.test(new URL(response.url()).pathname) &&
          response.request().method() === 'GET'
      );
      await pageB
        .getByRole('menuitem', { name: `Create branch ${branchName} from main`, exact: true })
        .click();
      expect((await createBranch).status()).toBe(201);
      await expect(pageB).toHaveURL(
        (url) =>
          url.searchParams.get('tab') === 'workspaces' &&
          url.searchParams.get('branch') === branchName
      );
      expect((await branchWorkspaceReady).ok()).toBe(true);

      const evidenceFileName = `browser-collaboration-${runId}.txt`;
      const sourcesButton = pageB.getByRole('button', { name: /Workspace sources/ });
      await pageB.waitForTimeout(300);
      await sourcesButton.press('Enter');
      const fileChooser = pageB.waitForEvent('filechooser');
      await pageB.getByRole('menuitem', { name: 'Add source', exact: true }).click();
      await (await fileChooser).setFiles({
        name: evidenceFileName,
        mimeType: 'text/plain',
        buffer: Buffer.from(
          'Product collaborators need account B to author a reviewed change and account A to merge its pull request.'
        ),
      });
      await expect(pageB.getByText(`${evidenceFileName} added as source evidence.`)).toBeVisible();

      const advancedTools = pageB.getByRole('button', { name: 'Advanced tools', exact: true });
      const editDraft = pageB.getByRole('menuitem', { name: 'Edit Draft', exact: true });
      await pageB.waitForTimeout(300);
      await advancedTools.press('Enter');
      await expect(editDraft)
        .toBeVisible({ timeout: 1_000 })
        .catch(async () => {
          await advancedTools.press('Enter');
          await expect(editDraft).toBeVisible();
        });
      await editDraft.click();
      const draftDialog = pageB.getByRole('dialog', { name: 'Edit Workspace Draft' });
      await expect(draftDialog).toBeVisible();
      await draftDialog.getByRole('button', { name: 'Edit outcome', exact: true }).click();
      await draftDialog
        .getByRole('region', { name: 'Edit current Draft value' })
        .getByLabel('New value')
        .fill('Account B authored and account A merged this browser-tested collaboration change.');
      await draftDialog.getByLabel('Reason').fill('Verify two-account browser collaboration');
      await draftDialog.getByRole('button', { name: 'Save change', exact: true }).click();
      await expect(draftDialog.getByRole('button', { name: 'Edit outcome' })).toBeVisible();
      await draftDialog.getByRole('button', { name: 'Close', exact: true }).click();

      const saveDraft = pageB.waitForResponse(
        (response) =>
          /\/workspaces\/[^/]+\/authoring\/actions$/.test(new URL(response.url()).pathname) &&
          response.request().method() === 'POST'
      );
      await pageB.getByRole('button', { name: /^Save selected as P/ }).click();
      expect((await saveDraft).ok()).toBe(true);
      await expect(pageB.getByRole('button', { name: /^Save selected as P/ })).toBeHidden();

      const prepareReview = pageB.waitForResponse(
        (response) =>
          /\/workspaces\/[^/]+\/authoring\/reviews$/.test(new URL(response.url()).pathname) &&
          response.request().method() === 'POST'
      );
      await pageB.getByRole('tab', { name: 'Review', exact: true }).click();
      const unsavedDialog = pageB.getByRole('dialog', { name: 'Unsaved Content changes' });
      if (await unsavedDialog.isVisible()) {
        await unsavedDialog
          .getByRole('button', { name: 'Discard local changes and continue' })
          .click();
      }
      const prepareButton = pageB.getByRole('button', { name: 'Prepare review', exact: true });
      await expect(prepareButton).toBeVisible();
      await prepareButton.click();
      expect((await prepareReview).ok()).toBe(true);
      const approveAndCommit = pageB.getByRole('button', {
        name: 'Approve and commit',
        exact: true,
      });
      await expect(approveAndCommit).toBeEnabled();
      const commitBranch = pageB.waitForResponse(
        (response) =>
          /\/workspaces\/[^/]+\/transition\/decide$/.test(new URL(response.url()).pathname) &&
          response.request().method() === 'POST'
      );
      await approveAndCommit.click();
      expect((await commitBranch).ok()).toBe(true);
      await expect(pageB.getByText('Committed', { exact: true }).first()).toBeVisible();
      await pageB.screenshot({
        path: testInfo.outputPath('03-account-b-committed-feature-branch.png'),
        fullPage: true,
        animations: 'disabled',
      });

      const pullRequestsB = pageB.getByRole('link', { name: 'Pull requests', exact: true });
      await pullRequestsB.click();
      await expect(pullRequestsB)
        .toHaveAttribute('aria-current', 'page', { timeout: 2_000 })
        .catch(async () => pullRequestsB.click());
      await expect(pullRequestsB).toHaveAttribute('aria-current', 'page');
      await pageB.getByRole('button', { name: /New pull request|Create PR/ }).first().click();
      await expect(pageB.getByLabel('Base branch')).toContainText('main');
      await pageB.getByLabel('Source branch').click();
      await pageB.getByRole('option', { name: new RegExp(`^${escapeRegExp(branchName)}`) }).click();
      await pageB.getByLabel('Title', { exact: true }).fill(pullRequestTitle);
      await expect(pageB.getByRole('button', { name: 'Create pull request' })).toBeEnabled();
      const createPullRequest = pageB.waitForResponse(
        (response) =>
          /\/api\/v1\/projects\/[^/]+\/pull-requests$/.test(new URL(response.url()).pathname) &&
          response.request().method() === 'POST'
      );
      await pageB.getByRole('button', { name: 'Create pull request' }).click();
      expect((await createPullRequest).status()).toBe(201);
      const pullRequestHeading = pageB.getByRole('heading', { name: pullRequestTitle });
      await expect(pullRequestHeading)
        .toBeVisible({ timeout: 1_500 })
        .catch(async () => {
          await pageB
            .getByRole('button', {
              name: new RegExp(`View PR #\\d+: ${escapeRegExp(pullRequestTitle)}`),
            })
            .click();
          await expect(pullRequestHeading).toBeVisible();
        });
      await pageB.screenshot({
        path: testInfo.outputPath('04-account-b-opened-pull-request.png'),
        fullPage: true,
        animations: 'disabled',
      });

      const pullRequestsA = pageA.getByRole('link', { name: 'Pull requests', exact: true });
      await pullRequestsA.click();
      await expect(pullRequestsA)
        .toHaveAttribute('aria-current', 'page', { timeout: 2_000 })
        .catch(async () => pullRequestsA.click());
      await expect(pullRequestsA).toHaveAttribute('aria-current', 'page');
      await pageA
        .getByRole('button', { name: new RegExp(`View PR #\\d+: ${escapeRegExp(pullRequestTitle)}`) })
        .click();
      const mergeButton = pageA.getByRole('button', { name: 'Merge PR' });
      if (!(await mergeButton.isEnabled())) {
        const saveAndRecheck = pageA.getByRole('button', {
          name: 'Save & recheck Schema and content',
          exact: true,
        });
        if (await saveAndRecheck.isVisible()) await saveAndRecheck.click();
        else await pageA.getByRole('button', { name: 'Rerun readiness' }).click();
      }
      await expect(mergeButton).toBeEnabled({ timeout: 30_000 });
      const mergePullRequest = pageA.waitForResponse(
        (response) =>
          /\/api\/v1\/projects\/[^/]+\/pull-requests\/[^/]+\/merge$/.test(
            new URL(response.url()).pathname
          ) && response.request().method() === 'POST'
      );
      await mergeButton.click();
      expect((await mergePullRequest).ok()).toBe(true);
      await expect(pageA.getByText('Merged', { exact: true }).first()).toBeVisible();
      await pageA.getByRole('link', { name: 'State', exact: true }).click();
      await pageA.getByRole('tab', { name: /Structure/ }).click();
      await pageA.getByRole('button', { name: 'Code', exact: true }).click();
      await expect(pageA.getByRole('region', { name: 'State structure' })).toContainText(
        'Account B authored and account A merged this browser-tested collaboration change.'
      );
      await pageA.screenshot({
        path: testInfo.outputPath('05-account-a-verified-merged-state.png'),
        fullPage: true,
        animations: 'disabled',
      });
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});

async function registerAndOnboard(
  page: Page,
  account: {
    username: string;
    password: string;
    displayName: string;
    namespace: string;
  }
): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.getByLabel('Username').fill(account.username);
  await page.getByLabel('Password').fill(account.password);
  await page.getByLabel(/Display Name/).fill(account.displayName);
  await page.getByRole('button', { name: 'Create Account', exact: true }).click();
  await expect(page).toHaveURL('/onboarding/namespace');
  await page.getByLabel('Personal namespace').fill(account.namespace);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(`/${account.namespace}`);
  await expect(page.getByRole('heading', { name: /^Repositories/ })).toBeVisible();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
