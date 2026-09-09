import { readFileSync } from 'node:fs';
import type { YValue } from '@t3x-dev/yops';
import { compileYSchemaCompositionV2, validateTree } from '@t3x-dev/yschema';
import { expect, it } from 'vitest';
import { schemaEcosystemStarters } from '../lib/schema-ecosystem-starters';

it.each(
  schemaEcosystemStarters
)('$canonicalName compiles and validates its original sample, but rejects missing required structure', async (module) => {
  const result = await compileYSchemaCompositionV2({
    composition: {
      apiVersion: 't3x.dev/yschema-composition/v2',
      id: 'starter-check',
      revision: 1,
      status: 'draft',
      modules: [
        { canonicalName: module.canonicalName, version: module.version, presentationOrder: 10 },
      ],
    },
    modules: [module],
  });
  expect(result.report.valid, JSON.stringify(result.report)).toBe(true);
  const valid = validateTree({ schema: result.schema, tree: module.starter as YValue });
  expect(valid.errors).toEqual([]);
  expect(valid.gaps).toEqual([]);
  const slug = module.canonicalName.split('/')[1];
  const project = JSON.parse(
    readFileSync(
      new URL(`../../../../examples/official-projects/${slug}/project.json`, import.meta.url),
      'utf8'
    )
  );
  expect(project.companionSchema).toEqual({
    canonicalName: module.canonicalName,
    version: module.version,
  });
  expect(project.initial).toEqual(module.starter);
  const revised = validateTree({ schema: result.schema, tree: project.demonstration.value });
  expect(revised.errors).toEqual([]);
  expect(revised.gaps).toEqual([]);
  const invalid = validateTree({ schema: result.schema, tree: {} });
  expect(invalid.errors.length + invalid.gaps.length).toBeGreaterThan(0);
});
it('keeps tags open and makes no external execution claim', () => {
  for (const module of schemaEcosystemStarters) {
    expect(module.license).toBe('Apache-2.0');
    expect(module.provides.every((item) => item.capability.startsWith('t3x.starter.'))).toBe(true);
  }
  expect(schemaEcosystemStarters[2]?.readme).toContain('does not validate port syntax');
});
