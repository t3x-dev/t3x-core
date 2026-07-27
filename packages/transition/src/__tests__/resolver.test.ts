import { describe, expect, it } from 'vitest';
import {
  canonicalProtocolObjectBytes,
  describeProtocolObject,
  digestCanonicalProtocolBytes,
  InMemoryObjectResolver,
  type ObjectDescriptor,
  type ObjectResolver,
  resolveProtocolObject,
  type State,
} from '..';

function state(name: string): State {
  return {
    schema: 't3x/state/v1',
    codec: { mediaType: 'application/test+json', version: '1' },
    value: { name },
  };
}

class FixedResolver implements ObjectResolver {
  constructor(private readonly bytes?: Uint8Array) {}

  async get(): Promise<Uint8Array | undefined> {
    return this.bytes;
  }
}

describe('content-addressed ObjectResolver', () => {
  it('stores canonical bytes and re-hashes them on every resolve', async () => {
    const object = state('kitchen');
    const resolver = new InMemoryObjectResolver();
    const descriptor = resolver.put(object);

    await expect(resolveProtocolObject(resolver, descriptor)).resolves.toEqual(object);
    const first = await resolver.get(descriptor);
    const second = await resolver.get(descriptor);
    expect(first).toEqual(canonicalProtocolObjectBytes(object));
    expect(second).not.toBe(first);
  });

  it('distinguishes missing objects from digest mismatches', async () => {
    const requested = describeProtocolObject(state('requested'));
    await expect(resolveProtocolObject(new FixedResolver(), requested)).rejects.toMatchObject({
      code: 'OBJECT_NOT_FOUND',
    });

    const wrongBytes = canonicalProtocolObjectBytes(state('wrong'));
    await expect(
      resolveProtocolObject(new FixedResolver(wrongBytes), requested)
    ).rejects.toMatchObject({ code: 'OBJECT_DIGEST_MISMATCH' });
  });

  it('does not accept a digest fabricated over non-canonical storage bytes', async () => {
    const object = state('pretty');
    const prettyBytes = new TextEncoder().encode(JSON.stringify(object, null, 2));
    const descriptor: ObjectDescriptor = {
      kind: 'state',
      schema: 't3x/state/v1',
      digest: digestCanonicalProtocolBytes('state', 't3x/state/v1', prettyBytes),
    };

    await expect(
      resolveProtocolObject(new FixedResolver(prettyBytes), descriptor)
    ).rejects.toMatchObject({ code: 'OBJECT_DIGEST_MISMATCH' });
  });

  it('does not disguise resolver infrastructure failures as protocol verdicts', async () => {
    const operationalFailure = new Error('object store unavailable');
    const resolver: ObjectResolver = {
      async get() {
        throw operationalFailure;
      },
    };

    await expect(
      resolveProtocolObject(resolver, describeProtocolObject(state('requested')))
    ).rejects.toBe(operationalFailure);
  });
});
