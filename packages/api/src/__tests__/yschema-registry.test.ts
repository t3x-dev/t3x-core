import { describe, expect, it } from 'vitest';
import {
  canonicalSchemaNameFromBinding,
  resolveBuiltInYSchema,
  schemaRootKeyFromBinding,
  schemaVersionFromBinding,
} from '../lib/yschema-registry';

describe('YSchema registry bindings', () => {
  it('resolves registered current versions exactly', () => {
    expect(resolveBuiltInYSchema('t3x/prd', 'v2')?.version).toBe('v2');
    expect(resolveBuiltInYSchema('t3x/prompt', 'v1')?.version).toBe('v1');
    expect(resolveBuiltInYSchema('t3x/skill', 'v1')?.version).toBe('v1');
  });

  it('rejects a binding version that is not registered', () => {
    expect(resolveBuiltInYSchema('t3x/prd', 'v1')).toBeNull();
    expect(resolveBuiltInYSchema('t3x/prompt', 'v2')).toBeNull();
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

  it('recognizes the legacy Prompt Schema display name', () => {
    expect(canonicalSchemaNameFromBinding({ schemaName: 'Prompt Schema' })).toBe('t3x/prompt');
  });
});

it('keeps stable explicit roots and supports existing Studio bindings without hash-shaped node keys', () => {
  expect(schemaRootKeyFromBinding({ canonicalName: 'studio:sha256:abc' })).toBe('candidate');
  expect(schemaRootKeyFromBinding({ canonicalName: 'studio:sha256:def', rootKey: 'prd' })).toBe(
    'prd'
  );
  expect(
    schemaRootKeyFromBinding({ canonicalName: 'studio:sha256:abc', rootKey: '../invalid' })
  ).toBe('candidate');
  expect(schemaRootKeyFromBinding({ canonicalName: 't3x/esphome-device' })).toBe('device');
});
