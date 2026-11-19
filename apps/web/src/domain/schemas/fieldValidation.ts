import { SchemaJsonValueSchema, StudioSampleValueSchema } from '@t3x-dev/api-client';
import type { YValue } from '@t3x-dev/yops';
import { normalizeYSchemaObject, validateTree } from '@t3x-dev/yschema';
import type { SchemaDefinition } from './schemaFieldEditing';

export const fieldConstraintLabels: Record<string, string> = {
  enum: 'Allowed values',
  const: 'Value =',
  minimum: 'Number ≥',
  maximum: 'Number ≤',
  minLength: 'Length ≥',
  maxLength: 'Length ≤',
  maxWords: 'Words ≤',
  pattern: 'Matches pattern',
};

export function fieldConstraintCount(definition: SchemaDefinition) {
  return Object.keys(fieldConstraintLabels).filter((key) => definition[key] !== undefined).length;
}

export function schemaDefinitionError(definition: SchemaDefinition): string | undefined {
  try {
    normalizeYSchemaObject(definition);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid Schema definition.';
  }
}

export type FieldTestInputKind = 'text' | 'number' | 'boolean' | 'json' | 'null' | 'missing';
export function parseFieldTestValue(kind: FieldTestInputKind, text: string): YValue | undefined {
  if (kind === 'missing') return undefined;
  if (kind === 'null') return null;
  const value: unknown = kind === 'text' ? text : JSON.parse(text);
  if (kind === 'number' && (typeof value !== 'number' || !Number.isFinite(value)))
    throw new Error('Enter a finite number.');
  if (kind === 'boolean' && typeof value !== 'boolean') throw new Error('Choose true or false.');
  const sample = StudioSampleValueSchema.safeParse({ value });
  if (!sample.success) throw new Error(sample.error.issues[0].message);
  const json = SchemaJsonValueSchema.safeParse(value);
  if (!json.success) throw new Error(json.error.issues[0].message);
  return json.data as YValue;
}

/** A local one-field probe uses the public validator; context checks stay in Workspace. */
export function testSchemaFieldValue(
  definition: SchemaDefinition,
  required: boolean,
  path: string,
  value: YValue | undefined
) {
  const schema = normalizeYSchemaObject({
    yschema: '0.1',
    name: 'Field value test',
    nodes: { probe: { slots: { value: definition }, requiredSlots: required ? ['value'] : [] } },
  });
  const result = validateTree({ schema, tree: { probe: value === undefined ? {} : { value } } });
  const contextGaps = result.gaps.filter((gap) => gap.code === 'REQUIRED_EVIDENCE_MISSING');
  const issues = [
    ...result.errors,
    ...result.gaps.filter((gap) => gap.code !== 'REQUIRED_EVIDENCE_MISSING'),
  ].map((issue) => ({
    code: issue.code,
    path,
    message: issue.message.replaceAll('probe/value', path),
  }));
  return { passed: issues.length === 0, issues, needsEvidence: contextGaps.length > 0 };
}
