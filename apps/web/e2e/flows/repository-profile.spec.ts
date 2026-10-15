import { expect, test } from '@playwright/test';

// Require an explicitly disposable API; never exercise a user's existing data.
const api = process.env.T3X_REPOSITORY_PROFILE_TEST_API;
test.use({ channel: process.env.T3X_BROWSER_CHANNEL });
test.setTimeout(120_000);
test.skip(!api, 'Set T3X_REPOSITORY_PROFILE_TEST_API to an isolated test server');

test('creates and independently maintains repository information without business commits', async ({ page, request }, testInfo) => {
  let failNextSave = false;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (failNextSave && route.request().method() === 'PUT' && /\/projects\/[^/]+$/.test(url.pathname)) {
      failNextSave = false;
      await route.fulfill({ status: 503, json: { success: false, error: { code: 'UNAVAILABLE', message: 'Temporary profile save failure' } } });
      return;
    }
    const headers = { ...route.request().headers() };
    delete headers.authorization;
    const response = await route.fetch({ url: `${api}${url.pathname}${url.search}`, headers });
    await route.fulfill({ response });
  });

  const name = `Profile-${Date.now()}`;
  const tagInput = page.getByRole('textbox', { name: 'Tags', exact: true });
  async function addTags(tags: string[]) {
    for (const tag of tags) {
      await tagInput.fill(tag);
      await tagInput.press('Enter');
    }
  }
  async function clearTags() {
    const remove = page.getByRole('dialog').getByRole('button', { name: /^Remove tag / });
    while (await remove.count()) await remove.first().click();
  }
  await page.goto('/t3x-dev/new');
  await expect(page.getByRole('checkbox', { name: 'Initialize README' })).not.toBeChecked();
  await page.getByLabel('Repository name', { exact: true }).fill(name);
  await page.getByLabel('Description', { exact: true }).fill('Real repository description');
  await page.getByRole('checkbox', { name: 'Initialize README' }).check();
  await addTags([' 中文 ', 'Dev', '中文']);
  await expect(page.getByRole('group', { name: 'Selected tags' })).toHaveText('#中文#Dev');
  await expect(page.getByRole('button', { name: 'Create repository' })).toBeEnabled();
  const createdResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/v1/projects'));
  await page.getByRole('button', { name: 'Create repository' }).click();
  const created = await createdResponse;
  expect(created.status()).toBe(201);
  const project = (await created.json()).data;
  const projectUrl = `${api}/api/v1/projects/${project.project_id}`;
  expect(project.repository_profile).toEqual({ readme: `# ${name}\n\nReal repository description\n`, tags: ['中文', 'Dev'] });
  await expect(page).toHaveURL(new RegExp(`/t3x-dev/${name}/workspaces`));
  const before = (await (await request.get(projectUrl)).json()).data;
  const beforeBranches = await (await request.get(`${projectUrl}/branches`)).json();
  expect(before.commits_count).toBe(0);

  await page.goto(`/t3x-dev/${name}?view=overview`);
  const readme = page.getByRole('region', { name: 'Repository README', exact: true });
  await expect(readme.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByText('No commits yet', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit README', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Repository README' })).toHaveValue(project.repository_profile.readme);
  await page.getByRole('textbox', { name: 'Repository README' }).fill('# Saved from browser\n\n![Missing](images/missing.png)\n\n[Danger](javascript:alert)');
  await page.mouse.click(8, 8);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Edit repository README' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Repository README' })).toHaveValue('# Saved from browser\n\n![Missing](images/missing.png)\n\n[Danger](javascript:alert)');
  await page.screenshot({ path: testInfo.outputPath('repository-readme-dialog.png'), fullPage: true, animations: 'disabled' });
  failNextSave = true;
  await page.getByRole('button', { name: 'Save README', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Temporary profile save failure');
  await expect(page.getByRole('textbox', { name: 'Repository README' })).toContainText('# Saved from browser');
  await page.getByRole('button', { name: 'Save README', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(readme.getByRole('heading', { name: 'Saved from browser' })).toBeVisible();
  await expect(readme.getByText('[Image unavailable: Missing]')).toBeVisible();
  await expect(readme.getByRole('link', { name: 'Danger' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit tags', exact: true }).click();
  await tagInput.fill('Cancelled');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await (await request.get(projectUrl)).json()).data.repository_profile.tags).toEqual(['中文', 'Dev']);
  await expect(page.getByRole('button', { name: 'Edit tags', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Edit tags', exact: true }).click();
  await clearTags();
  await addTags([' 分类 ', 'Case', 'case', '分类']);
  await page.screenshot({ path: testInfo.outputPath('repository-tags-dialog.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Save tags', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(readme.getByRole('heading', { name: 'Saved from browser' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Repository tags', exact: true })).toContainText('#分类#Case#case');
  await page.screenshot({ path: testInfo.outputPath('repository-profile.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Edit README', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('repository-profile-mobile.png'), fullPage: true, animations: 'disabled' });

  const longestTag = '中'.repeat(64);
  await page.getByRole('button', { name: 'Edit tags', exact: true }).click();
  await clearTags();
  // Save must include text that has not been converted into a chip with Enter.
  await tagInput.fill(longestTag);
  await page.screenshot({ path: testInfo.outputPath('repository-tags-dialog-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Save tags', exact: true }).click();
  const tags = page.getByRole('group', { name: 'Repository tags', exact: true });
  await expect(tags.getByText(`#${longestTag}`, { exact: true })).toBeVisible();
  expect((await tags.getByText(`#${longestTag}`, { exact: true }).boundingBox())!.width).toBeLessThanOrEqual((await tags.boundingBox())!.width);

  await page.getByRole('button', { name: 'Edit README', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Edit repository README' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('repository-readme-dialog-mobile.png'), fullPage: true, animations: 'disabled' });
  const dialogBox = (await page.getByRole('dialog').boundingBox())!;
  expect(dialogBox.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox.y).toBeGreaterThanOrEqual(0);
  expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(390);
  expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(844);
  await page.getByRole('textbox', { name: 'Repository README' }).fill('');
  await page.getByRole('button', { name: 'Save README', exact: true }).click();
  await expect(page.getByText('No README added yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Edit tags', exact: true }).click();
  await clearTags();
  await page.getByRole('button', { name: 'Save tags', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Add README', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add tags', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add README', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Repository README' })).toHaveValue(`# ${name}\n\nReal repository description\n`);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const after = (await (await request.get(projectUrl)).json()).data;
  expect(after.repository_profile).toEqual({ readme: '', tags: [] });
  expect(after.commits_count).toBe(0);
  expect(after.metadata).toEqual(before.metadata);
  expect(await (await request.get(`${projectUrl}/branches`)).json()).toEqual(beforeBranches);
});
