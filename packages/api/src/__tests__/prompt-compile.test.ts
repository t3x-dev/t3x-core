/** biome-ignore-all lint/suspicious/noExplicitAny: route assertions inspect JSON response envelopes */

import { t3xPromptP0Fixtures } from '@t3x-dev/yschema';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { promptCompileRoutes } from '../routes/prompt-compile.openapi';

const responseSchema = JSON.stringify({
  type: 'object',
  properties: {
    requirements: {
      type: 'array',
      items: { type: 'object' },
    },
  },
  required: ['requirements'],
});

function evidenceForLeaves(value: unknown, prefix = ''): Record<string, unknown[]> {
  if (value === null || value === undefined) return {};
  if (Array.isArray(value) || typeof value !== 'object') {
    return prefix
      ? {
          [prefix]: [
            {
              origin: 'user_evidence',
              sourceId: `prompt-preview:${prefix}`,
            },
          ],
        }
      : {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      Object.entries(evidenceForLeaves(child, prefix ? `${prefix}/${key}` : key))
    )
  );
}

function validPreviewRequest() {
  const candidate = t3xPromptP0Fixtures.validCandidateTree;
  return {
    schema_name: 't3x/prompt',
    schema_version: 'v1',
    candidate,
    relations: t3xPromptP0Fixtures.validRelations,
    provenance_by_path: evidenceForLeaves(candidate),
    variable_values: {
      user_request: 'Extract the launch requirements.',
      source_material: 'The launch requires owner approval and an audit log.',
    },
    context_contents: {
      project_sources: 'Approved launch brief revision 3.',
    },
    resource_contents: {
      response_schema: responseSchema,
      extraction_policy: 'Use only facts present in the supplied source material.',
    },
  };
}

describe('Prompt compile preview route', () => {
  const app = new Hono();
  app.route('/', promptCompileRoutes);

  it('returns a stable successful preview for the same candidate and fixtures', async () => {
    const request = validPreviewRequest();
    const call = () =>
      app.request('/v1/prompts/compile-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

    const firstResponse = await call();
    const secondResponse = await call();
    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);

    const first: any = await firstResponse.json();
    const second: any = await secondResponse.json();
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      success: true,
      data: {
        compiled: true,
        schemaName: 't3x/prompt',
        schemaVersion: 'v1',
        issues: [],
      },
    });
    expect(first.data.messages.map((message: { key: string }) => message.key)).toEqual([
      'system_policy',
      'user_task',
    ]);
    expect(first.data.variables).toContainEqual(
      expect.objectContaining({ key: 'user_request', status: 'resolved' })
    );
    expect(first.data.resources).toContainEqual(
      expect.objectContaining({ key: 'response_schema', referenced: true, available: true })
    );
  });

  it('returns validation issues at Workspace State paths without running a prompt', async () => {
    const candidate = t3xPromptP0Fixtures.candidateWithHardErrors;
    const response = await app.request('/v1/prompts/compile-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...validPreviewRequest(),
        candidate,
        provenance_by_path: evidenceForLeaves(candidate),
      }),
    });

    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(body.data.compiled).toBe(false);
    expect(body.data.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INVALID_PATTERN',
          path: 'manifest/name',
          source: 'yschema',
          blocking: true,
        }),
        expect.objectContaining({
          code: 'INVALID_TYPE',
          path: 'variables/user_request/required',
          source: 'yschema',
          blocking: true,
        }),
      ])
    );
  });

  it('returns INVALID_REQUEST when the requested Prompt runtime is unavailable', async () => {
    const response = await app.request('/v1/prompts/compile-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...validPreviewRequest(),
        schema_version: 'v2',
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Prompt compiler runtime is unavailable for t3x/prompt@v2',
        details: { schema_name: 't3x/prompt', schema_version: 'v2' },
      },
    });
  });

  it('publishes the compile preview OpenAPI operation from createApp', async () => {
    const { app: mountedApp } = createApp({
      skipBuiltinAuth: true,
      skipLocalAuth: true,
    });
    const response = await mountedApp.request('/api/openapi.json');
    expect(response.status).toBe(200);

    const document: any = await response.json();
    expect(document.paths['/v1/prompts/compile-preview']?.post).toMatchObject({
      summary: 'Validate and deterministically compile a Prompt candidate',
      tags: ['Prompts'],
    });
    expect(document.components.schemas.PromptCompilePreviewResponse).toBeDefined();
  });
});
