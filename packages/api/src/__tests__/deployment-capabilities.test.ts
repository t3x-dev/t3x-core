import {
  type DeploymentCapabilities,
  SELF_HOSTED_DEPLOYMENT_CAPABILITIES,
  UNAVAILABLE_DEPLOYMENT_CAPABILITIES,
} from '@t3x-dev/api-client';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import {
  createDeploymentCapabilitiesMiddleware,
  parseDeploymentCapabilities,
} from '../lib/deployment-capabilities';
import { deploymentCapabilitiesRoutes } from '../routes/deployment-capabilities.openapi';

function capabilityApp(source?: DeploymentCapabilities | (() => unknown | Promise<unknown>)) {
  const app = new Hono();
  if (source) app.use('*', createDeploymentCapabilitiesMiddleware(source));
  app.route('/', deploymentCapabilitiesRoutes);
  return app;
}

const managedCapabilities: DeploymentCapabilities = {
  version: 1,
  deployment_mode: 'managed',
  provider_credentials: { administration: 'disabled' },
  inference: { mode: 'managed' },
  identity: {
    mode: 'managed',
    auth_operations: ['sign_in', 'sign_out'],
    account_operations: ['read', 'update'],
    namespaces: true,
  },
  usage: { mode: 'credits' },
  ui_extensions: { account: true, billing: true },
};

describe('deployment capabilities', () => {
  it('publishes a cacheable self-hosted contract without account entitlements', async () => {
    const response = await capabilityApp(SELF_HOSTED_DEPLOYMENT_CAPABILITIES).request(
      '/v1/deployment/capabilities'
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=60, stale-while-revalidate=300'
    );
    const body = await response.json();
    expect(body).toEqual({ success: true, data: SELF_HOSTED_DEPLOYMENT_CAPABILITIES });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/balance|membership|plan|project/i);
  });

  it('refreshes a dynamic managed adapter per request', async () => {
    let current: unknown = managedCapabilities;
    const app = capabilityApp(() => current);

    const managed = await app.request('/v1/deployment/capabilities');
    await expect(managed.json()).resolves.toMatchObject({
      data: { deployment_mode: 'managed', inference: { mode: 'managed' } },
    });

    current = SELF_HOSTED_DEPLOYMENT_CAPABILITIES;
    const refreshed = await app.request('/v1/deployment/capabilities');
    await expect(refreshed.json()).resolves.toMatchObject({
      data: { deployment_mode: 'self_hosted', inference: { mode: 'direct' } },
    });
  });

  it.each([
    undefined,
    { ...managedCapabilities, version: 2 },
    { ...managedCapabilities, balance: 100 },
    {
      ...managedCapabilities,
      identity: { ...managedCapabilities.identity, plan: 'pro' },
    },
  ])('fails closed for absent, incompatible, or extended capability data', (value) => {
    expect(parseDeploymentCapabilities(value)).toEqual(UNAVAILABLE_DEPLOYMENT_CAPABILITIES);
  });

  it('keeps the capability route available while a dynamic adapter is failing', async () => {
    let calls = 0;
    const app = capabilityApp(async () => {
      calls += 1;
      throw new Error('capability service unavailable');
    });
    app.get('/v1/projects/readable', (context) => context.json({ success: true }));

    const capabilityResponse = await app.request('/v1/deployment/capabilities');
    await expect(capabilityResponse.json()).resolves.toEqual({
      success: true,
      data: UNAVAILABLE_DEPLOYMENT_CAPABILITIES,
    });
    expect((await app.request('/v1/projects/readable')).status).toBe(200);
    expect(calls).toBe(1);
  });

  it('treats missing middleware context as unavailable', async () => {
    const response = await capabilityApp().request('/v1/deployment/capabilities');
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: UNAVAILABLE_DEPLOYMENT_CAPABILITIES,
    });
  });
});
