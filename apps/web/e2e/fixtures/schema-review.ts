import { expect, type Page } from '@playwright/test';

export async function savePreparedSchema(page: Page) {
  const prepare = page.getByRole('button', { name: 'Prepare review', exact: true });
  const refreshNotice = page.getByText('Draft saved. Refresh to see the updated Draft.');
  await page.getByRole('button', { name: 'Save prepared Draft', exact: true }).click();
  await expect(prepare.or(refreshNotice).first()).toBeVisible();
  if (await refreshNotice.isVisible()) {
    await page.getByRole('button', { name: 'Refresh Draft', exact: true }).click();
  }
  await expect(prepare).toBeVisible();
}

export async function finishSchemaReview(page: Page) {
  const save = page.getByRole('button', { name: 'Save prepared Draft', exact: true });
  const prepare = page.getByRole('button', { name: 'Prepare review', exact: true });
  const fixed = page.getByRole('heading', { name: /Review · Fixed snapshot/ });
  await expect(save.or(prepare).or(fixed).first()).toBeVisible();
  if (!(await save.isVisible()) && (await prepare.isVisible())) await prepare.click();
  await expect(save.or(fixed).first()).toBeVisible();
  if (await save.isVisible()) {
    await savePreparedSchema(page);
    await prepare.click();
  }
  await expect(fixed).toBeVisible();
}
