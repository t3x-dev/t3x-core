import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describeProtocolObject } from '@t3x-dev/transition';
import { parseYSchema } from '@t3x-dev/yschema';
import { describe, expect, it } from 'vitest';
import {
  createYOpsEffect,
  createYOpsState,
  runYSchemaStatementProvider,
  YOpsPreconditionFailedError,
} from '../../transition-adapters';
import { deriveAssuranceReport } from '../../transition-statements';
import {
  createEspHomeStageAProfile,
  parseSupportedEspHomeYaml,
} from '../__fixtures__/esphome/profile';

const basePath = resolve(process.cwd(), 'src/transition-reference/__fixtures__/esphome/base.yaml');
const resultPath = resolve(
  process.cwd(),
  'src/transition-reference/__fixtures__/esphome/result.yaml'
);
const schemaPath = resolve(process.cwd(), '../yschema/examples/esphome-device.yschema.yaml');

const baseSource = readFileSync(basePath, 'utf8');
const resultSource = readFileSync(resultPath, 'utf8');
const schema = parseYSchema(readFileSync(schemaPath, 'utf8'));
const profile = createEspHomeStageAProfile(schema);

const operations = [
  { assert: { path: 'logger/level', equals: 'DEBUG' } },
  { set: { path: 'logger/level', value: 'INFO' } },
] as const;

function runValidation(
  state: ReturnType<typeof createYOpsState>,
  runId: string = profile.validation.run.id
) {
  return runYSchemaStatementProvider({
    state,
    schema,
    ...profile.validation,
    run: { ...profile.validation.run, id: runId },
  });
}

describe('ESPHome Stage A reference domain', () => {
  it('replays the base-sensitive change and validates the exact Result State', () => {
    const base = createYOpsState(parseSupportedEspHomeYaml(baseSource));
    const expectedResult = createYOpsState(parseSupportedEspHomeYaml(resultSource));
    const { effect, result } = createYOpsEffect({ base, operations });
    const validation = runValidation(result);
    const assurance = deriveAssuranceReport({
      observationScope: {
        completeness: 'complete',
        sources: ['reference:esphome-stage-a'],
      },
      statements: [validation],
      objectIntegrity: 'verified',
    });

    expect(profile.stateCodec).toEqual(base.codec);
    expect(effect.driver).toEqual(profile.mutationDriver);
    expect(result).toEqual(expectedResult);
    expect(effect.base).toEqual(describeProtocolObject(base));
    expect(effect.result).toEqual(describeProtocolObject(result));
    expect(validation.subjects).toEqual([describeProtocolObject(result)]);
    expect(validation.predicate).toMatchObject({
      outcome: 'passed',
      valid: true,
      ready: true,
      schemaResource: profile.validation.schemaResource,
      errors: [],
      gaps: [],
      fixes: [],
    });
    expect(assurance.validation).toMatchObject({
      observation: 'observed',
      outcomes: ['passed'],
    });
    expect(assurance.validation.runs).toHaveLength(1);
    expect(schema.rules).toEqual([]);
    expect(base.value).toMatchObject({
      wifi: {
        ssid: '$' + '{wifi_ssid}',
        password: '$' + '{wifi_password}',
      },
    });
  });

  it('rejects unsupported ESPHome tags instead of silently stripping them', () => {
    expect(() => parseSupportedEspHomeYaml('wifi:\n  password: !secret wifi_password\n')).toThrow(
      /unknown tag.*secret/i
    );
  });

  it('reports an assertion mismatch as the existing creation-path precondition failure', () => {
    const staleBase = createYOpsState({
      ...parseSupportedEspHomeYaml(baseSource),
      logger: { level: 'WARN' },
    });

    expect(() => createYOpsEffect({ base: staleBase, operations })).toThrowError(
      expect.objectContaining({
        code: 'STALE_BASE',
        yopsError: expect.objectContaining({ code: 'ASSERTION_FAILED', op_index: 0 }),
      })
    );
    expect(() => createYOpsEffect({ base: staleBase, operations })).toThrowError(
      YOpsPreconditionFailedError
    );
  });

  it('retains a failed validation and keeps it distinct from an unobserved check', () => {
    const invalid = createYOpsState({
      ...parseSupportedEspHomeYaml(resultSource),
      esphome: {
        name: 'Greenhouse Sensor',
        friendly_name: 'Greenhouse Sensor',
      },
    });
    const failed = runValidation(invalid, 'run:esphome-stage-a:invalid-name');
    const observed = deriveAssuranceReport({
      observationScope: {
        completeness: 'complete',
        sources: ['reference:esphome-stage-a'],
      },
      statements: [failed],
    });
    const missing = deriveAssuranceReport({
      observationScope: {
        completeness: 'complete',
        sources: ['reference:esphome-stage-a'],
      },
      statements: [],
    });

    expect(failed.predicate).toMatchObject({
      outcome: 'failed',
      valid: false,
      ready: false,
    });
    if (failed.predicate.outcome !== 'failed') throw new Error('Expected failed validation');
    expect(failed.predicate.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_PATTERN', path: 'esphome/name' }),
      ])
    );
    expect(observed.validation).toMatchObject({
      observation: 'observed',
      outcomes: ['failed'],
    });
    expect(missing.validation).toEqual({
      observation: 'no_statement_observed',
      outcomes: [],
      runs: [],
      unsupportedProfiles: [],
    });
  });

  it('fails closed when the schema descriptor does not bind the supplied schema', () => {
    const state = createYOpsState(parseSupportedEspHomeYaml(resultSource));

    expect(() =>
      runYSchemaStatementProvider({
        state,
        schema,
        ...profile.validation,
        schemaResource: {
          ...profile.validation.schemaResource,
          digest: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        },
      })
    ).toThrowError(expect.objectContaining({ code: 'SCHEMA_INVALID' }));
  });
});
