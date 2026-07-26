import type { ProtocolErrorCode } from './contracts';

export class TransitionProtocolError extends Error {
  readonly code: ProtocolErrorCode;
  readonly path?: string;

  constructor(code: ProtocolErrorCode, message: string, path?: string) {
    super(path === undefined ? message : `${message} at ${path}`);
    this.name = 'TransitionProtocolError';
    this.code = code;
    this.path = path;
  }
}

export class ObjectNotFoundError extends TransitionProtocolError {
  constructor(message = 'Protocol object was not found') {
    super('OBJECT_NOT_FOUND', message);
    this.name = 'ObjectNotFoundError';
  }
}

export class ObjectDigestMismatchError extends TransitionProtocolError {
  constructor(message = 'Resolved protocol bytes do not match the requested digest') {
    super('OBJECT_DIGEST_MISMATCH', message);
    this.name = 'ObjectDigestMismatchError';
  }
}

export class UnsupportedMediaTypeError extends TransitionProtocolError {
  constructor(message = 'Protocol media type is unsupported') {
    super('UNSUPPORTED_MEDIA_TYPE', message);
    this.name = 'UnsupportedMediaTypeError';
  }
}

export class UnsupportedSemanticsError extends TransitionProtocolError {
  constructor(message = 'Protocol semantics are unsupported') {
    super('UNSUPPORTED_SEMANTICS', message);
    this.name = 'UnsupportedSemanticsError';
  }
}

export class SchemaInvalidError extends TransitionProtocolError {
  constructor(message = 'Protocol value does not satisfy its closed schema', path?: string) {
    super('SCHEMA_INVALID', message, path);
    this.name = 'SchemaInvalidError';
  }
}

export class NonCanonicalValueError extends TransitionProtocolError {
  constructor(message = 'Protocol value is not canonical', path?: string) {
    super('NON_CANONICAL_VALUE', message, path);
    this.name = 'NonCanonicalValueError';
  }
}

export class IntegrityChainInvalidError extends TransitionProtocolError {
  constructor(message = 'Protocol integrity chain is invalid') {
    super('INTEGRITY_CHAIN_INVALID', message);
    this.name = 'IntegrityChainInvalidError';
  }
}

export class EffectClaimFalseError extends TransitionProtocolError {
  constructor(message = 'Replay result does not match the Effect claimed Result') {
    super('EFFECT_CLAIM_FALSE', message);
    this.name = 'EffectClaimFalseError';
  }
}

export class StaleBaseError extends TransitionProtocolError {
  constructor(message = 'Repository head no longer matches the expected base') {
    super('STALE_BASE', message);
    this.name = 'StaleBaseError';
  }
}
