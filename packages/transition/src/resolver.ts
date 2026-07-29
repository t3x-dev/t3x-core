import type { ObjectDescriptor, ProtocolObject } from './contracts';
import {
  NonCanonicalValueError,
  ObjectDigestMismatchError,
  ObjectNotFoundError,
  UnsupportedMediaTypeError,
} from './errors';
import {
  canonicalProtocolObjectBytes,
  describeProtocolObject,
  digestCanonicalProtocolBytes,
} from './identity';
import { parseObjectDescriptor, parseProtocolBytes } from './parse';

export interface ObjectResolver {
  get(descriptor: ObjectDescriptor): Promise<Uint8Array | undefined>;
}

function descriptorKey(descriptor: ObjectDescriptor): string {
  return `${descriptor.kind}\0${descriptor.schema}\0${descriptor.digest}`;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export class InMemoryObjectResolver implements ObjectResolver {
  private readonly objects = new Map<string, Uint8Array>();

  constructor(objects: Iterable<ProtocolObject> = []) {
    for (const object of objects) this.put(object);
  }

  put(object: ProtocolObject): ObjectDescriptor {
    const descriptor = describeProtocolObject(object);
    this.objects.set(descriptorKey(descriptor), canonicalProtocolObjectBytes(object));
    return descriptor;
  }

  async get(descriptor: ObjectDescriptor): Promise<Uint8Array | undefined> {
    const bytes = this.objects.get(descriptorKey(descriptor));
    return bytes === undefined ? undefined : new Uint8Array(bytes);
  }
}

/** Resolve immutable bytes, re-hash them, require canonical storage, then strict-parse. */
export async function resolveProtocolObject(
  resolver: ObjectResolver,
  requested: ObjectDescriptor
): Promise<ProtocolObject> {
  const descriptor = parseObjectDescriptor(requested);
  const bytes = await resolver.get(descriptor);
  if (bytes === undefined) {
    throw new ObjectNotFoundError(`Protocol object ${descriptor.digest} was not found`);
  }

  const resolvedDigest = digestCanonicalProtocolBytes(descriptor.kind, descriptor.schema, bytes);
  if (resolvedDigest !== descriptor.digest) {
    throw new ObjectDigestMismatchError(
      `Requested ${descriptor.digest}, but resolved bytes hash to ${resolvedDigest}`
    );
  }

  const object = parseProtocolBytes(bytes);
  const actual = describeProtocolObject(object);
  if (actual.kind !== descriptor.kind || actual.schema !== descriptor.schema) {
    throw new UnsupportedMediaTypeError(
      `Requested ${descriptor.kind}/${descriptor.schema}, but resolved ${actual.kind}/${actual.schema}`
    );
  }
  if (actual.digest !== descriptor.digest) {
    throw new ObjectDigestMismatchError(
      `Requested ${descriptor.digest}, but resolved object identifies as ${actual.digest}`
    );
  }

  const canonical = canonicalProtocolObjectBytes(object);
  if (!bytesEqual(bytes, canonical)) {
    throw new NonCanonicalValueError('Resolved object bytes are not RFC 8785 canonical');
  }
  return object;
}
