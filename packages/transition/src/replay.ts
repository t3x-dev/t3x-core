import {
  type Effect,
  type EffectDefinition,
  type ObjectDescriptor,
  type ProtocolObject,
  STATE_SCHEMA,
  type State,
  type StateDescriptor,
} from './contracts';
import {
  EffectClaimFalseError,
  IntegrityChainInvalidError,
  ReplayPreconditionFailedError,
} from './errors';
import { describeProtocolObject } from './identity';
import { parseEffect, parseEffectDefinition, parseState } from './parse';
import { type MutationDriverRegistry, type ResolvedInputs, resolveMutationDriver } from './ports';
import { type ObjectResolver, resolveProtocolObject } from './resolver';

export interface EffectVerificationContext {
  resolver: ObjectResolver;
  drivers: MutationDriverRegistry;
}

export interface VerifiedEffect {
  effect: Effect;
  result: State;
  resultDescriptor: StateDescriptor;
}

/** Explicitly project replay input so Effect.result cannot enter driver execution. */
export function definitionOf(effect: Effect): EffectDefinition {
  const parsed = parseEffect(effect);
  return {
    driver: { ...parsed.driver },
    operations: [...parsed.operations],
    inputs: parsed.inputs.map((input) => ({ role: input.role, object: { ...input.object } })),
  };
}

function descriptorsEqual(
  left: { kind: string; schema: string; digest: string },
  right: { kind: string; schema: string; digest: string }
): boolean {
  return left.kind === right.kind && left.schema === right.schema && left.digest === right.digest;
}

/**
 * Execute only Base + EffectDefinition + declared inputs; no claimed Result is accepted.
 * Replay deliberately lets ReplayPreconditionFailedError escape unchanged so
 * callers can classify the same failed precondition for their own context.
 */
export function replay(
  base: State,
  definition: EffectDefinition,
  inputs: ResolvedInputs,
  drivers: MutationDriverRegistry
): State {
  for (const forbidden of ['schema', 'base', 'result'] as const) {
    if (Object.hasOwn(definition, forbidden)) {
      throw new IntegrityChainInvalidError(
        `EffectDefinition must not carry the forbidden ${forbidden} field`
      );
    }
  }
  const parsedDefinition = parseEffectDefinition(definition);
  if (inputs.size !== parsedDefinition.inputs.length) {
    throw new IntegrityChainInvalidError('Replay inputs must exactly match declared Effect inputs');
  }
  for (const input of parsedDefinition.inputs) {
    const resolved = inputs.get(input.role);
    if (
      resolved === undefined ||
      !descriptorsEqual(describeProtocolObject(resolved), input.object)
    ) {
      throw new IntegrityChainInvalidError(
        `Replay input ${input.role} does not match its declared descriptor`
      );
    }
  }

  const driver = resolveMutationDriver(drivers, parsedDefinition.driver);
  return parseState(driver.execute(parseState(base), parsedDefinition, inputs));
}

function expectState(object: ProtocolObject, descriptor: ObjectDescriptor): State {
  if (object.schema !== STATE_SCHEMA) {
    throw new IntegrityChainInvalidError(
      `Descriptor ${descriptor.digest} did not resolve to a State`
    );
  }
  return parseState(object);
}

export async function verifyEffect(
  effect: Effect,
  context: EffectVerificationContext
): Promise<VerifiedEffect> {
  const parsed = parseEffect(effect);
  const baseObject = await resolveProtocolObject(context.resolver, parsed.base);
  const base = expectState(baseObject, parsed.base);

  const inputs = new Map<string, ProtocolObject>();
  for (const input of parsed.inputs) {
    inputs.set(input.role, await resolveProtocolObject(context.resolver, input.object));
  }

  let result: State;
  try {
    result = replay(base, definitionOf(parsed), inputs, context.drivers);
  } catch (error) {
    if (error instanceof ReplayPreconditionFailedError) {
      throw new EffectClaimFalseError(
        `Replay could not satisfy an Effect precondition: ${error.message}`,
        { cause: error }
      );
    }
    throw error;
  }
  const resultDescriptor = describeProtocolObject(result);
  if (!descriptorsEqual(resultDescriptor, parsed.result)) {
    throw new EffectClaimFalseError(
      `Replay produced ${resultDescriptor.digest}, not claimed ${parsed.result.digest}`
    );
  }

  return { effect: parsed, result, resultDescriptor };
}
