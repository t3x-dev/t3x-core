import { expect, it } from 'vitest';
import { compareDocuments } from '../lib/document-diff';

it('preserves types, nulls, missing keys, positional arrays and literal pointer tokens', () => {
  const before = { nested: { 'a/b~c': [null, 2] }, removed: null };
  const after = { added: null, nested: { 'a/b~c': [false, '2', null] } };
  expect(compareDocuments(before, after)).toEqual({
    stats: { added: 2, removed: 1, modified: 2 },
    changes: [
      { type: 'added', path: '/added', new_value: null },
      { type: 'modified', path: '/nested/a~1b~0c/0', old_value: null, new_value: false },
      { type: 'modified', path: '/nested/a~1b~0c/1', old_value: 2, new_value: '2' },
      { type: 'added', path: '/nested/a~1b~0c/2', new_value: null },
      { type: 'removed', path: '/removed', old_value: null },
    ],
  });
  expect(compareDocuments(null, []).changes).toEqual([
    { type: 'modified', path: '', old_value: null, new_value: [] },
  ]);
});
