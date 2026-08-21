import { describe, expect, it } from 'vitest';
import {
  compileYSchemaCompositionV2,
  type YSchemaCompositionDraftV2,
  type YSchemaModuleArtifactV2,
} from '../src';

function moduleArtifact(
  name: string,
  path: string,
  options: Partial<YSchemaModuleArtifactV2> = {}
): YSchemaModuleArtifactV2 {
  return {
    apiVersion: 't3x.dev/yschema-module/v2',
    canonicalName: name,
    version: '1.0.0',
    title: name,
    description: name,
    status: 'active',
    source: 'official',
    tags: [],
    compatibility: { yschema: ['0.1'] },
    provides: [],
    imports: [],
    contribution: {
      nodes: {
        [path]: { slots: { title: { type: 'string' } } },
      },
    },
    ...options,
  };
}

function composition(...modules: YSchemaModuleArtifactV2[]): YSchemaCompositionDraftV2 {
  return {
    apiVersion: 't3x.dev/yschema-composition/v2',
    id: 'open-composition',
    revision: 1,
    status: 'draft',
    modules: modules.map((module, index) => ({
      canonicalName: module.canonicalName,
      version: module.version,
      presentationOrder: (index + 1) * 10,
    })),
  };
}

describe('YSchema Composition v2', () => {
  it('compiles one Module without a Core or family', async () => {
    const frontend = moduleArtifact('t3x/frontend', 'frontend');
    const result = await compileYSchemaCompositionV2({
      composition: composition(frontend),
      modules: [frontend],
    });

    expect(result.report).toMatchObject({ valid: true, mode: 'open', issues: [] });
    expect(result.schema.nodes.frontend).toBeDefined();
    expect(result.originsByPath.frontend?.artifact).toBe('t3x/frontend');
  });

  it('does not use mixed discovery tags as compatibility boundaries', async () => {
    const prd = moduleArtifact('t3x/requirements', 'requirements', {
      tags: ['type:prd', 'domain:product'],
    });
    const skill = moduleArtifact('t3x/workflow', 'workflow', {
      tags: ['type:skill', 'runtime:agent'],
    });
    const result = await compileYSchemaCompositionV2({
      composition: composition(prd, skill),
      modules: [prd, skill],
    });

    expect(result.report.valid).toBe(true);
    expect(Object.keys(result.schema.nodes)).toEqual(['requirements', 'workflow']);
  });

  it('keeps semantic output stable when presentation order changes', async () => {
    const first = moduleArtifact('t3x/first', 'first');
    const second = moduleArtifact('t3x/second', 'second');
    const original = composition(first, second);
    const reversed = {
      ...original,
      modules: original.modules.map((reference) => ({
        ...reference,
        presentationOrder: reference.presentationOrder === 10 ? 20 : 10,
      })),
    };
    const [left, right] = await Promise.all([
      compileYSchemaCompositionV2({ composition: original, modules: [first, second] }),
      compileYSchemaCompositionV2({ composition: reversed, modules: [second, first] }),
    ]);

    expect(left.compiledSchemaHash).toBe(right.compiledSchemaHash);
    expect(left.compositionHash).not.toBe(right.compositionHash);
    expect(left.renderPlan.map((entry) => entry.artifact)).toEqual(['t3x/first', 't3x/second']);
    expect(right.renderPlan.map((entry) => entry.artifact)).toEqual(['t3x/second', 't3x/first']);
  });

  it('blocks structural ownership conflicts instead of using order as override', async () => {
    const first = moduleArtifact('t3x/first', 'shared');
    const second = moduleArtifact('t3x/second', 'shared');
    const result = await compileYSchemaCompositionV2({
      composition: composition(first, second),
      modules: [first, second],
    });

    expect(result.report.valid).toBe(false);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ code: 'PATH_OWNERSHIP_CONFLICT', path: 'shared' })
    );
  });

  it('limits hard imports to explicit capability contracts', async () => {
    const bridge = moduleArtifact('t3x/bridge', 'traceability', {
      imports: [
        {
          capability: 't3x.frontend.pages',
          version: 1,
          mode: 'required',
        },
      ],
    });
    const missing = await compileYSchemaCompositionV2({
      composition: composition(bridge),
      modules: [bridge],
    });
    expect(missing.report.issues).toContainEqual(
      expect.objectContaining({ code: 'REQUIRED_IMPORT_MISSING' })
    );

    const frontend = moduleArtifact('t3x/frontend', 'frontend', {
      provides: [{ capability: 't3x.frontend.pages', version: 1 }],
    });
    const resolved = await compileYSchemaCompositionV2({
      composition: composition(frontend, bridge),
      modules: [frontend, bridge],
    });
    expect(resolved.report.valid).toBe(true);

    const pinnedBridge = {
      ...bridge,
      imports: [{ ...bridge.imports[0], provider: 'company/frontend' }],
    };
    const wrongProvider = await compileYSchemaCompositionV2({
      composition: composition(frontend, pinnedBridge),
      modules: [frontend, pinnedBridge],
    });
    expect(wrongProvider.report.issues).toContainEqual(
      expect.objectContaining({ code: 'REQUIRED_IMPORT_MISSING' })
    );
  });

  it('derives governed mode and strictness from policies rather than the core tag', async () => {
    const policy = moduleArtifact('company/product-policy', 'foundation', {
      tags: ['domain:security'],
      contribution: {
        policies: [
          {
            id: 'company.require-requirements',
            requireCapabilities: ['t3x.requirements.items'],
          },
        ],
      },
    });
    const result = await compileYSchemaCompositionV2({
      composition: composition(policy),
      modules: [policy],
    });
    expect(result.report.mode).toBe('governed');
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ code: 'POLICY_REQUIRED_CAPABILITY_MISSING' })
    );

    const taggedCore = moduleArtifact('t3x/tagged-core', 'tagged_core', { tags: ['role:core'] });
    const open = await compileYSchemaCompositionV2({
      composition: composition(taggedCore),
      modules: [taggedCore],
    });
    expect(open.report.mode).toBe('open');
  });
});
