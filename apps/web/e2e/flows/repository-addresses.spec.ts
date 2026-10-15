import { expect, test } from '@playwright/test';

// Explicit disposable API prevents this migration test touching a user's DB.
const api = process.env.T3X_REPOSITORY_PATH_TEST_API;
test.use({ channel: process.env.T3X_BROWSER_CHANNEL });
test.setTimeout(120_000);
test.skip(!api, 'Set T3X_REPOSITORY_PATH_TEST_API to an isolated schema-v76 test server');

test('previews confirmed names and preserves navigation through renames and legacy addresses', async ({ page, request }) => {
  const name = `Paths-${Date.now()}`;
  const created = await request.post(`${api}/api/v1/projects`, { data: { name, namespace: 't3x-dev' } });
  expect(created.status()).toBe(201);
  const project = (await created.json()).data;
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const headers = { ...route.request().headers() };
    delete headers.authorization;
    const response = await route.fetch({ url: `${api}${url.pathname}${url.search}`, headers });
    await route.fulfill({ response });
  });

  await page.goto('/t3x-dev/new');
  await page.getByLabel('Repository name', { exact: true }).fill(' Release 2026101500000 ');
  await expect(page.getByText('/t3x-dev/Release-2026101500000', { exact: true })).toBeVisible();
  await expect(page.getByText('Name is available.', { exact: false })).toBeVisible();
  await page.getByLabel('Repository name', { exact: true }).fill('项目计划');
  await expect(page.getByText('Repository name must contain an ASCII letter or number.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create and start conversation' })).toBeDisabled();
  await page.getByLabel('Repository name', { exact: true }).fill(name.toLowerCase());
  await expect(page.getByText('This repository name is already occupied in this namespace.')).toBeVisible();

  const query = 'branch=main&workspace=w&conversation=c&pr=7';
  await page.goto(`/project/${project.project_id}/settings?${query}`);
  await expect(page).toHaveURL(new RegExp(`/t3x-dev/${name}/settings\\?${query}$`));
  await expect(page.getByLabel('Repository name', { exact: true })).toHaveValue(name);
  const renamed = `${name}_Next`;
  await page.getByLabel('Repository name', { exact: true }).fill(renamed);
  await expect(page.getByText(`/t3x-dev/${renamed}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/t3x-dev/${renamed}/settings\\?${query}$`));
  await expect(page.getByRole('heading', { name: renamed, exact: true })).toBeVisible();
  await expect(page.getByText(`/t3x-dev/${renamed}`, { exact: true })).toBeVisible();
  await expect(page.getByText('Name is available.', { exact: false })).toBeVisible();
  await page.screenshot({ path: '/tmp/d01-005-settings.png', fullPage: true });
  await page.reload();
  await expect(page.getByLabel('Repository name', { exact: true })).toHaveValue(renamed);

  const finalName = `${name}_Final`;
  const update = await request.put(`${api}/api/v1/projects/${project.project_id}`, { data: { name: finalName } });
  expect(update.status()).toBe(200);
  for (const old of [name, renamed.toLowerCase()]) {
    await page.goto(`/T3X-DEV/${old}/settings?${query}`);
    await expect(page).toHaveURL(new RegExp(`/t3x-dev/${finalName}/settings\\?${query}$`));
    await expect(page.getByLabel('Repository name', { exact: true })).toHaveValue(finalName);
  }
  await page.getByRole('link', { name: 'State', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/t3x-dev/${finalName}(?:\\?|$)`));
  await page.goBack();
  await expect(page.getByLabel('Repository name', { exact: true })).toHaveValue(finalName);
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/t3x-dev/${finalName}(?:\\?|$)`));
});
