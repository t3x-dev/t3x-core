import {
  canonicalizeProtocolValue,
  type ProtocolValue,
  parseState,
  STATE_SCHEMA,
  type State,
  type StateCodec,
} from '@t3x-dev/transition';
import type { YValue } from '@t3x-dev/yops';

export const YOPS_STATE_MEDIA_TYPE = 'application/vnd.t3x.yops-document+json' as const;
export const YOPS_STATE_CODEC_VERSION = '1' as const;

/**
 * Cross the protocol boundary by canonicalizing and reparsing the JSON value.
 *
 * Protocol identity uses RFC 8785. YOps keeps its own semantic comparison
 * rules; the adapter deliberately does not reuse those rules as a codec.
 */
function normalizeProtocolValue(input: unknown): ProtocolValue {
  return JSON.parse(canonicalizeProtocolValue(input as ProtocolValue)) as ProtocolValue;
}

export const yopsStateCodec: StateCodec = Object.freeze({
  mediaType: YOPS_STATE_MEDIA_TYPE,
  version: YOPS_STATE_CODEC_VERSION,
  normalize: normalizeProtocolValue,
  decode(value: ProtocolValue) {
    return normalizeProtocolValue(value) as YValue;
  },
});

export function createYOpsState(value: YValue): State {
  return parseState({
    schema: STATE_SCHEMA,
    codec: {
      mediaType: yopsStateCodec.mediaType,
      version: yopsStateCodec.version,
    },
    value: yopsStateCodec.normalize(value),
  });
}
