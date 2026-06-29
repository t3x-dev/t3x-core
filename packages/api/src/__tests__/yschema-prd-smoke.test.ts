import { Hono } from 'hono';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { yschemaPrdSmokeRoutes } from '../routes/yschema-prd-smoke.openapi';

interface SmokeDiffYaml {
  schema_name: string;
  diff_summary: {
    content_changes: Array<Record<string, unknown>>;
    validation_impact: {
      ready: { before: boolean; after: boolean; changed: boolean };
      valid: { before: boolean; after: boolean; changed: boolean };
      fixed_errors: Array<Record<string, unknown>>;
      new_errors: Array<Record<string, unknown>>;
      fixed_gaps: Array<Record<string, unknown>>;
      new_gaps: Array<Record<string, unknown>>;
    };
    counts: Record<string, unknown>;
  };
  before_validation: Record<string, unknown>;
  after_validation: Record<string, unknown>;
  tree_diff: Record<string, unknown>;
  validation_delta: Record<string, unknown>;
  markdown?: Record<string, string>;
}

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

  it('returns a schema-aware PRD diff as YAML', async () => {
    const res = await app.request('/v1/dev/yschema/prd-smoke/diff?format=yaml', {
      method: 'POST',
      headers: { 'Content-Type': 'text/yaml' },
      body: `
before:
  candidate:
    summary:
      problem: Teams need schema-backed PRD review before committing structured state.
      outcome: Reviewers can rerun validation.
    requirements:
      review_gate:
        title: Show validation before commit
        priority: must
        acceptance:
          - The review UI separates hard errors from readiness gaps.
  relations: []
after:
  candidate:
    summary:
      problem: Teams need schema-backed PRD review before committing structured state.
      audience: Product and engineering reviewers
      outcome: Reviewers can rerun validation after editing the YAML.
    requirements:
      schema_contract:
        title: Publish shared YSchema contracts
        priority: must
        acceptance:
          - P0 types are exported from @t3x-dev/yschema.
      review_gate:
        title: Show validation before commit
        priority: must
        acceptance:
          - The review UI separates hard errors from readiness gaps.
  relations:
    - from: requirements/review_gate
      type: depends_on
      to: requirements/schema_contract
`,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/yaml');

    const bodyText = await res.text();
    expect(bodyText.indexOf('diff_summary:')).toBeLessThan(bodyText.indexOf('before_validation:'));
    expect(bodyText.indexOf('content_changes:')).toBeLessThan(
      bodyText.indexOf('validation_impact:')
    );

    const body = yaml.load(bodyText) as SmokeDiffYaml;
    expect(body.schema_name).toBe('t3x/prd');
    expect(body.diff_summary.content_changes).toEqual([
      {
        kind: 'changed',
        path: 'summary/outcome',
        before: 'Reviewers can rerun validation.',
        after: 'Reviewers can rerun validation after editing the YAML.',
      },
      {
        kind: 'added',
        path: 'summary/audience',
        value: 'Product and engineering reviewers',
      },
      {
        kind: 'added_node',
        path: 'requirements/schema_contract',
      },
      {
        kind: 'added_relation',
        from: 'requirements/review_gate',
        to: 'requirements/schema_contract',
        relation_type: 'depends_on',
      },
    ]);
    expect(body.diff_summary.validation_impact).toMatchObject({
      ready: { before: false, after: true, changed: true },
      valid: { before: true, after: true, changed: false },
      fixed_gaps: [
        {
          code: 'REQUIRED_SLOT_MISSING',
          path: 'summary/audience',
        },
      ],
      new_gaps: [],
      fixed_errors: [],
      new_errors: [],
    });
    expect(body.diff_summary.counts).toMatchObject({
      content_changes: 4,
      nodes_added: 1,
      modified_nodes: 1,
      relations_added: 1,
      fixed_gaps: 1,
    });
    expect(body.tree_diff).toMatchObject({
      modified: [{ path: 'summary' }],
      onlyInTarget: ['requirements/schema_contract'],
      relationsAdded: [
        {
          from: 'requirements/review_gate',
          to: 'requirements/schema_contract',
          type: 'depends_on',
        },
      ],
    });
    expect(body.validation_delta).toMatchObject({
      fixed_gaps: [
        {
          code: 'REQUIRED_SLOT_MISSING',
          path: 'summary/audience',
        },
      ],
      ready_changed: true,
    });
    expect(body.markdown?.after).toContain('### Publish shared YSchema contracts');
  });

  it('can omit rendered Markdown from JSON PRD diff responses', async () => {
    const res = await app.request('/v1/dev/yschema/prd-smoke/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        render_markdown: false,
        before: {
          candidate: {
            summary: {
              problem: 'Teams need schema-backed PRD review.',
              audience: 'Product reviewers',
              outcome: 'Reviewers can rerun validation.',
            },
            requirements: {
              review_gate: {
                title: 'Show validation before commit',
                priority: 'must',
                acceptance: ['The review UI separates hard errors from readiness gaps.'],
              },
            },
          },
          relations: [],
        },
        after: {
          candidate: {
            summary: {
              problem: 'Teams need schema-backed PRD review.',
              audience: 'Product reviewers',
              outcome: 'Reviewers can rerun validation.',
            },
            requirements: {
              review_gate: {
                title: 'Show validation before commit',
                priority: 'critical',
                acceptance: 'The review UI separates hard errors from readiness gaps.',
              },
            },
          },
          relations: [],
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.markdown).toBeUndefined();
    expect(body.data.diff_summary.content_changes).toEqual([
      {
        kind: 'changed',
        path: 'requirements/review_gate/priority',
        before: 'must',
        after: 'critical',
      },
      {
        kind: 'changed',
        path: 'requirements/review_gate/acceptance',
        before: ['The review UI separates hard errors from readiness gaps.'],
        after: 'The review UI separates hard errors from readiness gaps.',
      },
    ]);
    expect(body.data.diff_summary.validation_impact).toMatchObject({
      ready: { before: true, after: false, changed: true },
      valid: { before: true, after: false, changed: true },
      fixed_errors: [],
      new_gaps: [],
    });
    expect(body.data.validation_delta.new_errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_ENUM' }),
        expect.objectContaining({ code: 'INVALID_TYPE' }),
      ])
    );
    expect(body.data.validation_delta.valid_changed).toBe(true);
  });

  it('rejects PRD diff requests without before and after snapshots', async () => {
    const res = await app.request('/v1/dev/yschema/prd-smoke/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        after: {
          candidate: {
            summary: {
              problem: 'Teams need schema-backed PRD review.',
            },
          },
          relations: [],
        },
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({
      success: false,
      error: {
        code: 'INVALID_YSCHEMA_PRD_SMOKE_REQUEST',
        message: 'before must be a mapping.',
      },
    });
  });
});
