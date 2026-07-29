import type { ProtocolValue } from '@t3x-dev/transition';
import type { YValue } from '@t3x-dev/yops';
import type { YSchema } from '@t3x-dev/yschema';
import yaml from 'js-yaml';
import {
  createYSchemaResourceDescriptor,
  YOPS_MUTATION_DRIVER_REF,
  YOPS_STATE_CODEC_VERSION,
  YOPS_STATE_MEDIA_TYPE,
  YSCHEMA_NATIVE_PROFILE,
} from '../../../transition-adapters';

export const ESPHOME_STAGE_A_SCHEMA_URI = 'urn:t3x:reference:esphome-device:yschema:0.1.0' as const;

function isProtocolValue(value: unknown): value is ProtocolValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isProtocolValue);
  if (typeof value !== 'object') return false;
  return (
    Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every(isProtocolValue)
  );
}

/**
 * Load only the JSON-compatible YAML subset used by the Stage A reference.
 *
 * js-yaml's JSON schema keeps scalar interpretation inside JSON semantics and
 * rejects unknown ESPHome tags such as !secret instead of erasing them.
 */
export function parseSupportedEspHomeYaml(source: string): Record<string, YValue> {
  const parsed: unknown = yaml.load(source, { schema: yaml.JSON_SCHEMA });
  if (
    !isProtocolValue(parsed) ||
    parsed === null ||
    Array.isArray(parsed) ||
    typeof parsed !== 'object'
  ) {
    throw new TypeError('ESPHome Stage A YAML must decode to one JSON-compatible mapping');
  }
  return parsed as Record<string, YValue>;
}

/**
 * Test-local composition data. This is deliberately not a public domain
 * framework or protocol object.
 */
export function createEspHomeStageAProfile(schema: YSchema) {
  return Object.freeze({
    id: 't3x.dev/reference/esphome-stage-a',
    version: '1',
    stateCodec: Object.freeze({
      mediaType: YOPS_STATE_MEDIA_TYPE,
      version: YOPS_STATE_CODEC_VERSION,
    }),
    mutationDriver: YOPS_MUTATION_DRIVER_REF,
    validation: Object.freeze({
      schemaResource: Object.freeze(
        createYSchemaResourceDescriptor(ESPHOME_STAGE_A_SCHEMA_URI, schema)
      ),
      profile: YSCHEMA_NATIVE_PROFILE,
      context: Object.freeze({ mode: 'unspecified' as const }),
      environment: Object.freeze({ mode: 'unspecified' as const }),
      actor: Object.freeze({ kind: 'service' as const, id: 'validator:yschema' }),
      tool: Object.freeze({ name: '@t3x-dev/yschema', version: '0.6.0' }),
      run: Object.freeze({
        id: 'run:esphome-stage-a:1',
        recordedAt: '2026-07-29T00:00:00.000Z',
      }),
    }),
  });
}
