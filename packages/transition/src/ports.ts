import type {
  Digest,
  EffectDefinition,
  MutationDriverRef,
  ProtocolObject,
  ProtocolValue,
  State,
  StateCodecRef,
} from './contracts';
import {
  IntegrityChainInvalidError,
  UnsupportedMediaTypeError,
  UnsupportedSemanticsError,
} from './errors';

export type ResolvedInputs = ReadonlyMap<string, ProtocolObject>;

export interface StateCodec {
  readonly mediaType: string;
  readonly version: string;
  normalize(input: unknown): ProtocolValue;
  decode(value: ProtocolValue): unknown;
}

export interface MutationDriver {
  readonly protocol: string;
  readonly protocolVersion: string;
  readonly specDigest: Digest;
  /**
   * Throw ReplayPreconditionFailedError when the supplied Base does not
   * satisfy an operation precondition. Do not classify the caller's verdict.
   */
  execute(base: State, definition: EffectDefinition, inputs: ResolvedInputs): State;
}

export type StateCodecRegistry = ReadonlyMap<string, StateCodec>;
export type MutationDriverRegistry = ReadonlyMap<string, MutationDriver>;

export function stateCodecKey(ref: StateCodecRef): string {
  return `${ref.mediaType}\0${ref.version}`;
}

export function mutationDriverKey(ref: MutationDriverRef): string {
  return `${ref.protocol}\0${ref.protocolVersion}\0${ref.specDigest}`;
}

export function resolveStateCodec(registry: StateCodecRegistry, ref: StateCodecRef): StateCodec {
  const codec = registry.get(stateCodecKey(ref));
  if (codec === undefined) {
    throw new UnsupportedMediaTypeError(`Unsupported State codec ${ref.mediaType}@${ref.version}`);
  }
  if (stateCodecKey(codec) !== stateCodecKey(ref)) {
    throw new IntegrityChainInvalidError('StateCodec registry key does not match its semantics');
  }
  return codec;
}

export function resolveMutationDriver(
  registry: MutationDriverRegistry,
  ref: MutationDriverRef
): MutationDriver {
  const driver = registry.get(mutationDriverKey(ref));
  if (driver === undefined) {
    throw new UnsupportedSemanticsError(
      `Unsupported MutationDriver ${ref.protocol}@${ref.protocolVersion} (${ref.specDigest})`
    );
  }
  if (mutationDriverKey(driver) !== mutationDriverKey(ref)) {
    throw new IntegrityChainInvalidError(
      'MutationDriver registry key does not match its semantics'
    );
  }
  return driver;
}
