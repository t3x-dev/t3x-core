import { createYOpsState } from '@t3x-dev/core';
import { type CommitV2, describeProtocolObject, type ProtocolValue } from '@t3x-dev/transition';
import { JSON_SCHEMA, load } from 'js-yaml';
import { expect, it } from 'vitest';
import {
  createStateRendererRegistry,
  type ResolvedRenderBinding,
  type StateRendererRegistration,
} from './registry';

function fixture(value: ProtocolValue = { z: '2026-09-05', a: { 'a/b~c': [false, null, 2] } }) {
  const state = createYOpsState(value);
  const commit: CommitV2 = {
    schema: 't3x/commit/v2',
    parents: [],
    decision: { kind: 'statement', schema: 't3x/statement/v1', digest: `sha256:${'a'.repeat(64)}` },
    result: describeProtocolObject(state),
  };
  return { state, commit, commitDigest: describeProtocolObject(commit).digest };
}
function binding(input = fixture()): ResolvedRenderBinding {
  return {
    stateDigest: input.commit.result.digest,
    identity: 'team/evaluation',
    version: '1.0.0',
    hash: `sha256:${'b'.repeat(64)}`,
    family: 'evaluation',
    capabilities: [{ name: 'cases', version: 1 }],
  };
}
function adapter(
  key = 'test.exact',
  options: Partial<StateRendererRegistration> = {}
): StateRendererRegistration {
  return {
    key,
    version: 1,
    priority: 0,
    matchers: [{ kind: 'exact', identity: 'team/evaluation', versions: ['1.0.0'] }],
    modelSchema: 'test.model/v1',
    render: (ctx) => ({ content: ctx.value }),
    acceptsModel: (model) => model !== null && typeof model === 'object' && 'content' in model,
    ...options,
  };
}

it.each([
  null,
  true,
  'yes',
  42,
  [],
  { modules: { imaginary: 1 }, tags: ['renderer:admin'] },
])('preserves every generic root without inferring modules: %j', (value) => {
  const result = createStateRendererRegistry([]).render(fixture(value));
  expect(result.model).toEqual({ value });
  expect(JSON.parse(result.recovery.json)).toEqual(value);
  expect(load(result.recovery.yaml, { schema: JSON_SCHEMA })).toEqual(value);
  expect(result.status).toEqual({
    state: 'loaded',
    schema: 'unbound',
    renderer: 'fallback',
    validation: 'not-run',
  });
});
it('ranks exact, family, capability, then generic independently of registration order', () => {
  const exact = adapter();
  const family = adapter('test.family', {
    priority: 100,
    matchers: [{ kind: 'family', family: 'evaluation' }],
  });
  const capability = adapter('test.capability', {
    priority: 999,
    matchers: [{ kind: 'capability', name: 'cases', version: 1 }],
  });
  for (const entries of [
    [capability, family, exact],
    [exact, family, capability],
  ]) {
    expect(
      createStateRendererRegistry(entries).render({ ...fixture(), binding: binding() }).renderer.key
    ).toBe(exact.key);
  }
  expect(
    createStateRendererRegistry([family, capability]).render({ ...fixture(), binding: binding() })
      .renderer.key
  ).toBe(family.key);
  expect(
    createStateRendererRegistry([capability]).render({ ...fixture(), binding: binding() }).renderer
      .key
  ).toBe(capability.key);
  expect(
    createStateRendererRegistry([exact]).render({
      ...fixture(),
      binding: { ...binding(), version: '2.0.0' },
    }).status.renderer
  ).toBe('fallback');
});
it('breaks equal priorities lexically and snapshots mutable registrations', () => {
  const registration = adapter('test.a');
  const registry = createStateRendererRegistry([adapter('test.z'), registration]);
  registration.matchers.length = 0;
  registration.priority = -100;
  const input = { ...fixture(), binding: binding() };
  expect(registry.render(input).renderer.key).toBe('test.a');
  expect(JSON.stringify(registry.render(input))).toBe(JSON.stringify(registry.render(input)));
});
it('rejects duplicates, reserved fallback keys and invalid versions', () => {
  expect(() => createStateRendererRegistry([adapter(), adapter()])).toThrow('duplicate');
  expect(() => createStateRendererRegistry([adapter('t3x.generic')])).toThrow();
  expect(() => createStateRendererRegistry([adapter('test', { version: 0 })])).toThrow();
});
it('honors a compatible declared renderer and rejects missing or incompatible declarations', () => {
  const registry = createStateRendererRegistry([adapter(), adapter('test.other')]);
  const input = {
    ...fixture(),
    binding: { ...binding(), defaultRenderer: { key: 'test.other', version: 1 } },
  };
  expect(registry.render(input).renderer.key).toBe('test.other');
  for (const declared of [
    { key: 'missing', version: 1 },
    { key: 'test.other', version: 2 },
  ]) {
    expect(() =>
      registry.render({ ...input, binding: { ...binding(), defaultRenderer: declared } })
    ).toThrow('unavailable or incompatible');
  }
});
it('fails closed for altered State, stale commit, schema binding and validation evidence', () => {
  const registry = createStateRendererRegistry([]);
  const input = fixture();
  expect(() => registry.render({ ...input, state: createYOpsState({ changed: true }) })).toThrow();
  expect(() => registry.render({ ...input, commitDigest: `sha256:${'c'.repeat(64)}` })).toThrow();
  expect(() =>
    registry.render({ ...input, binding: { ...binding(), stateDigest: 'stale' } })
  ).toThrow('another State');
  expect(() =>
    registry.render({ ...input, validation: { stateDigest: 'stale', verdict: 'passed' } })
  ).toThrow('another State');
  expect(() => registry.render({ ...input, binding: { ...binding(), hash: 'latest' } })).toThrow(
    'immutable'
  );
  expect(() =>
    registry.render({ ...input, binding: binding(), schemaResolution: 'unavailable' })
  ).toThrow();
});
it('does not equate unavailable schema, selected rendering, and validation success', () => {
  const registry = createStateRendererRegistry([adapter()]);
  expect(registry.render({ ...fixture(), schemaResolution: 'unavailable' }).status).toMatchObject({
    schema: 'unavailable',
    renderer: 'fallback',
    validation: 'not-run',
  });
  expect(registry.render({ ...fixture(), binding: binding() }).status.validation).toBe('not-run');
});
it('does not let tags or definition-shaped field names select a renderer', () => {
  const result = createStateRendererRegistry([adapter()]).render(
    fixture({ family: 'evaluation', tags: ['test.exact'], modules: {} })
  );
  expect(result.renderer.key).toBe('t3x.generic');
});
it('keeps a historical selection and its caller inputs intact', () => {
  const input = fixture();
  const registry = createStateRendererRegistry([adapter()]);
  const before = registry.render({ ...input, binding: binding() });
  registry.render(fixture({ newHead: true }));
  expect(registry.render({ ...input, binding: binding() })).toEqual(before);
  expect(Object.isFrozen(input.state.value)).toBe(false);
});
it('rejects bad models and prevents adapters mutating their context', () => {
  const input = { ...fixture(), binding: binding() };
  expect(() =>
    createStateRendererRegistry([adapter('bad', { render: () => 'bad' })]).render(input)
  ).toThrow('Invalid renderer model');
  expect(() =>
    createStateRendererRegistry([
      adapter('mutating', {
        render: (ctx) => {
          ctx.binding!.version = '2.0.0';
          return {};
        },
      }),
    ]).render(input)
  ).toThrow();
  expect(input.binding.version).toBe('1.0.0');
});

it('binds validation to both immutable State and schema, preserving failed verdicts', () => {
  const registry = createStateRendererRegistry([]);
  const input = { ...fixture(), binding: binding() };
  const validation = {
    stateDigest: input.commit.result.digest,
    schemaHash: input.binding.hash,
    verdict: 'failed' as const,
  };
  expect(registry.render({ ...input, validation }).status.validation).toBe('failed');
  expect(() =>
    registry.render({ ...input, validation: { ...validation, schemaHash: 'stale' } })
  ).toThrow('another schema');
  expect(() => registry.render({ ...fixture(), validation })).toThrow('another schema');
});
it('retains fields omitted by a rich renderer in canonical recovery', () => {
  const input = fixture({ extra: { nested: ['001', 'yes'] } });
  const result = createStateRendererRegistry([
    adapter('small', { render: () => ({ content: 'summary' }) }),
  ]).render({ ...input, binding: binding(input) });
  expect(JSON.parse(result.recovery.json)).toEqual(input.state.value);
  expect(load(result.recovery.yaml, { schema: JSON_SCHEMA })).toEqual(input.state.value);
});
