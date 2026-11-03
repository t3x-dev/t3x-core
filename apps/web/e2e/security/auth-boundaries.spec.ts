import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { API_BASE } from '../fixtures/api-helpers';

interface Identity {
  username: string;
  password: string;
  name: string;
}

interface Session {
  id: string;
  name: string | null;
  username: string | null;
}

interface DirectSession extends Session {
  api_key: string;
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
const aliceNamespace = `alice-${runId}`;
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
      (response) =>
        response.url().endsWith('/api/v1/auth/register') && response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Create Account' }).click();

    const response = await registration;
    expect(response.status()).toBe(200);
    const payload = (await response.json()) as { success: boolean; data: Session };
    expect(payload.success).toBe(true);
    expect(payload.data).not.toHaveProperty('api_key');
    aliceSession = payload.data;

    await expect(page).toHaveURL('/onboarding/namespace');
    await expect.poll(() => readSessionKey(page)).toBeNull();
    const sessionCookie = (await page.context().cookies()).find(
      (cookie) => cookie.name === 't3x-session'
    );
    expect(sessionCookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' });

    await page.getByLabel('Personal namespace').fill(aliceNamespace);
    const namespaceCreation = page.waitForResponse(
      (namespaceResponse) =>
        namespaceResponse.url().endsWith('/api/v1/namespaces') &&
        namespaceResponse.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Continue' }).click();

    expect((await namespaceCreation).status()).toBe(201);
    await expect(page).toHaveURL(`/${aliceNamespace}`);
    await expect(page.getByRole('heading', { name: aliceNamespace })).toBeVisible();
    await expect(page.getByText('Namespace access denied')).toHaveCount(0);
  });

  test('keeps project HTTP and WebSocket access isolated between browser sessions', async ({
    browser,
    page,
    request,
  }) => {
    await loginThroughBrowser(page, alice, `/${aliceNamespace}`);
    const aliceProjectName = `Alice-Private-${runId}`;
    const aliceProject = await browserApi<{ project_id: string }>(
      page,
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
      await loginThroughBrowser(bobPage, bob, '/onboarding/namespace');
      expect(
        (await browserApi(bobPage, 'POST', '/namespaces', { slug: `bob-${runId}` })).status
      ).toBe(201);
      const bobProjectName = `Bob-Visible-${runId}`;
      const bobProject = await browserApi<{ project_id: string }>(
        bobPage,
        'POST',
        '/projects',
        {
          name: bobProjectName,
          namespace: `bob-${runId}`,
          owner_id: aliceSession.id,
        }
      );
      expect(bobProject.status).toBe(201);

      await bobPage.goto(`/bob-${runId}`);
      await expect(bobPage.getByRole('heading', { name: `bob-${runId}` })).toBeVisible();
      await expect(
        bobPage.locator('article').filter({ hasText: bobProjectName }).first()
      ).toBeVisible();
      await expect(bobPage.getByText(aliceProjectName, { exact: true })).toHaveCount(0);

      const concealed = await browserApi(
        bobPage,
        'GET',
        `/projects/${encodeURIComponent(aliceProjectId as string)}`
      );
      expect([403, 404]).toContain(concealed.status);

      const ownSocket = await openProjectSocket(page, aliceProjectId as string);
      expect(ownSocket.kind).toBe('connected');
      expect(ownSocket.projectId).toBe(aliceProjectId);

      const deniedSocket = await openProjectSocket(bobPage, aliceProjectId as string);
      expect(deniedSocket.kind).toBe('denied');
    } finally {
      await bobContext.close();
    }
  });

  test('normalizes a registered username and accepts case-insensitive sign-in', async ({ page }) => {
    const identity: Identity = {
      username: `E2E_Case_${runId}`,
      password: 'case-password-123',
      name: `E2E Case ${runId}`,
    };

    await page.goto('/login');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.getByLabel('Username').fill(identity.username);
    await page.getByLabel('Password').fill(identity.password);
    await page.getByLabel(/Display Name/).fill(identity.name);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page).toHaveURL('/onboarding/namespace');

    expect((await browserApi(page, 'POST', '/auth/logout')).status).toBe(200);
    await page.goto('/login');
    await page.getByLabel('Username').fill(identity.username.toUpperCase());
    await page.getByLabel('Password').fill(identity.password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL('/onboarding/namespace');
    await expect.poll(() => readSessionKey(page)).toBeNull();
    expect((await page.context().cookies()).some((cookie) => cookie.name === 't3x-session')).toBe(
      true
    );
  });

  test('logout immediately invalidates HTTP and the open browser WebSocket', async ({ page }) => {
    await loginThroughBrowser(page, alice, `/${aliceNamespace}`);
    const project = await browserApi<{ project_id: string }>(page, 'POST', '/projects', {
      name: `Logout-Project-${runId}`,
    });
    const projectId = project.body.data?.project_id;
    expect(projectId).toBeTruthy();
    await openTrackedProjectSocket(page, projectId as string);

    const logout = await browserApi(page, 'POST', '/auth/logout');
    expect(logout.status).toBe(200);
    await expect.poll(() => trackedSocketClosed(page)).toBe(true);

    const afterLogout = await browserApi(page, 'GET', '/projects');
    expect(afterLogout.status).toBe(401);
    expect(afterLogout.body.error?.code).toBe('UNAUTHORIZED');
    await expect.poll(() => readSessionKey(page)).toBeNull();
    expect((await page.context().cookies()).some((cookie) => cookie.name === 't3x-session')).toBe(
      false
    );
  });
});

async function registerThroughApi(
  request: APIRequestContext,
  identity: Identity
): Promise<DirectSession> {
  const response = await request.post(`${API_BASE}/auth/register`, {
    data: identity,
  });
  const payload = (await response.json()) as {
    success: boolean;
    data?: DirectSession;
    error?: unknown;
  };
  expect(response.status()).toBe(200);
  expect(payload.success).toBe(true);
  expect(payload.data).toBeTruthy();
  return payload.data as DirectSession;
}

async function loginThroughBrowser(
  page: Page,
  identity: Identity,
  expectedDestination: string
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(identity.username);
  await page.getByLabel('Password').fill(identity.password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(expectedDestination);
  await expect.poll(() => readSessionKey(page)).toBeNull();
  expect((await page.context().cookies()).some((cookie) => cookie.name === 't3x-session')).toBe(true);
}

async function readSessionKey(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const match = document.cookie.match(/(?:^|;\s*)t3x-session=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
  });
}

async function browserApi<T = unknown>(
  page: Page,
  method: string,
  path: string,
  data?: Record<string, unknown>
): Promise<BrowserApiResult<T>> {
  return page.evaluate(
    async ({ requestMethod, requestPath, requestData }) => {
      const response = await fetch(`/api/v1${requestPath}`, {
        method: requestMethod,
        headers: {
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
      requestMethod: method,
      requestPath: path,
      requestData: data,
    }
  ) as Promise<BrowserApiResult<T>>;
}

async function openProjectSocket(
  page: Page,
  projectId: string
): Promise<{ kind: 'connected' | 'denied'; projectId?: string }> {
  return page.evaluate(
    (targetProjectId) =>
      new Promise<{ kind: 'connected' | 'denied'; projectId?: string }>((resolve) => {
        const wsOrigin = window.location.origin.replace(/^http/, 'ws');
        const socket = new WebSocket(
          `${wsOrigin}/ws?project_id=${encodeURIComponent(targetProjectId)}`
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
    projectId
  );
}

async function openTrackedProjectSocket(page: Page, projectId: string): Promise<void> {
  await page.evaluate(
    (targetProjectId) =>
      new Promise<void>((resolve, reject) => {
        const wsOrigin = window.location.origin.replace(/^http/, 'ws');
        const socket = new WebSocket(
          `${wsOrigin}/ws?project_id=${encodeURIComponent(targetProjectId)}`
        );
        (window as typeof window & { __t3xTestSocket?: WebSocket }).__t3xTestSocket = socket;
        socket.addEventListener('message', () => resolve(), { once: true });
        socket.addEventListener('error', () => reject(new Error('WebSocket handshake failed')), {
          once: true,
        });
      }),
    projectId
  );
}

async function trackedSocketClosed(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const socket = (window as typeof window & { __t3xTestSocket?: WebSocket }).__t3xTestSocket;
    return socket?.readyState === WebSocket.CLOSED;
  });
}
