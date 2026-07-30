import { describe, expect, it } from 'vitest';
import {
  canonicalSchemaNameFromBinding,
  resolveBuiltInYSchema,
  schemaVersionFromBinding,
} from '../lib/yschema-registry';

describe('YSchema registry bindings', () => {
  it('resolves registered current versions exactly', () => {
    expect(resolveBuiltInYSchema('t3x/prd', 'v2')?.version).toBe('v2');
    expect(resolveBuiltInYSchema('t3x/skill', 'v1')?.version).toBe('v1');
  });

  it('rejects a binding version that is not registered', () => {
    expect(resolveBuiltInYSchema('t3x/prd', 'v1')).toBeNull();
    expect(resolveBuiltInYSchema('t3x/skill', 'v2')).toBeNull();
  });

  it('reads canonical names and versions from Workspace bindings', () => {
    const binding = {
      canonicalName: 'T3X/SKILL',
      schemaName: 'Skill Schema',
      version: 'v1',
    };

    expect(canonicalSchemaNameFromBinding(binding)).toBe('t3x/skill');
    expect(schemaVersionFromBinding(binding)).toBe('v1');
  });
});
