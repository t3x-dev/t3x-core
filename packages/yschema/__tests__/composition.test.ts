import { describe, expect, it } from 'vitest';
import {
  builtInEsphomeDeviceCoreArtifact,
  builtInEsphomeDeviceModules,
  builtInPrdCoreArtifact,
  builtInPrdModules,
  builtInPromptCoreArtifact,
  builtInPromptModules,
  builtInSkillCoreArtifact,
  builtInSkillModules,
  compileYSchemaComposition,
  defaultPrdCompositionModuleOrder,
  type YSchemaCompositionDraft,
  type YSchemaModuleManifest,
} from '../src';

function createComposition(order = [...defaultPrdCompositionModuleOrder]): YSchemaCompositionDraft {
  return {
    apiVersion: 't3x.dev/yschema-composition/v1',
    id: 'prd-full-stack',
    revision: 1,
    family: 'prd',
    status: 'draft',
    core: {
      canonicalName: builtInPrdCoreArtifact.canonicalName,
      version: builtInPrdCoreArtifact.version,
    },
    modules: order.map((canonicalName, index) => ({
      canonicalName,
      version: '1.0.0',
      order: index + 1,
    })),
  };
}

describe('compileYSchemaComposition', () => {
  it('compiles the same composition deterministically and records origins', async () => {
    const composition = createComposition();
    const first = await compileYSchemaComposition({
      composition,
      core: builtInPrdCoreArtifact,
      modules: builtInPrdModules,
    });
    const second = await compileYSchemaComposition({
      composition,
      core: builtInPrdCoreArtifact,
      modules: builtInPrdModules,
    });

    expect(first.report).toEqual({ valid: true, issues: [] });
    expect(Object.keys(first.schema.nodes)).toEqual([
      'summary',
      'requirements',
      'milestones',
      'system_architecture',
      'technology_stack',
      'frontend_design',
      'backend_design',
      'database_design',
      'api_contract',
    ]);
    expect(first.renderPlan.map((entry) => entry.artifact)).toEqual([
      builtInPrdCoreArtifact.canonicalName,
      ...defaultPrdCompositionModuleOrder,
    ]);
    expect(first.originsByPath['database_design/entities']).toEqual({
      artifact: 't3x/prd-database-design',
      version: '1.0.0',
      kind: 'module',
    });
    expect(first.compiledSchemaHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.compiledSchemaHash).toBe(second.compiledSchemaHash);
    expect(first.compositionHash).toBe(second.compositionHash);
  });

  it('keeps schema identity stable but rejects dependency-breaking order', async () => {
    const reordered = createComposition([
      't3x/prd-system-architecture',
      't3x/prd-technology-stack',
      't3x/prd-frontend-design',
      't3x/prd-database-design',
      't3x/prd-backend-design',
      't3x/prd-api-contract',
    ]);
    const baseline = await compileYSchemaComposition({
      composition: createComposition(),
      core: builtInPrdCoreArtifact,
      modules: builtInPrdModules,
    });
    const result = await compileYSchemaComposition({
      composition: reordered,
      core: builtInPrdCoreArtifact,
      modules: builtInPrdModules,
    });

    expect(result.report.valid).toBe(false);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({
        code: 'PROVIDER_AFTER_CONSUMER',
        module: 't3x/prd-database-design@1.0.0',
      })
    );
    expect(result.compiledSchemaHash).toBe(baseline.compiledSchemaHash);
    expect(result.compositionHash).not.toBe(baseline.compositionHash);
  });

  it('never allows a module to replace a Core-owned path', async () => {
    const source = builtInPrdModules[0]!;
    const conflicting: YSchemaModuleManifest = {
      ...source,
      canonicalName: 'example/conflicting-summary',
      provides: ['conflicting-summary'],
      requires: ['document-root'],
      contribution: {
        nodes: {
          summary: {
            description: 'Must not replace the Core summary contract.',
          },
        },
      },
    };
    const composition = createComposition(['example/conflicting-summary']);
    const result = await compileYSchemaComposition({
      composition,
      core: builtInPrdCoreArtifact,
      modules: [conflicting],
    });

    expect(result.report.valid).toBe(false);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ code: 'PATH_OWNERSHIP_CONFLICT', path: 'summary' })
    );
    expect(result.schema.nodes.summary).toEqual(builtInPrdCoreArtifact.schema.nodes.summary);
  });

  it('compiles each official Core with only compatible Family Modules', async () => {
    const families = [
      { core: builtInSkillCoreArtifact, modules: builtInSkillModules },
      { core: builtInPromptCoreArtifact, modules: builtInPromptModules },
      { core: builtInEsphomeDeviceCoreArtifact, modules: builtInEsphomeDeviceModules },
    ];

    for (const { core, modules } of families) {
      const composition: YSchemaCompositionDraft = {
        apiVersion: 't3x.dev/yschema-composition/v1',
        id: `${core.family}-official`,
        revision: 1,
        family: core.family,
        status: 'draft',
        core: { canonicalName: core.canonicalName, version: core.version },
        modules: modules.map((module, index) => ({
          canonicalName: module.canonicalName,
          version: module.version,
          order: index + 1,
        })),
      };
      const result = await compileYSchemaComposition({ composition, core, modules });

      expect(result.report, core.family).toEqual({ valid: true, issues: [] });
      expect(result.renderPlan[0]?.artifact).toBe(core.canonicalName);
      expect(result.renderPlan.slice(1).map((entry) => entry.artifact)).toEqual(
        modules.map((module) => module.canonicalName)
      );
    }
  });
});
