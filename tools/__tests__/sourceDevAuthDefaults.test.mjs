import test from 'node:test';
import assert from 'node:assert/strict';

import { applySourceDevDefaults, getDevTargetFilter } from '../lib/sourceDevAuthDefaults.mjs';

test('applySourceDevDefaults sets AUTH_DISABLED only when unset', () => {
  const env = { PATH: '/usr/bin' };

  const result = applySourceDevDefaults('api', env);

  assert.deepEqual(result, { PATH: '/usr/bin', AUTH_DISABLED: 'true' });
  assert.deepEqual(env, { PATH: '/usr/bin' });
});

test('applySourceDevDefaults preserves explicit AUTH_DISABLED values', () => {
  const env = { AUTH_DISABLED: 'false', PATH: '/usr/bin' };

  const result = applySourceDevDefaults('api', env);

  assert.deepEqual(result, env);
  assert.notStrictEqual(result, env);
});

test('applySourceDevDefaults adds the local API URL for webui when unset', () => {
  const env = { PATH: '/usr/bin' };

  const result = applySourceDevDefaults('webui', env);

  assert.deepEqual(result, {
    PATH: '/usr/bin',
    AUTH_DISABLED: 'true',
    NEXT_PUBLIC_API_URL: 'http://localhost:8000',
  });
});

test('applySourceDevDefaults preserves explicit webui API URL values', () => {
  const env = {
    AUTH_DISABLED: 'false',
    NEXT_PUBLIC_API_URL: 'https://api.example.com',
    PATH: '/usr/bin',
  };

  const result = applySourceDevDefaults('webui', env);

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
