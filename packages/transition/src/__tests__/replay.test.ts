import { describe, expect, it } from 'vitest';
import {
  definitionOf,
  describeProtocolObject,
  type Effect,
  InMemoryObjectResolver,
  type MutationDriver,
  type MutationDriverRef,
  mutationDriverKey,
  replay,
  resolveMutationDriver,
  resolveStateCodec,
  type State,
  type StateCodec,
  stateCodecKey,
  verifyEffect,
} from '..';

const specDigest = `sha256:${'1'.repeat(64)}` as const;
const driverRef: MutationDriverRef = {
  protocol: 't3x.dev/test-set',
  protocolVersion: '1',
  specDigest,
};

function state(name: string): State {
  return {
    schema: 't3x/state/v1',
    codec: { mediaType: 'application/test+json', version: '1' },
    value: { name },
  };
}

function fixture() {
  const base = state('before');
  const result = state('after');
  const resolver = new InMemoryObjectResolver([base]);
  const effect: Effect = {
    schema: 't3x/effect/v1',
    base: describeProtocolObject(base),
    driver: driverRef,
    operations: [{ op: 'set', value: 'after' }],
    inputs: [],
    result: describeProtocolObject(result),
  };
  const driver: MutationDriver = {
    ...driverRef,
    execute(receivedBase, definition, inputs) {
      expect(receivedBase).toEqual(base);
      expect(definition).not.toHaveProperty('result');
      expect(inputs.size).toBe(0);
      return result;
    },
  };
  const drivers = new Map([[mutationDriverKey(driverRef), driver]]);
  return { base, result, resolver, effect, driver, drivers };
}

describe('pure Effect replay verification', () => {
  it('replays Base + EffectDefinition and proves the claimed Result', async () => {
    const { result, resolver, effect, drivers } = fixture();
    await expect(verifyEffect(effect, { resolver, drivers })).resolves.toMatchObject({ result });
    expect(definitionOf(effect)).toEqual({
      driver: effect.driver,
      operations: effect.operations,
      inputs: effect.inputs,
    });
  });

  it('fails a false claimed Result distinctly from unsupported semantics', async () => {
    const { resolver, effect, drivers } = fixture();
    const falseEffect: Effect = { ...effect, result: describeProtocolObject(state('other')) };

    await expect(verifyEffect(falseEffect, { resolver, drivers })).rejects.toMatchObject({
      code: 'EFFECT_CLAIM_FALSE',
    });
    await expect(verifyEffect(effect, { resolver, drivers: new Map() })).rejects.toMatchObject({
      code: 'UNSUPPORTED_SEMANTICS',
    });
  });

  it('resolves only declared Effect inputs by role', async () => {
    const { resolver, effect } = fixture();
    const declared = state('declared-input');
    const descriptor = resolver.put(declared);
    const effectWithInput: Effect = {
      ...effect,
      inputs: [{ role: 'merge-source', object: descriptor }],
    };
    const driver: MutationDriver = {
      ...driverRef,
      execute(_base, _definition, inputs) {
        expect([...inputs.keys()]).toEqual(['merge-source']);
        expect(inputs.get('merge-source')).toEqual(declared);
        return state('after');
      },
    };

    await expect(
      verifyEffect(effectWithInput, {
        resolver,
        drivers: new Map([[mutationDriverKey(driverRef), driver]]),
      })
    ).resolves.toBeDefined();

    const definition = definitionOf(effectWithInput);
    expect(() =>
      replay(
        state('before'),
        definition,
        new Map([
          ['merge-source', declared],
          ['ambient-worktree', state('hidden')],
        ]),
        new Map([[mutationDriverKey(driverRef), driver]])
      )
    ).toThrowError(expect.objectContaining({ code: 'INTEGRITY_CHAIN_INVALID' }));
  });

  it('rejects a registry entry whose key impersonates different driver semantics', async () => {
    const { resolver, effect, driver } = fixture();
    const mismatched: MutationDriver = { ...driver, protocolVersion: '2' };
    await expect(
      verifyEffect(effect, {
        resolver,
        drivers: new Map([[mutationDriverKey(driverRef), mismatched]]),
      })
    ).rejects.toMatchObject({ code: 'INTEGRITY_CHAIN_INVALID' });
  });

  it('rejects a runtime attempt to put the claimed Result back into Replay input', () => {
    const { base, effect, drivers } = fixture();
    const unsafeDefinition = {
      ...definitionOf(effect),
      result: effect.result,
    } as never;
    expect(() => replay(base, unsafeDefinition, new Map(), drivers)).toThrowError(
      expect.objectContaining({ code: 'INTEGRITY_CHAIN_INVALID' })
    );
  });

  it('keeps codec lookup and driver lookup as explicit versioned ports', () => {
    const codec: StateCodec = {
      mediaType: 'application/test+json',
      version: '1',
      normalize(input) {
        return String(input);
      },
      decode(value) {
        return value;
      },
    };
    const codecs = new Map([[stateCodecKey(codec), codec]]);
    expect(resolveStateCodec(codecs, codec)).toBe(codec);
    expect(() =>
      resolveStateCodec(codecs, { mediaType: codec.mediaType, version: '2' })
    ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_MEDIA_TYPE' }));
    expect(() =>
      resolveStateCodec(new Map([[stateCodecKey(codec), { ...codec, version: '2' }]]), codec)
    ).toThrowError(expect.objectContaining({ code: 'INTEGRITY_CHAIN_INVALID' }));

    const { driver } = fixture();
    const drivers = new Map([[mutationDriverKey(driverRef), driver]]);
    expect(resolveMutationDriver(drivers, driverRef)).toBe(driver);
  });
});
