import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  definitionOf,
  describeProtocolObject,
  type Effect,
  type EffectDefinition,
  InMemoryObjectResolver,
  replay,
  type State,
  verifyEffect,
} from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import {
  createStateImportEffect,
  createYamlSourceEffect,
  createYamlSourceState,
  createYOpsState,
  deriveYamlSourceRevertOperations,
  YAML_SOURCE_MUTATION_DRIVER_REF,
  YamlSourcePreconditionFailedError,
  yamlSourceMutationDriver,
  yamlSourceMutationDrivers,
  yamlSourceStateCodec,
} from '..';

const fixtureDirectory = resolve(process.cwd(), 'src/transition-reference/__fixtures__/esphome');
const source = readFileSync(resolve(fixtureDirectory, 'source-fidelity.yaml'), 'utf8');
const expectedSource = readFileSync(
  resolve(fixtureDirectory, 'source-fidelity-result.yaml'),
  'utf8'
);

const loggerOperation = {
  op: 'replace_scalar',
  path: ['logger', 'level'],
  expect: 'DEBUG',
  value: 'INFO',
} as const;

function operation(value: unknown): never {
  return value as never;
}

function sourceState(value: string): State {
  return createYamlSourceState(value);
}

describe('exact-source YAML State codec', () => {
  it('round-trips the exact Unicode source without representation normalization', () => {
    expect(yamlSourceStateCodec.decode(source)).toBe(source);
    expect(createYamlSourceState(source).value).toBe(source);
    expect(() => yamlSourceStateCodec.normalize({ yaml: source })).toThrowError(
      expect.objectContaining({ code: 'SCHEMA_INVALID', path: '$.value' })
    );
    expect(() => yamlSourceStateCodec.normalize('\ud800')).toThrowError(
      expect.objectContaining({ code: 'NON_CANONICAL_VALUE' })
    );
  });

  it('gives different State identities to distinct source representations', () => {
    const lf = sourceState('logger:\n  level: DEBUG\n');
    const crlf = sourceState('logger:\r\n  level: DEBUG\r\n');
    const noTrailingNewline = sourceState('logger:\n  level: DEBUG');

    expect(describeProtocolObject(lf).digest).not.toBe(describeProtocolObject(crlf).digest);
    expect(describeProtocolObject(lf).digest).not.toBe(
      describeProtocolObject(noTrailingNewline).digest
    );
  });
});

describe('localized YAML source MutationDriver', () => {
  it('changes only the addressed scalar and preserves all surrounding source', async () => {
    const base = sourceState(source);
    const { effect, result } = createYamlSourceEffect({
      base,
      operations: [loggerOperation],
    });

    expect(result.value).toBe(expectedSource);
    expect(effect.base).toEqual(describeProtocolObject(base));
    expect(effect.result).toEqual(describeProtocolObject(result));
    expect(effect.driver).toEqual(YAML_SOURCE_MUTATION_DRIVER_REF);
    expect(expectedSource).toBe(source.replace('level: DEBUG', 'level: INFO'));
    expect(expectedSource).toContain('# Keep this explanation beside the value.');
    expect(expectedSource).toContain('&device_name');
    expect(expectedSource).toContain('*device_name');
    expect(expectedSource).toContain('!secret wifi_password');
    expect(expectedSource).toContain('!include packages/common.yaml');
    expect(expectedSource).toContain('!lambda |-');

    const resolver = new InMemoryObjectResolver([base]);
    await expect(
      verifyEffect(effect, { resolver, drivers: yamlSourceMutationDrivers })
    ).resolves.toMatchObject({ result });
    expect(replay(base, definitionOf(effect), new Map(), yamlSourceMutationDrivers)).toEqual(
      result
    );
  });

  it('applies multiple operations in listed order and returns no partial Result on failure', () => {
    const base = sourceState(source);
    const ordered = createYamlSourceEffect({
      base,
      operations: [
        loggerOperation,
        {
          op: 'replace_scalar',
          path: ['logger', 'level'],
          expect: 'INFO',
          value: 'WARN',
        },
      ],
    });
    expect(ordered.result.value).toBe(source.replace('level: DEBUG', 'level: WARN'));

    expect(() =>
      createYamlSourceEffect({
        base,
        operations: [
          loggerOperation,
          {
            op: 'replace_scalar',
            path: ['logger', 'level'],
            expect: 'ERROR',
            value: 'WARN',
          },
        ],
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'STALE_BASE',
        details: {
          operationIndex: 1,
          path: ['logger', 'level'],
          reason: 'expected_value_mismatch',
        },
      })
    );
    expect(base.value).toBe(source);
  });

  it('derives a reverse-order source-preserving inverse and refuses other drivers', () => {
    const base = sourceState(source);
    const forward = createYamlSourceEffect({
      base,
      operations: [
        loggerOperation,
        {
          op: 'replace_scalar',
          path: ['logger', 'level'],
          expect: 'INFO',
          value: 'WARN',
        },
      ],
    });

    const operations = deriveYamlSourceRevertOperations(forward.effect);
    expect(operations).toEqual([
      {
        op: 'replace_scalar',
        path: ['logger', 'level'],
        expect: 'WARN',
        value: 'INFO',
      },
      {
        op: 'replace_scalar',
        path: ['logger', 'level'],
        expect: 'INFO',
        value: 'DEBUG',
      },
    ]);
    const reverted = createYamlSourceEffect({
      base: forward.result,
      operations,
      expectedBase: forward.effect.result,
    });
    expect(reverted.result).toEqual(base);
    expect(reverted.effect.result).toEqual(forward.effect.base);

    const imported = createStateImportEffect({
      base: createYOpsState({}),
      imported: base,
    });
    expect(() => deriveYamlSourceRevertOperations(imported.effect)).toThrowError(
      expect.objectContaining({ code: 'UNSUPPORTED_SEMANTICS' })
    );
  });

  it('classifies creation preconditions as stale and verification preconditions as false claims', async () => {
    const base = sourceState(source);
    expect(() =>
      createYamlSourceEffect({
        base,
        operations: [{ ...loggerOperation, expect: 'WARN' }],
      })
    ).toThrowError(YamlSourcePreconditionFailedError);

    const valid = createYamlSourceEffect({ base, operations: [loggerOperation] });
    const incompatibleBase = sourceState(source.replace('level: DEBUG', 'level: WARN'));
    const falseEffect: Effect = {
      ...valid.effect,
      base: describeProtocolObject(incompatibleBase),
    };
    await expect(
      verifyEffect(falseEffect, {
        resolver: new InMemoryObjectResolver([incompatibleBase]),
        drivers: yamlSourceMutationDrivers,
      })
    ).rejects.toMatchObject({
      code: 'EFFECT_CLAIM_FALSE',
      cause: {
        code: 'REPLAY_PRECONDITION_FAILED',
        details: { reason: 'expected_value_mismatch' },
      },
    });
  });

  it('fails closed on targets whose indirect or encoded semantics exceed v1', () => {
    const base = sourceState(source);
    const cases = [
      {
        name: 'tagged scalar',
        operation: {
          op: 'replace_scalar',
          path: ['wifi', 'password'],
          expect: 'wifi_password',
          value: 'other_password',
        },
      },
      {
        name: 'alias',
        operation: {
          op: 'replace_scalar',
          path: ['esphome', 'name'],
          expect: 'greenhouse-sensor',
          value: 'shed-sensor',
        },
      },
      {
        name: 'collection',
        operation: {
          op: 'replace_scalar',
          path: ['logger'],
          expect: 'DEBUG',
          value: 'INFO',
        },
      },
    ];

    for (const fixture of cases) {
      expect(
        () => createYamlSourceEffect({ base, operations: [operation(fixture.operation)] }),
        fixture.name
      ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_SEMANTICS' }));
    }
  });

  it('rejects quoted targets and replacements that change YAML scalar type', () => {
    expect(() =>
      createYamlSourceEffect({
        base: sourceState('logger:\n  level: "DEBUG"\n'),
        operations: [loggerOperation],
      })
    ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_SEMANTICS' }));

    for (const value of ['true', 'null', '42', 'has spaces', 'value:with-colon']) {
      expect(() =>
        createYamlSourceEffect({
          base: sourceState('logger:\n  level: DEBUG\n'),
          operations: [{ ...loggerOperation, value }],
        })
      ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_SEMANTICS' }));
    }
  });

  it('rejects missing paths, malformed operations, and named inputs', () => {
    const base = sourceState(source);
    expect(() =>
      createYamlSourceEffect({
        base,
        operations: [{ ...loggerOperation, path: ['logger', 'missing'] }],
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'STALE_BASE',
        details: expect.objectContaining({ reason: 'path_not_found' }),
      })
    );
    expect(() =>
      createYamlSourceEffect({
        base,
        operations: [operation({ ...loggerOperation, source: { kind: 'human' } })],
      })
    ).toThrowError(expect.objectContaining({ code: 'SCHEMA_INVALID' }));

    const definition: EffectDefinition = {
      driver: { ...YAML_SOURCE_MUTATION_DRIVER_REF },
      operations: [operation(loggerOperation)],
      inputs: [],
    };
    expect(() =>
      yamlSourceMutationDriver.execute(base, definition, new Map([['ambient-secret', base]]))
    ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_SEMANTICS' }));
  });

  it('requires one valid YAML document while leaving unknown tags opaque', () => {
    for (const invalidSource of [
      'logger: [\n',
      'logger:\n  level: DEBUG\n---\nlogger:\n  level: INFO\n',
      'logger:\n  level: DEBUG\n  level: INFO\n',
    ]) {
      expect(() =>
        createYamlSourceEffect({
          base: sourceState(invalidSource),
          operations: [loggerOperation],
        })
      ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_SEMANTICS' }));
    }

    const result = createYamlSourceEffect({
      base: sourceState(source),
      operations: [loggerOperation],
    }).result;
    expect(result.value).toContain('password: !secret wifi_password');
    expect(result.value).not.toContain('resolved-secret-value');
  });
});
