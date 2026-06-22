import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  candidateWithRelations,
  expectedPromptContract,
  expectedReadyValidationResult,
} from '../__fixtures__/t3x-prd';
import { generatePromptContract, parseYSchema, validateTree } from '../src/index';

const referenceYSchemaPath = fileURLToPath(
  new URL('../__fixtures__/t3x-prd/reference.yschema.yaml', import.meta.url)
);
const exampleYSchemaPath = fileURLToPath(
  new URL('../examples/t3x-prd.yschema.yaml', import.meta.url)
);

describe('PromptContract public API smoke test', () => {
  it('parses the reference YSchema YAML and generates the canonical prompt contract', () => {
    const schema = parseYSchema(readFileSync(referenceYSchemaPath, 'utf8'));
    const contract = generatePromptContract(schema);

    expect(contract).toEqual(expectedPromptContract);
    expect(contract.nodes.map((node) => node.path)).toEqual([
      'summary',
      'requirements',
      'milestones',
    ]);
    expect(contract.relationTypes?.map((relationType) => relationType.type)).toEqual([
      'depends_on',
      'precedes',
    ]);
  });

  it('publishes t3x/prd as a package example equivalent to the fixture contract', () => {
    const fixtureSchema = parseYSchema(readFileSync(referenceYSchemaPath, 'utf8'));
    const exampleSchema = parseYSchema(readFileSync(exampleYSchemaPath, 'utf8'));

    expect(exampleSchema).toEqual(fixtureSchema);
    expect(generatePromptContract(exampleSchema)).toEqual(expectedPromptContract);
  });

  it('validates a ready PRD candidate against the published package example', () => {
    const schema = parseYSchema(readFileSync(exampleYSchemaPath, 'utf8'));
    const provenanceByPath = Object.fromEntries(
      [
        'summary/problem',
        'summary/audience',
        'summary/outcome',
        'requirements/schema_contract/title',
        'requirements/schema_contract/acceptance',
        'requirements/review_gate/title',
        'requirements/review_gate/acceptance',
        'milestones/contract_first/title',
        'milestones/workflow_second/title',
      ].map((path) => [path, [{ origin: 'user_evidence' as const, sourceId: `source:${path}` }]])
    );

    expect(
      validateTree({
        schema,
        tree: candidateWithRelations.tree,
        relations: [...candidateWithRelations.relations],
        provenanceByPath,
      })
    ).toEqual(expectedReadyValidationResult);
  });
});
