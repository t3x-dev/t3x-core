import {
  canonicalizeProtocolValue,
  type EvidenceRef,
  IntegrityChainInvalidError,
  type ProtocolValue,
  type VerifiedCommitIntegrity,
} from '@t3x-dev/transition';
import type { Commit } from '../commit';
import { treesToYValue } from '../t3x-yops';
import { createYOpsState } from './stateCodec';
import { createStateImportEffect } from './stateImportDriver';

export const LEGACY_COMMIT_RESOURCE_MEDIA_TYPE = 'application/vnd.t3x.commit-v1+json' as const;
export const LEGACY_COMMIT_EVIDENCE_SCHEME = 't3x.legacy-commit/v1' as const;

export interface LegacyCommitBridgeSubject {
  /** Explicit empty genesis required by a parentless CommitV2. */
  base: ReturnType<typeof createYOpsState>;
  /** Canonical structured-document projection of the immutable CommitV1 trees. */
  imported: ReturnType<typeof createYOpsState>;
  effect: ReturnType<typeof createStateImportEffect>['effect'];
  evidence: EvidenceRef;
}

function assertLegacyCommit(input: { projectId: string; commit: Commit }): void {
  if (input.commit.project_id !== input.projectId) {
    throw new IntegrityChainInvalidError('Legacy CommitV1 does not belong to the bridge project');
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(input.commit.hash)) {
    throw new IntegrityChainInvalidError('Legacy CommitV1 hash must be a lowercase sha256 digest');
  }
}

/**
 * Project an immutable CommitV1 into the only State that current YOps semantics
 * can replay: its structured document trees. Legacy relations remain in the
 * read-only CommitV1 archive and are bound as evidence; they are not fabricated
 * into the imported State.
 */
export function createLegacyCommitBridgeSubject(input: {
  projectId: string;
  commit: Commit;
}): LegacyCommitBridgeSubject {
  assertLegacyCommit(input);
  const base = createYOpsState({});
  const imported = createYOpsState(treesToYValue(input.commit.content.trees));
  const { effect } = createStateImportEffect({ base, imported });
  const evidence: EvidenceRef = {
    resource: {
      uri: `t3x://projects/${encodeURIComponent(input.projectId)}/legacy-commits/${input.commit.hash}`,
      mediaType: LEGACY_COMMIT_RESOURCE_MEDIA_TYPE,
      digest: input.commit.hash as `sha256:${string}`,
    },
    locator: {
      scheme: LEGACY_COMMIT_EVIDENCE_SCHEME,
      value: {
        commitHash: input.commit.hash,
        projectId: input.projectId,
        projection: 'structured-document-trees',
      },
    },
  };
  return { base, imported, effect, evidence };
}

function sameProtocolValue(left: unknown, right: unknown): boolean {
  return (
    canonicalizeProtocolValue(left as ProtocolValue) ===
    canonicalizeProtocolValue(right as ProtocolValue)
  );
}

/**
 * Verify the special parentless CommitV2 bridge against repository-owned
 * CommitV1 history. This is deliberately narrower than a generic legacy flag.
 */
export function assertLegacyCommitBridgeIntegrity(input: {
  projectId: string;
  legacyCommit: Commit;
  verified: VerifiedCommitIntegrity;
}): void {
  const expected = createLegacyCommitBridgeSubject({
    projectId: input.projectId,
    commit: input.legacyCommit,
  });
  if (input.verified.commit.parents.length !== 0) {
    throw new IntegrityChainInvalidError('A legacy bridge CommitV2 must be parentless');
  }
  if (!sameProtocolValue(input.verified.effect, expected.effect)) {
    throw new IntegrityChainInvalidError(
      'Legacy bridge Effect must import the exact CommitV1 structured-document State'
    );
  }
  const claims = [
    input.verified.proposal.predicate.intent,
    input.verified.proposal.predicate.rationale,
  ];
  const evidence = claims.flatMap((claim) =>
    claim.mode === 'unspecified' ? [] : [...claim.evidence]
  );
  if (!evidence.some((candidate) => sameProtocolValue(candidate, expected.evidence))) {
    throw new IntegrityChainInvalidError(
      'Legacy bridge Proposal must bind the exact CommitV1 archive evidence'
    );
  }
}
