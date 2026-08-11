import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { API_BASE, API_ORIGIN } from '../fixtures/api-helpers';

interface Identity {
  username: string;
  password: string;
  name: string;
}

interface Session {
  id: string;
  api_key: string;
  name: string | null;
  username: string | null;
}

interface BrowserApiResult<T = unknown> {
  status: number;
  body: {
    success?: boolean;
    data?: T;
    error?: { code?: string; message?: string };
  };
}

const authEnabled = process.env.T3X_E2E_AUTH_ENABLED === '1';
const runId = `${Date.now()}-${process.pid}`;
const alice: Identity = {
  username: `e2e_alice_${runId}`,
  password: 'alice-password-123',
  name: `E2E Alice ${runId}`,
};
const bob: Identity = {
  username: `e2e_bob_${runId}`,
  password: 'bob-password-123',
  name: `E2E Bob ${runId}`,
};

let aliceSession: Session;

test.describe('authenticated browser boundaries', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!authEnabled, 'Run through pnpm e2e:auth with authentication enabled.');

  test('redirects unauthenticated visitors and registers a browser session', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2F$/);

    await page.getByRole('button', { name: 'Register' }).click();
    await page.getByLabel('Username').fill(alice.username);
    await page.getByLabel('Password').fill(alice.password);
    await page.getByLabel(/Display Name/).fill(alice.name);

    const registration = page.waitForResponse(
      (response) => response.url() === `${API_BASE}/auth/register` && response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Create Account' }).click();

    const response = await registration;
    expect(response.status()).toBe(200);
    const payload = (await response.json()) as { success: boolean; data: Session };
    expect(payload.success).toBe(true);
    aliceSession = payload.data;

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 't3x-dev' })).toBeVisible();
    await expect.poll(() => readSessionKey(page)).toBe(aliceSession.api_key);
  });

  test('keeps project HTTP and WebSocket access isolated between browser sessions', async ({
    browser,
    page,
    request,
  }) => {
    const aliceKey = await loginThroughBrowser(page, alice);
    const aliceProjectName = `Alice Private ${runId}`;
    const aliceProject = await browserApi<{ project_id: string }>(
      page,
      aliceKey,
      'POST',
      '/projects',
      { name: aliceProjectName }
    );
    expect(aliceProject.status).toBe(201);
    expect(aliceProject.body.success).toBe(true);
    const aliceProjectId = aliceProject.body.data?.project_id;
    expect(aliceProjectId).toBeTruthy();

    await registerThroughApi(request, bob);
    const bobContext = await browser.newContext();
    const bobPage = await bobContext.newPage();

    try {
      const bobKey = await loginThroughBrowser(bobPage, bob);
      const bobProjectName = `Bob Visible ${runId}`;
      const bobProject = await browserApi<{ project_id: string }>(
        bobPage,
        bobKey,
        'POST',
        '/projects',
        {
          name: bobProjectName,
          owner_id: aliceSession.id,
        }
      );
      expect(bobProject.status).toBe(201);

      await bobPage.goto('/');
      await expect(bobPage.getByRole('heading', { name: 't3x-dev' })).toBeVisible();
      await expect(
        bobPage.locator('article').filter({ hasText: bobProjectName }).first()
      ).toBeVisible();
      await expect(bobPage.getByText(aliceProjectName, { exact: true })).toHaveCount(0);

      const concealed = await browserApi(
        bobPage,
        bobKey,
        'GET',
        `/projects/${encodeURIComponent(aliceProjectId as string)}`
      );
      expect([403, 404]).toContain(concealed.status);

      const ownSocket = await openProjectSocket(
        page,
        aliceKey,
        aliceProjectId as string
      );
      expect(ownSocket.kind).toBe('connected');
      expect(ownSocket.projectId).toBe(aliceProjectId);

      const deniedSocket = await openProjectSocket(
        bobPage,
        bobKey,
        aliceProjectId as string
      );
      expect(deniedSocket.kind).toBe('denied');
    } finally {
      await bobContext.close();
    }
  });

  test('rejects a browser session immediately after its API key is revoked', async ({ page }) => {
    const administratorKey = await loginThroughBrowser(page, alice);
    const created = await browserApi<{ id: string; key: string }>(
      page,
      administratorKey,
      'POST',
      '/api-keys',
      { name: `browser-revocation-${runId}` }
    );
    expect(created.status).toBe(201);
    const revocableId = created.body.data?.id;
    const revocableKey = created.body.data?.key;
    expect(revocableId).toBeTruthy();
    expect(revocableKey).toBeTruthy();

    await setSessionKey(page, revocableKey as string);
    const beforeRevocation = await browserApi(page, revocableKey as string, 'GET', '/projects');
    expect(beforeRevocation.status).toBe(200);

    const revoked = await browserApi(
      page,
      administratorKey,
      'DELETE',
      `/api-keys/${encodeURIComponent(revocableId as string)}`
    );
    expect(revoked.status).toBe(200);

    const afterRevocation = await browserApi(page, revocableKey as string, 'GET', '/projects');
    expect(afterRevocation.status).toBe(401);
    expect(afterRevocation.body.error?.code).toBe('UNAUTHORIZED');
  });
});

async function registerThroughApi(
  request: APIRequestContext,
  identity: Identity
): Promise<Session> {
  const response = await request.post(`${API_BASE}/auth/register`, {
    data: identity,
  });
  const payload = (await response.json()) as { success: boolean; data?: Session; error?: unknown };
  expect(response.status()).toBe(200);
  expect(payload.success).toBe(true);
  expect(payload.data).toBeTruthy();
  return payload.data as Session;
}

async function loginThroughBrowser(page: Page, identity: Identity): Promise<string> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(identity.username);
  await page.getByLabel('Password').fill(identity.password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 't3x-dev' })).toBeVisible();
  const key = await readSessionKey(page);
  expect(key).toBeTruthy();
  return key as string;
}

async function readSessionKey(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const match = document.cookie.match(/(?:^|;\s*)t3x-session=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
  });
}

async function setSessionKey(page: Page, key: string): Promise<void> {
  await page.evaluate((sessionKey) => {
    document.cookie = `t3x-session=${encodeURIComponent(sessionKey)}; path=/; samesite=lax`;
  }, key);
}

async function browserApi<T = unknown>(
  page: Page,
  token: string,
  method: string,
  path: string,
  data?: Record<string, unknown>
): Promise<BrowserApiResult<T>> {
  return page.evaluate(
    async ({ apiUrl, bearerToken, requestMethod, requestPath, requestData }) => {
      const response = await fetch(`${apiUrl}/api/v1${requestPath}`, {
        method: requestMethod,
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          ...(requestData ? { 'Content-Type': 'application/json' } : {}),
        },
        body: requestData ? JSON.stringify(requestData) : undefined,
      });
      return {
        status: response.status,
        body: await response.json(),
      };
    },
    {
      apiUrl: API_ORIGIN,
      bearerToken: token,
      requestMethod: method,
      requestPath: path,
      requestData: data,
    }
  ) as Promise<BrowserApiResult<T>>;
}

async function openProjectSocket(
  page: Page,
  token: string,
  projectId: string
): Promise<{ kind: 'connected' | 'denied'; projectId?: string }> {
  return page.evaluate(
    ({ apiUrl, bearerToken, targetProjectId }) =>
      new Promise<{ kind: 'connected' | 'denied'; projectId?: string }>((resolve) => {
        const wsOrigin = apiUrl.replace(/^http/, 'ws');
        const socket = new WebSocket(
          `${wsOrigin}/ws?project_id=${encodeURIComponent(targetProjectId)}&token=${encodeURIComponent(bearerToken)}`
        );
        const timer = window.setTimeout(() => {
          socket.close();
          resolve({ kind: 'denied' });
        }, 5000);

        socket.addEventListener('message', (event) => {
          window.clearTimeout(timer);
          const envelope = JSON.parse(String(event.data)) as {
            type?: string;
            projectId?: string;
            project_id?: string;
          };
          socket.close();
          resolve({
            kind: envelope.type === 'connected' ? 'connected' : 'denied',
            projectId: envelope.projectId ?? envelope.project_id,
          });
        });
        socket.addEventListener('error', () => {
          window.clearTimeout(timer);
          resolve({ kind: 'denied' });
        });
        socket.addEventListener('close', () => {
          window.clearTimeout(timer);
          resolve({ kind: 'denied' });
        });
      }),
    {
      apiUrl: API_ORIGIN,
      bearerToken: token,
      targetProjectId: projectId,
    }
  );
}
