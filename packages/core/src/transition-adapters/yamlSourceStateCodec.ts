import {
  canonicalizeProtocolValue,
  type ProtocolValue,
  parseState,
  SchemaInvalidError,
  STATE_SCHEMA,
  type State,
  type StateCodec,
} from '@t3x-dev/transition';

export const YAML_SOURCE_MEDIA_TYPE = 'application/yaml' as const;
export const YAML_SOURCE_CODEC_VERSION = '1' as const;

function normalizeYamlSource(input: unknown): ProtocolValue {
  if (typeof input !== 'string') {
    throw new SchemaInvalidError('YAML source State value must be a string', '$.value');
  }

  // Validate the protocol Unicode domain without normalizing source bytes,
  // line endings, comments, tags, anchors, key order, or trailing whitespace.
  canonicalizeProtocolValue(input);
  return input;
}

/**
 * Exact-source YAML codec. The source string is authoritative; a parsed YAML
 * tree is never persisted as a second semantic truth.
 */
export const yamlSourceStateCodec: StateCodec = Object.freeze({
  mediaType: YAML_SOURCE_MEDIA_TYPE,
  version: YAML_SOURCE_CODEC_VERSION,
  normalize: normalizeYamlSource,
  decode(value: ProtocolValue) {
    return normalizeYamlSource(value) as string;
  },
});

export function createYamlSourceState(source: string): State {
  return parseState({
    schema: STATE_SCHEMA,
    codec: {
      mediaType: yamlSourceStateCodec.mediaType,
      version: yamlSourceStateCodec.version,
    },
    value: yamlSourceStateCodec.normalize(source),
  });
}
