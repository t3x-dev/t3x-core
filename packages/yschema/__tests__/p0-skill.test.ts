import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generatePromptContract, parseYSchema, t3xSkillP0Fixtures, validateTree } from '../src';

const schemaPath = fileURLToPath(new URL('../examples/t3x-skill.yschema.yaml', import.meta.url));

function acceptedEvidenceForLeaves(value: unknown, prefix = ''): Record<string, unknown[]> {
  if (value === null || value === undefined) return {};
  if (Array.isArray(value) || typeof value !== 'object') {
    return prefix
      ? {
          [prefix]: [{ origin: 'user_evidence', sourceId: `fixture:${prefix}` }],
        }
      : {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      Object.entries(acceptedEvidenceForLeaves(child, prefix ? `${prefix}/${key}` : key))
    )
  );
}

describe('t3x/skill P0 schema', () => {
  it('keeps the authoring YAML and normalized runtime fixture aligned', () => {
    const yaml = readFileSync(schemaPath, 'utf8');
    expect(parseYSchema(yaml)).toEqual(t3xSkillP0Fixtures.normalizedYSchema);
  });

  it('generates a generic prompt contract for Skill extraction', () => {
    const contract = generatePromptContract(t3xSkillP0Fixtures.normalizedYSchema);

    expect(contract.schemaName).toBe('t3x/skill');
    expect(contract.nodes.find((node) => node.path === 'instructions')).toMatchObject({
      repeated: true,
      required: true,
      requiredSlots: expect.arrayContaining(['body', 'freedom', 'success_criteria']),
    });
    expect(contract.nodes.find((node) => node.path === 'workflows')).toMatchObject({
      repeated: true,
      required: true,
      requiredSlots: expect.arrayContaining(['kind', 'when', 'on_failure']),
    });
    expect(contract.nodes.find((node) => node.path === 'checks')).toMatchObject({
      repeated: true,
      required: true,
      requiredSlots: expect.arrayContaining(['kind', 'run_when', 'blocking']),
    });
    expect(contract.relationTypes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'has_step', from: 'workflows/*' }),
        expect.objectContaining({ type: 'workflow_uses_resource', from: 'workflows/*' }),
        expect.objectContaining({ type: 'instruction_uses_resource', from: 'instructions/*' }),
        expect.objectContaining({ type: 'verifies', from: 'checks/*' }),
      ])
    );
  });

  it('accepts a complete, evidence-backed Skill candidate', () => {
    const candidate = t3xSkillP0Fixtures.validCandidateTree;
    const result = validateTree({
      schema: t3xSkillP0Fixtures.normalizedYSchema,
      tree: candidate,
      provenanceByPath: acceptedEvidenceForLeaves(candidate),
      relations: [...t3xSkillP0Fixtures.validRelations],
    });

    expect(result).toEqual({ valid: true, ready: true, errors: [], gaps: [], fixes: [] });
  });

  it('rejects unsafe resource paths and invalid skill names', () => {
    const candidate = structuredClone(t3xSkillP0Fixtures.validCandidateTree) as Record<
      string,
      unknown
    >;
    const manifest = candidate.manifest as Record<string, unknown>;
    const resources = candidate.resources as Record<string, Record<string, unknown>>;
    manifest.name = 'Review Code';
    resources.review_policy.path = '../secrets.txt';

    const result = validateTree({
      schema: t3xSkillP0Fixtures.normalizedYSchema,
      tree: candidate,
      provenanceByPath: acceptedEvidenceForLeaves(candidate),
    });

    expect(result.errors.map((error) => error.path)).toEqual(
      expect.arrayContaining(['manifest/name', 'resources/review_policy/path'])
    );
  });
});
