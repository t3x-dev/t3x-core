import { expect, test } from '@playwright/test';

/**
 * Cleanup-aftermath smoke — assert core routes render without console errors.
 *
 * Intent:
 * - catches routes that silently 404 (e.g. page.tsx deleted during a refactor)
 * - catches hydration errors + unhandled rejections
 * - complements the static Biome boundary check and the runtime import-boundary test
 *
 * Explicitly excludes /agent-demo — that is a standalone service on :9000,
 * never exposed as a WebUI route (see audit A-4).
 */

const STATIC_ROUTES = ['/', '/chat', '/insights', '/deploy'];

/**
 * Console-error allowlist. KEEP TIGHT — only patterns verified safe.
 *
 * - ERR_CONNECTION_REFUSED: /deploy polls the runner service on :8080, which is
 *   an opt-in Docker profile (`--profile runner`). Not running the runner is a
 *   supported local-dev configuration; the page gracefully shows empty state.
 *   We still want to catch mount/hydration errors on /deploy, so we only filter
 *   the network error, not all console.error output.
 */
const BENIGN_CONSOLE_ERRORS = [/ERR_CONNECTION_REFUSED/];

let projectId = '';

test.beforeAll(async ({ request }) => {
  const resp = await request.post('http://localhost:8000/api/v1/projects', {
    data: { name: `smoke-${Date.now()}` },
  });
  const body = await resp.json();
  expect(body.success).toBe(true);
  projectId = body.data.project_id as string;
});

for (const route of STATIC_ROUTES) {
  test(`route ${route} renders without console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    page.on('console', m => {
      if (m.type() !== 'error') return;
      const text = m.text();
      if (BENIGN_CONSOLE_ERRORS.some(rx => rx.test(text))) return;
      errors.push(`console.error: ${text}`);
    });

    const resp = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(resp?.status() ?? 200).toBeLessThan(400);
    await page.waitForTimeout(2500);
    await expect(page.locator('body')).toBeVisible();

    expect(errors, `errors on ${route}:\n${errors.join('\n')}`).toEqual([]);
  });
}

test('project canvas route renders without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (BENIGN_CONSOLE_ERRORS.some(rx => rx.test(text))) return;
    errors.push(`console.error: ${text}`);
  });

  const resp = await page.goto(`/project/${projectId}`, { waitUntil: 'domcontentloaded' });
  expect(resp?.status() ?? 200).toBeLessThan(400);
  await page.waitForTimeout(3000);
  await expect(page.locator('body')).toBeVisible();

  expect(errors, `errors on project canvas:\n${errors.join('\n')}`).toEqual([]);
});
