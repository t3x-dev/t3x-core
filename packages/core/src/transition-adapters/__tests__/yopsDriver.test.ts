import {
  describeProtocolObject,
  digestProtocolObject,
  type Effect,
  InMemoryObjectResolver,
  type ProposalStatement,
  replay,
  type State,
  verifyEffect,
} from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import { createYOpsState } from '../stateCodec';
import {
  createYOpsEffect,
  YOPS_MUTATION_DRIVER_REF,
  YOPS_SPEC_DIGEST,
  YOpsExecutionError,
  YOpsPreconditionFailedError,
  yopsMutationDriver,
  yopsMutationDrivers,
} from '../yopsDriver';

const setCountToOne = { set: { path: 'count', value: 1 } };
const setCountToTwo = { set: { path: 'count', value: 2 } };

describe('YOps MutationDriver adapter', () => {
  it('pins its versioned native semantics and keeps the ref immutable', () => {
    expect(YOPS_SPEC_DIGEST).toBe(
      'sha256:2856688a25ab990f37019d10c0119a9967a0fb5f469c177d5f3e59ff1e508f37'
    );
    expect(YOPS_MUTATION_DRIVER_REF).toEqual({
      protocol: 't3x.dev/yops',
      protocolVersion: '1',
      specDigest: YOPS_SPEC_DIGEST,
    });
    expect(Object.isFrozen(YOPS_MUTATION_DRIVER_REF)).toBe(true);
  });

  it('produces the same Effect identity from the same Base and ordered operations', () => {
    const base = createYOpsState({ count: 0, label: '温度 😀', epsilon: 5e-324 });
    const callerOperations = [structuredClone(setCountToOne)];
    const first = createYOpsEffect({ base, operations: callerOperations });
    const second = createYOpsEffect({ base, operations: [setCountToOne] });

    callerOperations[0]!.set.value = 999;

    expect(first).toEqual(second);
    expect(digestProtocolObject(first.effect)).toBe(digestProtocolObject(second.effect));
    expect(first.result.value).toEqual({ count: 1, label: '温度 😀', epsilon: 5e-324 });
  });

  it('preserves operation order in both Effect identity and replay result', () => {
    const base = createYOpsState({ count: 0 });
    const oneThenTwo = createYOpsEffect({
      base,
      operations: [setCountToOne, setCountToTwo],
    });
    const twoThenOne = createYOpsEffect({
      base,
      operations: [setCountToTwo, setCountToOne],
    });

    expect(oneThenTwo.result.value).toEqual({ count: 2 });
    expect(twoThenOne.result.value).toEqual({ count: 1 });
    expect(digestProtocolObject(oneThenTwo.effect)).not.toBe(
      digestProtocolObject(twoThenOne.effect)
    );
  });

  it('maps explicit YOps assertions and expected Base checks to STALE_BASE', () => {
    const base = createYOpsState({ version: 1 });
    expect(() =>
      createYOpsEffect({
        base,
        operations: [{ assert: { path: 'version', equals: 2 } }],
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'STALE_BASE',
        yopsError: expect.objectContaining({ code: 'ASSERTION_FAILED', op_index: 0 }),
      })
    );

    expect(() =>
      createYOpsEffect({
        base,
        expectedBase: describeProtocolObject(createYOpsState({ version: 0 })),
        operations: [],
      })
    ).toThrowError(expect.objectContaining({ code: 'STALE_BASE' }));
  });

  it('keeps execution atomic and exposes the exact native failure, not a partial State', () => {
    const base = createYOpsState({ count: 0 });
    const before = structuredClone(base);

    expect(() =>
      createYOpsEffect({
        base,
        operations: [setCountToOne, { populate: { path: 'missing', values: { leaked: true } } }],
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'YOPS_EXECUTION_FAILED',
        yopsError: {
          code: 'PATH_NOT_FOUND',
          message: 'Path "missing" does not exist',
          op_index: 1,
        },
      })
    );
    expect(base).toEqual(before);

    try {
      createYOpsEffect({
        base,
        operations: [setCountToOne, { populate: { path: 'missing', values: { leaked: true } } }],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(YOpsExecutionError);
      expect(error).not.toHaveProperty('result');
      expect(error).not.toHaveProperty('doc');
    }
  });

  it('rejects provenance metadata, named inputs, and non-YOps State codecs at the seam', () => {
    const base = createYOpsState({ count: 0 });
    expect(() =>
      createYOpsEffect({
        base,
        operations: [
          {
            ...setCountToOne,
            source: { type: 'human', author: 'alice' },
          },
        ],
      })
    ).toThrowError(expect.objectContaining({ code: 'SCHEMA_INVALID' }));

    const input = createYOpsState({ imported: true });
    expect(() =>
      replay(
        base,
        {
          driver: { ...YOPS_MUTATION_DRIVER_REF },
          operations: [],
          inputs: [{ role: 'merge', object: describeProtocolObject(input) }],
        },
        new Map([['merge', input]]),
        yopsMutationDrivers
      )
    ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_SEMANTICS' }));

    const wrongCodec: State = {
      schema: 't3x/state/v1',
      codec: { mediaType: 'application/json', version: '1' },
      value: { count: 0 },
    };
    expect(() =>
      yopsMutationDriver.execute(
        wrongCodec,
        { driver: { ...YOPS_MUTATION_DRIVER_REF }, operations: [], inputs: [] },
        new Map()
      )
    ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_MEDIA_TYPE' }));
  });

  it('verifies the Effect offline and distinguishes false claims, missing drivers, and objects', async () => {
    const base = createYOpsState({ count: 0 });
    const { effect, result } = createYOpsEffect({ base, operations: [setCountToOne] });
    const resolver = new InMemoryObjectResolver([base]);

    await expect(
      verifyEffect(effect, { resolver, drivers: yopsMutationDrivers })
    ).resolves.toMatchObject({ result });

    const falseEffect: Effect = {
      ...effect,
      result: describeProtocolObject(createYOpsState({ count: 999 })),
    };
    await expect(
      verifyEffect(falseEffect, { resolver, drivers: yopsMutationDrivers })
    ).rejects.toMatchObject({ code: 'EFFECT_CLAIM_FALSE' });
    await expect(verifyEffect(effect, { resolver, drivers: new Map() })).rejects.toMatchObject({
      code: 'UNSUPPORTED_SEMANTICS',
    });
    await expect(
      verifyEffect(effect, {
        resolver: new InMemoryObjectResolver(),
        drivers: yopsMutationDrivers,
      })
    ).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
  });

  it('keeps human and agent provenance in Proposal Statements, outside Effect identity', () => {
    const { effect } = createYOpsEffect({
      base: createYOpsState({ enabled: false }),
      operations: [{ set: { path: 'enabled', value: true } }],
    });
    const subject = describeProtocolObject(effect);
    const proposal = (kind: 'human' | 'agent', id: string): ProposalStatement => ({
      schema: 't3x/statement/v1',
      subjects: [subject],
      actor: { kind, id },
      predicateType: 't3x.proposal/v1',
      predicate: {
        intent: { mode: 'authored', value: 'Enable the device', evidence: [] },
        rationale: { mode: 'unspecified' },
      },
    });

    const human = proposal('human', 'user:alice');
    const agent = proposal('agent', 'agent:maintenance');
    expect(human.subjects).toEqual([subject]);
    expect(agent.subjects).toEqual([subject]);
    expect(digestProtocolObject(human)).not.toBe(digestProtocolObject(agent));
    expect(describeProtocolObject(effect)).toEqual(subject);
    expect(effect.operations[0]).not.toHaveProperty('source');
  });

  it('retains the native assertion failure on the typed STALE_BASE error', () => {
    expect.assertions(2);
    const base = createYOpsState({ version: 1 });
    try {
      createYOpsEffect({
        base,
        operations: [{ assert: { path: 'version', equals: 2 } }],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(YOpsPreconditionFailedError);
      expect(error).toMatchObject({
        code: 'STALE_BASE',
        yopsError: { code: 'ASSERTION_FAILED', op_index: 0 },
      });
    }
  });
});
