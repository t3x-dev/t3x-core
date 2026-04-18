import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applySourceDevAuthDefault,
  getDevTargetFilter,
} from '../lib/sourceDevAuthDefaults.mjs';

test('applySourceDevAuthDefault sets AUTH_DISABLED only when unset', () => {
  const env = { PATH: '/usr/bin' };

  const result = applySourceDevAuthDefault(env);

  assert.deepEqual(result, { PATH: '/usr/bin', AUTH_DISABLED: 'true' });
  assert.deepEqual(env, { PATH: '/usr/bin' });
});

test('applySourceDevAuthDefault preserves explicit AUTH_DISABLED values', () => {
  const env = { AUTH_DISABLED: 'false', PATH: '/usr/bin' };

  const result = applySourceDevAuthDefault(env);

  assert.deepEqual(result, env);
  assert.notStrictEqual(result, env);
});

test('getDevTargetFilter maps known dev targets', () => {
  assert.equal(getDevTargetFilter('api'), 't3x-api-server');
  assert.equal(getDevTargetFilter('webui'), 't3x-webui');
});

test('getDevTargetFilter rejects unknown dev targets', () => {
  assert.throws(() => getDevTargetFilter('worker'), /Unknown dev target/);
});
