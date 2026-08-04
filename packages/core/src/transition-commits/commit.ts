import {
  COMMIT_V2_MEDIA_TYPE,
  type CommitDescriptor,
  type CommitV2,
  canonicalProtocolObjectBytes,
  type DecisionStatement,
  describeProtocolObject,
  type Effect,
  InMemoryObjectResolver,
  type ObjectDescriptor,
  type ObjectResolver,
  type ProposalStatement,
  type ProtocolObject,
  parseCommitV2,
  parseDecisionStatement,
  parseEffect,
  parseProposalStatement,
  parseProtocolBytes,
  resolveProtocolObject,
  type State,
  type VerifiedCommitIntegrity,
  verifyCommitIntegrity,
} from '@t3x-dev/transition';

export { COMMIT_V2_MEDIA_TYPE };
export {
  describeProtocolObject as describeTransitionObject,
  InMemoryObjectResolver as InMemoryTransitionObjectResolver,
};
export type {
  CommitDescriptor,
  CommitV2,
  Effect,
  ObjectDescriptor,
  ObjectResolver,
  ProposalStatement,
  ProtocolObject,
  State,
  VerifiedCommitIntegrity,
};

const textDecoder = new TextDecoder('utf-8', { fatal: true });
const textEncoder = new TextEncoder();

export interface SerializedTransitionObject {
  descriptor: ObjectDescriptor;
  canonicalJson: string;
}

export function serializeTransitionObject(object: ProtocolObject): SerializedTransitionObject {
  return {
    descriptor: describeProtocolObject(object),
    canonicalJson: textDecoder.decode(canonicalProtocolObjectBytes(object)),
  };
}

export function parseSerializedTransitionObject(canonicalJson: string): ProtocolObject {
  return parseProtocolBytes(textEncoder.encode(canonicalJson));
}

class OverlayObjectResolver implements ObjectResolver {
  constructor(
    private readonly overlay: ReadonlyMap<string, Uint8Array>,
    private readonly fallback: ObjectResolver
  ) {}

  async get(descriptor: ObjectDescriptor): Promise<Uint8Array | undefined> {
    const bytes = this.overlay.get(descriptor.digest);
    return bytes === undefined ? this.fallback.get(descriptor) : new Uint8Array(bytes);
  }
}

export function overlayTransitionObjects(
  fallback: ObjectResolver,
  objects: readonly ProtocolObject[]
): ObjectResolver {
  const overlay = new Map<string, Uint8Array>();
  for (const object of objects) {
    const serialized = serializeTransitionObject(object);
    const existing = overlay.get(serialized.descriptor.digest);
    const bytes = textEncoder.encode(serialized.canonicalJson);
    if (existing !== undefined && textDecoder.decode(existing) !== serialized.canonicalJson) {
      throw new TypeError(`Conflicting protocol bytes for ${serialized.descriptor.digest}`);
    }
    overlay.set(serialized.descriptor.digest, bytes);
  }
  return new OverlayObjectResolver(overlay, fallback);
}

export interface CreateCommitV2Input {
  parents: readonly CommitDescriptor[];
  decision: DecisionStatement;
  resolver: ObjectResolver;
}

export interface VerifiedDecisionGraph {
  decision: DecisionStatement;
  proposal: ProposalStatement;
  effect: Effect;
}

/** Resolve and verify the typed Decision -> Proposal -> Effect chain for any outcome. */
export async function verifyDecisionGraph(
  decision: DecisionStatement,
  resolver: ObjectResolver
): Promise<VerifiedDecisionGraph> {
  const parsedDecision = parseDecisionStatement(decision);
  const decisionResolver = overlayTransitionObjects(resolver, [parsedDecision]);
  const proposal = parseProposalStatement(
    await resolveProtocolObject(decisionResolver, parsedDecision.subjects[0])
  );
  const effect = parseEffect(await resolveProtocolObject(decisionResolver, proposal.subjects[0]));
  return { decision: parsedDecision, proposal, effect };
}

/**
 * Build the minimal immutable CommitV2 object and verify its complete structural chain.
 * Repository authorization and branch advancement intentionally remain separate.
 */
export async function createCommitV2(input: CreateCommitV2Input): Promise<CommitV2> {
  const decisionDescriptor = describeProtocolObject(input.decision);
  const resolver = overlayTransitionObjects(input.resolver, [input.decision]);
  const { effect } = await verifyDecisionGraph(input.decision, resolver);
  const commit = parseCommitV2({
    schema: 't3x/commit/v2',
    parents: input.parents.map((parent) => ({ ...parent })),
    decision: decisionDescriptor,
    result: { ...effect.result },
  });
  await verifyCommitIntegrity(commit, resolver);
  return commit;
}

export function describeCommitV2(commit: CommitV2): CommitDescriptor {
  return describeProtocolObject(parseCommitV2(commit));
}

export async function verifyCommitV2(
  commit: CommitV2,
  resolver: ObjectResolver
): Promise<VerifiedCommitIntegrity> {
  return verifyCommitIntegrity(parseCommitV2(commit), resolver);
}
