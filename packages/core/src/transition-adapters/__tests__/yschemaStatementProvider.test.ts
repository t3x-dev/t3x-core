import { describeProtocolObject, type State } from '@t3x-dev/transition';
import { validateTree, type YSchema } from '@t3x-dev/yschema';
import { describe, expect, it } from 'vitest';
import { createYOpsState, yopsStateCodec } from '../stateCodec';
import {
  createYSchemaContextDescriptor,
  createYSchemaResourceDescriptor,
  runYSchemaStatementProvider,
  YSCHEMA_NATIVE_PROFILE,
} from '../yschemaStatementProvider';

const schema: YSchema = {
  yschema: '0.1',
  name: 'device-config',
  nodes: {
    device: {
      required: true,
      requiredSlots: ['name', 'enabled'],
      slots: {
        name: { type: 'string' },
        enabled: { type: 'boolean', default: true },
      },
    },
  },
};

const schemaResource = createYSchemaResourceDescriptor('urn:t3x:test:yschema:device', schema);

const metadata = {
  schemaResource,
  context: { mode: 'unspecified' as const },
  environment: { mode: 'unspecified' as const },
  actor: { kind: 'service' as const, id: 'validator:yschema' },
  tool: { name: '@t3x-dev/yschema', version: '0.6.0' },
  run: { id: 'run:yschema:1', recordedAt: '2026-07-27T01:00:00.000Z' },
};

describe('YSchema Statement provider', () => {
  it('binds a passing native result to the exact validated State', () => {
    const state = createYOpsState({ device: { name: 'Kitchen sensor', enabled: true } });
    const statement = runYSchemaStatementProvider({ state, schema, ...metadata });

    expect(statement.subjects).toEqual([describeProtocolObject(state)]);
    expect(statement.predicate).toMatchObject({
      outcome: 'passed',
      valid: true,
      ready: true,
      errors: [],
      gaps: [],
      fixes: [],
      schemaResource,
      profile: YSCHEMA_NATIVE_PROFILE,
    });
  });

  it('preserves every native finding array without changing its order', () => {
    const state = createYOpsState({ device: { name: 42 } });
    const native = validateTree({
      tree: yopsStateCodec.decode(state.value) as Parameters<typeof validateTree>[0]['tree'],
      schema,
    });
    const statement = runYSchemaStatementProvider({ state, schema, ...metadata });

    expect(statement.predicate.outcome).toBe('failed');
    if (statement.predicate.outcome !== 'failed') throw new Error('Expected a failed result');
    expect(statement.predicate.valid).toBe(native.valid);
    expect(statement.predicate.ready).toBe(native.ready);
    expect(statement.predicate.errors).toEqual(native.errors);
    expect(statement.predicate.gaps).toEqual(native.gaps);
    expect(statement.predicate.fixes).toEqual(native.fixes);
  });

  it('keeps valid-but-incomplete distinct from structurally invalid', () => {
    const incomplete = runYSchemaStatementProvider({
      state: createYOpsState({ device: { name: 'Kitchen sensor' } }),
      schema,
      ...metadata,
    });
    const invalid = runYSchemaStatementProvider({
      state: createYOpsState({ device: { name: 42, enabled: true } }),
      schema,
      ...metadata,
      run: { ...metadata.run, id: 'run:yschema:2' },
    });

    expect(incomplete.predicate).toMatchObject({ outcome: 'failed', valid: true, ready: false });
    expect(invalid.predicate).toMatchObject({ outcome: 'failed', valid: false, ready: false });
  });

  it('returns an explicit unsupported outcome without pretending validation ran', () => {
    const wrongCodec: State = {
      schema: 't3x/state/v1',
      codec: { mediaType: 'application/example', version: '1' },
      value: { device: {} },
    };
    const statement = runYSchemaStatementProvider({
      state: wrongCodec,
      schema,
      ...metadata,
      profile: { id: YSCHEMA_NATIVE_PROFILE.id, version: '2.0' },
    });

    expect(statement.predicate).toEqual({
      tool: metadata.tool,
      run: metadata.run,
      environment: metadata.environment,
      schemaResource,
      profile: { id: YSCHEMA_NATIVE_PROFILE.id, version: '2.0' },
      context: metadata.context,
      outcome: 'unsupported',
      reason: 'Unsupported YSchema profile t3x.dev/yschema/native@2.0',
    });
  });

  it('keeps operational and binding failures outside provider outcomes', () => {
    const wrongCodec: State = {
      schema: 't3x/state/v1',
      codec: { mediaType: 'application/example', version: '1' },
      value: { device: {} },
    };
    expect(() =>
      runYSchemaStatementProvider({ state: wrongCodec, schema, ...metadata })
    ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_MEDIA_TYPE' }));

    expect(() =>
      runYSchemaStatementProvider({
        state: createYOpsState({ device: { name: 'Kitchen sensor', enabled: true } }),
        schema,
        ...metadata,
        provenanceByPath: {
          'device/name': [{ origin: 'user_evidence', quote: 'Kitchen sensor' }],
        },
      })
    ).toThrowError(expect.objectContaining({ code: 'SCHEMA_INVALID' }));

    expect(() =>
      runYSchemaStatementProvider({
        state: createYOpsState({ device: { name: 'Kitchen sensor', enabled: true } }),
        schema,
        ...metadata,
        schemaResource: {
          ...schemaResource,
          digest: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        },
      })
    ).toThrowError(expect.objectContaining({ code: 'SCHEMA_INVALID' }));
  });

  it('verifies a bound context against the exact relations and provenance inputs', () => {
    const state = createYOpsState({ device: { name: 'Kitchen sensor', enabled: true } });
    const provenanceByPath = {
      'device/name': [{ origin: 'user_evidence' as const, quote: 'Kitchen sensor' }],
    };
    const context = {
      mode: 'bound' as const,
      resource: createYSchemaContextDescriptor('urn:t3x:test:context:1', {
        provenanceByPath,
      }),
    };

    expect(
      runYSchemaStatementProvider({
        state,
        schema,
        ...metadata,
        context,
        provenanceByPath,
      }).predicate.context
    ).toEqual(context);

    expect(() =>
      runYSchemaStatementProvider({
        state,
        schema,
        ...metadata,
        context,
        provenanceByPath: {
          'device/name': [{ origin: 'user_evidence', quote: 'Different source' }],
        },
      })
    ).toThrowError(expect.objectContaining({ code: 'SCHEMA_INVALID' }));
  });

  it('creates immutable run history without changing State identity', () => {
    const state = createYOpsState({ device: { name: 'Kitchen sensor', enabled: true } });
    const before = describeProtocolObject(state);
    const first = runYSchemaStatementProvider({ state, schema, ...metadata });
    const second = runYSchemaStatementProvider({
      state,
      schema,
      ...metadata,
      run: { id: 'run:yschema:2', recordedAt: '2026-07-27T01:00:01.000Z' },
    });

    expect(first.subjects).toEqual(second.subjects);
    expect(describeProtocolObject(first)).not.toEqual(describeProtocolObject(second));
    expect(describeProtocolObject(state)).toEqual(before);
  });
});
