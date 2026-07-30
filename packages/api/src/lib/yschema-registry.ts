import {
  t3xPrdP0Fixtures,
  t3xPromptP0Fixtures,
  t3xSkillP0Fixtures,
  type YSchema,
} from '@t3x-dev/yschema';

const BUILT_IN_SCHEMAS = new Map<string, YSchema>([
  ['t3x/prd', t3xPrdP0Fixtures.normalizedYSchema],
  ['t3x/prompt', t3xPromptP0Fixtures.normalizedYSchema],
  ['t3x/skill', t3xSkillP0Fixtures.normalizedYSchema],
]);

export function resolveBuiltInYSchema(name: string, version?: string): YSchema | null {
  const schema = BUILT_IN_SCHEMAS.get(name.trim().toLowerCase()) ?? null;
  if (!schema || (version !== undefined && version !== schema.version)) return null;
  return schema;
}

export function canonicalSchemaNameFromBinding(binding: unknown): string | null {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) return null;
  const record = binding as Record<string, unknown>;
  if (typeof record.canonicalName === 'string' && record.canonicalName.trim()) {
    return record.canonicalName.trim().toLowerCase();
  }

  const displayName = typeof record.schemaName === 'string' ? record.schemaName : '';
  if (/prompt/i.test(displayName)) return 't3x/prompt';
  if (/skill/i.test(displayName)) return 't3x/skill';
  if (/prd/i.test(displayName)) return 't3x/prd';
  return null;
}

export function schemaVersionFromBinding(binding: unknown): string | undefined {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) return undefined;
  const version = (binding as Record<string, unknown>).version;
  return typeof version === 'string' && version.trim() ? version.trim() : undefined;
}

export function schemaRootKeyFromBinding(binding: unknown): string {
  const canonicalName = canonicalSchemaNameFromBinding(binding);
  if (canonicalName) return canonicalName.split('/').at(-1) ?? 'candidate';

  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) return 'candidate';
  const schemaName = String((binding as Record<string, unknown>).schemaName ?? 'Candidate');
  return schemaName
    .replace(/\s+Schema$/i, '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}
