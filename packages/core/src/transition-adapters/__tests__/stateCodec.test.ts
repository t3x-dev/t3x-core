import { NonCanonicalValueError } from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import {
  createYOpsState,
  YOPS_STATE_CODEC_VERSION,
  YOPS_STATE_MEDIA_TYPE,
  yopsStateCodec,
} from '../stateCodec';

describe('YOps State codec', () => {
  it('normalizes the JSON document domain without sharing YOps semantic canonicalization', () => {
    const input = {
      unicode: '你好 😀',
      numbers: [-0, 0.000001, 1e21, 5e-324],
      nested: { b: 2, a: 1 },
    };

    const state = createYOpsState(input);
    expect(state).toEqual({
      schema: 't3x/state/v1',
      codec: {
        mediaType: YOPS_STATE_MEDIA_TYPE,
        version: YOPS_STATE_CODEC_VERSION,
      },
      value: {
        nested: { a: 1, b: 2 },
        numbers: [0, 0.000001, 1e21, 5e-324],
        unicode: '你好 😀',
      },
    });
    expect(state.value).not.toBe(input);
    expect(Object.isFrozen(yopsStateCodec)).toBe(true);
    expect(yopsStateCodec.decode(state.value)).toEqual(state.value);
    expect(yopsStateCodec.decode(state.value)).not.toBe(state.value);
  });

  it('rejects values outside the finite, well-formed protocol JSON domain', () => {
    expect(() => yopsStateCodec.normalize({ value: Number.NaN })).toThrow(NonCanonicalValueError);
    expect(() => yopsStateCodec.normalize({ value: undefined })).toThrow(NonCanonicalValueError);
    expect(() => yopsStateCodec.normalize({ value: '\ud800' })).toThrow(NonCanonicalValueError);
  });
});
