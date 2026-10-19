import { expect, it } from 'vitest';
import { SchemaContentMigrationCommandSchema } from '../schema-studio';

it('preserves recursive JSON validation for OpenAPI-compatible migration values', () => {
  for (const value of [null, true, 1, 'text', [], { nested: [{ value: null }] }]) {
    expect(
      SchemaContentMigrationCommandSchema.parse({ kind: 'set', path: 'value', value })
    ).toEqual({ kind: 'set', path: 'value', value });
  }
  for (const value of [{ nested: undefined }, { nested: () => true }, [NaN]]) {
    expect(
      SchemaContentMigrationCommandSchema.safeParse({ kind: 'set', path: 'value', value }).success
    ).toBe(false);
  }
});
