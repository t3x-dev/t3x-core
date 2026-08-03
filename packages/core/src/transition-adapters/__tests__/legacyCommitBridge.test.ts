import { describe, expect, it } from 'vitest';
import { type Commit, describeTransitionObject, type VerifiedCommitIntegrity } from '../..';
import {
  assertLegacyCommitBridgeIntegrity,
  createLegacyCommitBridgeSubject,
  LEGACY_COMMIT_EVIDENCE_SCHEME,
  LEGACY_COMMIT_RESOURCE_MEDIA_TYPE,
} from '../legacyCommitBridge';

function legacyCommit(): Commit {
  return {
    hash: `sha256:${'a'.repeat(64)}`,
    schema: 't3x/commit',
    parents: [],
    author: { type: 'human', id: 'human:legacy' },
    committed_at: '2026-08-01T00:00:00.000Z',
    content: {
      trees: [
        {
          key: 'service',
          slots: { name: 'api', replicas: 3 },
          children: [],
        },
      ],
      relations: [
        {
          from: 'service',
          to: 'deployment',
          type: 'depends_on',
        },
      ],
    },
    project_id: 'project:one',
    message: 'Legacy state',
    branch: 'main',
    provenance: null,
    yops_log_ids: [],
  };
}

function verifiedBridge(): VerifiedCommitIntegrity {
  const legacy = legacyCommit();
  const subject = createLegacyCommitBridgeSubject({ projectId: legacy.project_id, commit: legacy });
  return {
    commit: {
      schema: 't3x/commit/v2',
      parents: [],
      decision: {
        kind: 'statement',
        schema: 't3x/statement/v1',
        digest: `sha256:${'d'.repeat(64)}`,
      },
      result: describeTransitionObject(subject.imported),
    },
    decision: {
      schema: 't3x/statement/v1',
      subjects: [
        {
          kind: 'statement',
          schema: 't3x/statement/v1',
          digest: `sha256:${'b'.repeat(64)}`,
        },
      ],
      actor: { kind: 'service', id: 'service:migration' },
      predicateType: 't3x.decision/v1',
      predicate: {
        outcome: 'accepted',
        policy: {
          mode: 'evaluated',
          resource: {
            uri: 't3x://policies/legacy-bridge/v1',
            mediaType: 'application/vnd.t3x.acceptance-policy+json',
            digest: `sha256:${'c'.repeat(64)}`,
          },
        },
        considered: [],
        rationale: { mode: 'unspecified' },
        decidedAt: '2026-08-01T00:00:01.000Z',
      },
    },
    proposal: {
      schema: 't3x/statement/v1',
      subjects: [describeTransitionObject(subject.effect)],
      actor: { kind: 'service', id: 'service:migration' },
      predicateType: 't3x.proposal/v1',
      predicate: {
        intent: {
          mode: 'authored',
          value: 'Preserve the exact legacy branch state as a CommitV2 starting point',
          evidence: [subject.evidence],
        },
        rationale: { mode: 'unspecified' },
      },
    },
    effect: subject.effect,
    parents: [],
  };
}

describe('CommitV1 bridge adapter', () => {
  it('imports only the structured document and binds the complete legacy commit as evidence', () => {
    const legacy = legacyCommit();
    const subject = createLegacyCommitBridgeSubject({
      projectId: legacy.project_id,
      commit: legacy,
    });

    expect(subject.imported.value).toEqual({ service: { name: 'api', replicas: 3 } });
    expect(JSON.stringify(subject.imported.value)).not.toContain('depends_on');
    expect(subject.evidence).toEqual({
      resource: {
        uri: `t3x://projects/project%3Aone/legacy-commits/${legacy.hash}`,
        mediaType: LEGACY_COMMIT_RESOURCE_MEDIA_TYPE,
        digest: legacy.hash,
      },
      locator: {
        scheme: LEGACY_COMMIT_EVIDENCE_SCHEME,
        value: {
          commitHash: legacy.hash,
          projectId: legacy.project_id,
          projection: 'structured-document-trees',
        },
      },
    });
  });

  it('accepts only the exact parentless import Effect with exact archive evidence', () => {
    const verified = verifiedBridge();
    expect(() =>
      assertLegacyCommitBridgeIntegrity({
        projectId: 'project:one',
        legacyCommit: legacyCommit(),
        verified,
      })
    ).not.toThrow();

    expect(() =>
      assertLegacyCommitBridgeIntegrity({
        projectId: 'project:one',
        legacyCommit: legacyCommit(),
        verified: {
          ...verified,
          proposal: {
            ...verified.proposal,
            predicate: {
              ...verified.proposal.predicate,
              intent: { mode: 'authored', value: 'Import it', evidence: [] },
            },
          },
        },
      })
    ).toThrowError(/exact CommitV1 archive evidence/);
  });

  it('rejects cross-project and malformed legacy identity', () => {
    expect(() =>
      createLegacyCommitBridgeSubject({ projectId: 'project:other', commit: legacyCommit() })
    ).toThrowError(/does not belong/);
    expect(() =>
      createLegacyCommitBridgeSubject({
        projectId: 'project:one',
        commit: { ...legacyCommit(), hash: 'legacy-hash' },
      })
    ).toThrowError(/lowercase sha256/);
  });
});
