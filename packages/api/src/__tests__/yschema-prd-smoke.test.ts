import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { yschemaPrdSmokeRoutes } from '../routes/yschema-prd-smoke.openapi';

describe('YSchema PRD smoke routes', () => {
  const app = new Hono();
  app.route('/', yschemaPrdSmokeRoutes);

  it('returns the default PRD smoke result as JSON', async () => {
    const res = await app.request('/v1/dev/yschema/prd-smoke');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.schema_name).toBe('t3x/prd');
    expect(body.data.validation).toMatchObject({
      valid: true,
      ready: true,
      errors: [],
      gaps: [],
      fixes: [],
    });
    expect(body.data.prompt_contract.schemaName).toBe('t3x/prd');
    expect(body.data.relations).toContainEqual({
      from: 'requirements/review_gate',
      type: 'depends_on',
      to: 'requirements/schema_contract',
    });
  });

  it('is mounted under the API prefix in createApp', async () => {
    const { app: mountedApp } = createApp({
      skipBuiltinAuth: true,
      skipLocalAuth: true,
    });
    const res = await mountedApp.request('/api/v1/dev/yschema/prd-smoke?format=yaml');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/yaml');
    expect(await res.text()).toContain('schema_name: t3x/prd');
  });

  it('returns the default PRD smoke result as YAML', async () => {
    const res = await app.request('/v1/dev/yschema/prd-smoke?format=yaml');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/yaml');

    const body = await res.text();
    expect(body).toContain('schema_name: t3x/prd');
    expect(body).toContain('candidate:');
    expect(body).toContain('prompt_contract:');
    expect(body).toContain('validation:');
    expect(body).toContain('ready: true');
  });

  it('validates an edited PRD candidate submitted as YAML', async () => {
    const res = await app.request('/v1/dev/yschema/prd-smoke/validate?format=yaml', {
      method: 'POST',
      headers: { 'Content-Type': 'text/yaml' },
      body: `
candidate:
  summary:
    problem: Teams need schema-backed PRD review before committing structured state.
    audience: Product and engineering reviewers
    outcome: Reviewers can rerun validation after editing the YAML.
  requirements:
    contract_display:
      title: Display shared YSchema contracts
      priority: must
      acceptance:
        - P0 types are exported from @t3x-dev/yschema.
    yaml_review:
      title: Show validation before commit
      priority: must
      acceptance:
        - The review UI separates hard errors from readiness gaps.
  milestones:
    backend_contract:
      title: Land shared contract package
      sequence: 1
    ui_review:
      title: Wire review workflow
      sequence: 2
relations:
  - from: requirements/yaml_review
    type: depends_on
    to: requirements/contract_display
  - from: milestones/backend_contract
    type: precedes
    to: milestones/ui_review
`,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/yaml');

    const body = await res.text();
    expect(body).toContain('ready: true');
    expect(body).toContain('Reviewers can rerun validation after editing the YAML.');
    expect(body).toContain('assumed_provenance: true');
  });

  it('reports readiness gaps for incomplete edited PRD YAML', async () => {
    const res = await app.request('/v1/dev/yschema/prd-smoke/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'text/yaml' },
      body: `
candidate:
  summary:
    problem: Teams need schema-backed PRD review.
    outcome: Reviewers can rerun validation.
  requirements: {}
relations: []
`,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.validation.valid).toBe(true);
    expect(body.data.validation.ready).toBe(false);
    expect(body.data.validation.gaps).toContainEqual(
      expect.objectContaining({
        code: 'REQUIRED_SLOT_MISSING',
        path: 'summary/audience',
      })
    );
  });
});
