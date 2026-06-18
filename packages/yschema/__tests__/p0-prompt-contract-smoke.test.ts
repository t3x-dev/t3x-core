import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { expectedPromptContract } from '../__fixtures__/t3x-prd';
import { generatePromptContract, parseYSchema } from '../src/index';

const referenceYSchemaPath = fileURLToPath(
  new URL('../__fixtures__/t3x-prd/reference.yschema.yaml', import.meta.url)
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
});
