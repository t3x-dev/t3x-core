/** biome-ignore-all lint/suspicious/noExplicitAny: route assertions inspect JSON response envelopes */

import {
  builtInPrdCoreArtifact,
  builtInYSchemaCores,
  builtInYSchemaModules,
  defaultPrdCompositionModuleOrder,
} from '@t3x-dev/yschema';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { yschemaCompositionRoutes } from '../routes/yschema-composition.openapi';

function compositionRequest(moduleOrder = [...defaultPrdCompositionModuleOrder]) {
  return {
    apiVersion: 't3x.dev/yschema-composition/v1',
    id: 'api-prd-composition',
    revision: 0,
    family: 'prd',
    status: 'draft',
    core: {
      canonicalName: builtInPrdCoreArtifact.canonicalName,
      version: builtInPrdCoreArtifact.version,
    },
    modules: moduleOrder.map((canonicalName, index) => ({
      canonicalName,
      version: '1.0.0',
      order: index + 1,
    })),
  };
}

describe('YSchema Composition routes', () => {
  const app = new Hono();
  app.route('/', yschemaCompositionRoutes);

  it('lists built-in Core and Module artifacts', async () => {
    const response = await app.request('/v1/yschema/artifacts?limit=100');
    expect(response.status).toBe(200);
    const body: any = await response.json();
    const cores = body.data.items.filter(
      (item: any) => item.apiVersion === 't3x.dev/yschema-core/v1'
    );
    const modules = body.data.items.filter(
      (item: any) => item.apiVersion === 't3x.dev/yschema-module/v1'
    );
    expect(cores.map((core: any) => core.canonicalName).sort()).toEqual(
      builtInYSchemaCores.map((core) => core.canonicalName).sort()
    );
    expect(modules).toHaveLength(builtInYSchemaModules.length);
    expect(modules.map((module: any) => module.canonicalName).sort()).toEqual(
      builtInYSchemaModules.map((module) => module.canonicalName).sort()
    );
    expect(body.data).toMatchObject({ has_more: false, next_cursor: null });
  });

  it('filters Registry artifacts to one compatible Schema family', async () => {
    const response = await app.request('/v1/yschema/artifacts?family=esphome-device');
    expect(response.status).toBe(200);
    const body: any = await response.json();

    expect(body.data.items).toHaveLength(
      1 + builtInYSchemaModules.filter((module) => module.family === 'esphome-device').length
    );
    expect(new Set(body.data.items.map((item: any) => item.family))).toEqual(
      new Set(['esphome-device'])
    );
    expect(body.data.items.map((item: any) => item.canonicalName)).toContain(
      't3x/esphome-device-core'
    );
  });

  it('returns a stable valid compilation preview', async () => {
    const call = () =>
      app.request('/v1/yschema/compositions/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(compositionRequest()),
      });
    const first = await call();
    const second = await call();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody: any = await first.json();
    const secondBody: any = await second.json();
    expect(firstBody).toEqual(secondBody);
    expect(firstBody.data.report).toEqual({ valid: true, issues: [] });
    expect(firstBody.data.renderPlan).toHaveLength(7);
    expect(firstBody.data.compiledSchemaHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('compiles an open v2 composition without a family or Core', async () => {
    const response = await app.request('/v1/yschema/compositions/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiVersion: 't3x.dev/yschema-composition/v2',
        id: 'open-frontend',
        revision: 0,
        status: 'draft',
        modules: [
          {
            canonicalName: 't3x/prd-frontend-design',
            version: '1.0.0',
            presentationOrder: 10,
          },
          {
            canonicalName: 't3x/prompt-few-shot-examples',
            version: '1.0.0',
            presentationOrder: 20,
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(body.data.report).toMatchObject({ valid: true, mode: 'open', issues: [] });
    expect(body.data.renderPlan.map((entry: any) => entry.artifact)).toEqual([
      't3x/prd-frontend-design',
      't3x/prompt-few-shot-examples',
    ]);
    expect(body.data.compiledSchemaHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(body.data.reportHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('publishes both endpoints in OpenAPI', async () => {
    const document: any = yschemaCompositionRoutes.getOpenAPIDocument({
      openapi: '3.1.0',
      info: { title: 'YSchema Composition routes', version: '1.0.0' },
    });
    expect(document.paths['/v1/yschema/artifacts']?.get).toBeDefined();
    expect(document.paths['/v1/yschema/compositions/preview']?.post).toBeDefined();
    expect(document.paths['/v1/projects/{projectId}/yschema/artifacts']?.get).toBeDefined();
    expect(
      document.paths['/v1/projects/{projectId}/yschema/compositions/preview']?.post
    ).toBeDefined();
    expect(
      document.paths['/v1/projects/{projectId}/workspaces/{workspaceId}/schema-composition']?.get
    ).toBeDefined();
    expect(
      document.paths['/v1/projects/{projectId}/workspaces/{workspaceId}/schema-composition']?.put
    ).toBeDefined();
    expect(
      document.paths['/v1/projects/{projectId}/workspaces/{workspaceId}/schema-composition/apply']
        ?.post
    ).toBeDefined();
    expect(document.components.schemas.YSchemaCompositionPreviewResponse).toBeDefined();
    expect(document.components.schemas.WorkspaceYSchemaCompositionResponse).toBeDefined();
  });
});
