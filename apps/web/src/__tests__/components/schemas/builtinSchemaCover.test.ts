import { expect, it } from 'vitest';
import { builtinSchemaCover } from '@/components/schemas/builtinSchemaCover';

it('limits editorial artwork to built-in sources, including name collisions', () => {
  expect(builtinSchemaCover('t3x/compose-services')).toBe('/schema-covers/compose.jpg');
  expect(builtinSchemaCover('t3x/compose-services', 'author-project')).toBeUndefined();
  expect(builtinSchemaCover('team/custom')).toBeUndefined();
  expect(builtinSchemaCover('toString')).toBeUndefined();
});
