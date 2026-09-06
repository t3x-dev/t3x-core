import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures/test';
import { API_BASE } from '../fixtures/api-helpers';

test('signed-in Studio enforces independent source and destination authority with exact old releases', async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    process.env.T3X_E2E_AUTH_ENABLED !== '1',
    'Requires the auth-enabled full-stack runner'
  );
  test.setTimeout(90000);
  const suffix = randomUUID().slice(0, 8);
  const identity = (kind: string) => ({
    username: `studio_${kind}_${suffix}`,
    password: 'local-fixture-password-123',
    name: `Studio ${kind} ${suffix}`,
  });
  const owner = identity('owner');
  const reader = identity('reader');
  async function register(data: ReturnType<typeof identity>) {
    const response = await request.post(`${API_BASE}/auth/register`, { data });
    expect(response.status()).toBe(200);
    return (await response.json()).data as { id: string; api_key: string };
  }
  const ownerSession = await register(owner);
  const readerSession = await register(reader);
  function api(key: string, method: string, path: string, data?: unknown) {
    return request.fetch(`${API_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}` },
      ...(data === undefined ? {} : { data }),
    });
  }
  async function create(key: string, name: string) {
    const response = await api(key, 'POST', '/projects', { name });
    expect(response.status()).toBe(201);
    return (await response.json()).data.project_id as string;
  }
  for (const [session, kind] of [
    [ownerSession, 'owner'],
    [readerSession, 'reader'],
  ] as const) {
    const response = await api(session.api_key, 'POST', '/namespaces', {
      slug: `studio-${kind}-${suffix}`,
    });
    expect(response.status()).toBe(201);
  }
  const source = await create(ownerSession.api_key, `Private publisher ${suffix}`);
  const target = await create(readerSession.api_key, `Reader Studio ${suffix}`);
  const readOnlyTarget = await create(ownerSession.api_key, `Read only destination ${suffix}`);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const workspaceId = 'publish';
    const workspace = {
      id: workspaceId,
      projectId: source,
      title: 'Publication',
      targetBranch: 'main',
      status: 'draft',
      summary: '',
      updatedAt: new Date().toISOString(),
      baseCommitHash: null,
      sourceBundle: [],
      schemaBindings: [],
      schemaCandidate: { summary: '', fields: [] },
      schemaReview: { verdict: 'ready', summary: '', gaps: [] },
      yopsDraft: { id: 'draft', operations: [] },
      outputTargets: [],
    };
    const saved = await api(
      ownerSession.api_key,
      'PATCH',
      `/projects/${source}/workspaces/${workspaceId}`,
      { workspace }
    );
    expect(saved.ok()).toBe(true);
    const revision = (await saved.json()).data.workspace.revision;
    const composition = await api(
      ownerSession.api_key,
      'PUT',
      `/projects/${source}/workspaces/${workspaceId}/schema-composition`,
      {
        composition: {
          apiVersion: 't3x.dev/yschema-composition/v2',
          id: 'auth-composition',
          revision: 0,
          status: 'draft',
          modules: [{ canonicalName: 't3x/prd-core', version: '1.1.0', presentationOrder: 10 }],
        },
        if_revision: revision,
      }
    );
    expect(composition.ok()).toBe(true);
    const compiled = (await composition.json()).data;
    const canonicalName = `auth-${suffix}/definition`;
    for (const version of ['1.0.0', '2.0.0']) {
      const published = await api(
        ownerSession.api_key,
        'POST',
        `/projects/${source}/workspaces/${workspaceId}/schema-composition/publish`,
        {
          composition_revision: compiled.composition.revision,
          composition_hash: compiled.preview.compositionHash,
          canonical_name: canonicalName,
          version,
          title: 'Private release definition',
          description: 'An exact release for our team.',
        }
      );
      expect(published.ok(), await published.text()).toBe(true);
    }
    const input = { sourceProjectId: source, canonicalName, version: '1.0.0' };
    expect(
      (
        await api(
          readerSession.api_key,
          'POST',
          `/projects/${target}/schema-studio/candidates`,
          input
        )
      ).status()
    ).toBe(404);
    async function grant(project: string) {
      const response = await api(ownerSession.api_key, 'PUT', `/projects/${project}/guests`, {
        principal: { kind: 'human', principal_id: readerSession.id },
        role: 'viewer',
        expires_at: null,
      });
      expect(response.ok(), await response.text()).toBe(true);
      return (await response.json()).data.guest;
    }
    const sourceGuest = await grant(source);
    await grant(readOnlyTarget);
    const added = await api(
      readerSession.api_key,
      'POST',
      `/projects/${target}/schema-studio/candidates`,
      input
    );
    expect(added.ok(), await added.text()).toBe(true);
    const candidate = (await added.json()).data;
    expect(candidate.source.version).toBe('1.0.0');
    const again = await api(
      readerSession.api_key,
      'POST',
      `/projects/${target}/schema-studio/candidates`,
      input
    );
    expect((await again.json()).data.id).toBe(candidate.id);
    expect(
      (
        await api(
          readerSession.api_key,
          'POST',
          `/projects/${readOnlyTarget}/schema-studio/candidates`,
          input
        )
      ).status()
    ).toBe(403);
    expect(
      (await request.get(`${API_BASE}/projects/${target}/schema-studio/candidates`)).status()
    ).toBe(401);
    await page.goto('/login');
    await page.getByLabel('Username').fill(reader.username);
    await page.getByLabel('Password').fill(reader.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL('/');
    await page.goto(`/project/${target}?tab=schemas&schemaView=studio&candidate=${candidate.id}`, {
      waitUntil: 'networkidle',
    });
    await expect(page.getByRole('heading', { name: 'Definition preview' })).toBeVisible();
    await expect(
      page.getByText('Importing private structure requires edit authority on its source project.')
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review & apply' })).toBeDisabled();
    await expect(page.getByRole('region', { name: 'Saved Studio candidates' })).toContainText(
      '1.0.0'
    );
    await page.screenshot({
      path: testInfo.outputPath('studio-source-read-only.png'),
      animations: 'disabled',
    });
    const revoked = await api(
      ownerSession.api_key,
      'DELETE',
      `/projects/${source}/guests/${sourceGuest.grant_id}`
    );
    expect(revoked.ok(), await revoked.text()).toBe(true);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByRole('region', { name: 'Saved Studio candidates' })).toContainText(
      'Unavailable source'
    );
    await expect(page.getByRole('region', { name: 'Saved Studio candidates' })).not.toContainText(
      'Private release definition'
    );
    const list = await api(
      readerSession.api_key,
      'GET',
      `/projects/${target}/schema-studio/candidates`
    );
    expect((await list.json()).data.items[0]).toMatchObject({
      available: false,
      source: null,
      title: null,
    });
    expect(
      (
        await api(readerSession.api_key, 'POST', `/projects/${target}/schema-studio/preview`, {
          candidateIds: [candidate.id],
        })
      ).status()
    ).toBe(404);
    expect((await api(readerSession.api_key, 'GET', `/projects/${target}/workspaces`)).ok()).toBe(
      true
    );
    await page.screenshot({
      path: testInfo.outputPath('studio-source-revoked.png'),
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  } finally {
    await api(ownerSession.api_key, 'DELETE', `/projects/${source}`);
    await api(ownerSession.api_key, 'DELETE', `/projects/${readOnlyTarget}`);
    await api(readerSession.api_key, 'DELETE', `/projects/${target}`);
  }
});
