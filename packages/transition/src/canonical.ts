import type { ProtocolValue } from './contracts';
import { NonCanonicalValueError } from './errors';

const textEncoder = new TextEncoder();

function assertWellFormedUnicode(value: string, path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new NonCanonicalValueError('String contains an unpaired high surrogate', path);
      }
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      throw new NonCanonicalValueError('String contains an unpaired low surrogate', path);
    }
  }
}

function canonicalJson(value: unknown, path: string, ancestors: Set<object>): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number': {
      if (!Number.isFinite(value)) {
        throw new NonCanonicalValueError('Numbers must be finite I-JSON values', path);
      }
      return JSON.stringify(value);
    }
    case 'string': {
      assertWellFormedUnicode(value, path);
      return JSON.stringify(value);
    }
    case 'object':
      break;
    default:
      throw new NonCanonicalValueError(`Unsupported ${typeof value} value`, path);
  }

  if (ancestors.has(value)) {
    throw new NonCanonicalValueError('Cyclic values cannot be canonicalized', path);
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      for (const key of Reflect.ownKeys(value)) {
        if (key === 'length') continue;
        if (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key)) {
          throw new NonCanonicalValueError(
            'Array properties outside indexed members are not protocol values',
            path
          );
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (
          descriptor === undefined ||
          !descriptor.enumerable ||
          !Object.hasOwn(descriptor, 'value')
        ) {
          throw new NonCanonicalValueError(
            'Protocol arrays require enumerable data members',
            `${path}[${key}]`
          );
        }
      }
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) {
          throw new NonCanonicalValueError('Sparse arrays are outside the protocol domain', path);
        }
        items.push(canonicalJson(value[index], `${path}[${index}]`, ancestors));
      }
      return `[${items.join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new NonCanonicalValueError('Only plain JSON objects are protocol values', path);
    }

    const record = value as Record<string, unknown>;
    for (const key of Reflect.ownKeys(record)) {
      if (typeof key !== 'string') {
        throw new NonCanonicalValueError('Symbol properties are outside the protocol domain', path);
      }
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !Object.hasOwn(descriptor, 'value')
      ) {
        throw new NonCanonicalValueError(
          'Protocol objects require enumerable data properties',
          `${path}.${key}`
        );
      }
    }
    const entries = Object.keys(record)
      .sort()
      .map((key) => {
        assertWellFormedUnicode(key, `${path} key`);
        return `${JSON.stringify(key)}:${canonicalJson(record[key], `${path}.${key}`, ancestors)}`;
      });
    return `{${entries.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

/** RFC 8785 canonical JSON text over the protocol I-JSON value domain. */
export function canonicalizeProtocolValue(value: ProtocolValue): string {
  return canonicalJson(value, '$', new Set<object>());
}

/** RFC 8785 canonical UTF-8 bytes used by protocol content identity. */
export function canonicalProtocolBytes(value: ProtocolValue): Uint8Array {
  return textEncoder.encode(canonicalizeProtocolValue(value));
}

export function compareCanonicalValues(left: ProtocolValue, right: ProtocolValue): number {
  const leftBytes = canonicalProtocolBytes(left);
  const rightBytes = canonicalProtocolBytes(right);
  const length = Math.min(leftBytes.length, rightBytes.length);

  for (let index = 0; index < length; index += 1) {
    const difference = leftBytes[index]! - rightBytes[index]!;
    if (difference !== 0) return difference;
  }
  return leftBytes.length - rightBytes.length;
}
