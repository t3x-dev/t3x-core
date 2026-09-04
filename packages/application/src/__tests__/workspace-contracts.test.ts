import { describe, expect, it } from 'vitest';
import {
  deriveWorkspaceCurrentness,
  isWorkspacePrepareReviewTerminal,
  WORKSPACE_INTERACTION_CONTRACTS,
  WORKSPACE_REQUIRED_FEEDBACK,
  type WorkspaceReviewFingerprint,
  workspaceInteractionContractIssues,
} from '../workspace';

const fingerprint: WorkspaceReviewFingerprint = {
  draftRevision: 3,
  refHead: 'sha256:head',
  effectDigest: 'sha256:effect',
  proposalDigest: 'sha256:proposal',
  statementDigests: ['sha256:statement-a', 'sha256:statement-b'],
  policyDigest: 'sha256:policy',
};

describe('workspace interaction contracts', () => {
  it('defines one valid contract for every two-surface interaction', () => {
    expect(workspaceInteractionContractIssues()).toEqual([]);
    expect(WORKSPACE_INTERACTION_CONTRACTS.map((contract) => contract.id)).toEqual([
      'source.add',
      'source.open',
      'source.include',
      'source.pin',
      'instruction.update',
      'candidate.generate',
      'candidate.edit',
      'draft.save',
      'draft.retry',
      'review.prepare',
      'review.open_pane',
      'review.accept',
      'review.reject',
      'review.override',
      'commit.exact',
      'receipt.copy',
      'review.retry',
      'review.edit_in_compose',
      'scenario.create',
      'scenario.duplicate',
      'scenario.rename',
      'scenario.archive',
      'scenario.switch',
      'scenario.compare',
      'collaboration.refresh',
      'collaboration.review_remote_changes',
      'collaboration.keep_mine',
      'collaboration.apply_after_refresh',
    ]);
  });

  it('requires revision-safe command feedback for mutating Compose actions', () => {
    const mutatingComposeContracts = WORKSPACE_INTERACTION_CONTRACTS.filter(
      (contract) =>
        contract.surface === 'compose' &&
        contract.backend === 'command' &&
        contract.id !== 'collaboration.apply_after_refresh'
    );

    expect(mutatingComposeContracts.length).toBeGreaterThan(0);
    for (const contract of mutatingComposeContracts) {
      expect(contract.requiresRequestId, contract.id).toBe(true);
      expect(contract.requiresIfRevision, contract.id).toBe(true);
      for (const feedback of [...WORKSPACE_REQUIRED_FEEDBACK, 'conflict', 'retry'] as const) {
        expect(contract.feedback, contract.id).toContain(feedback);
      }
    }
  });

  it('keeps review tab and receipt copying as local view actions only', () => {
    expect(
      WORKSPACE_INTERACTION_CONTRACTS.filter((contract) => contract.backend === 'local_view').map(
        (contract) => contract.id
      )
    ).toEqual([
      'review.open_pane',
      'receipt.copy',
      'review.edit_in_compose',
      'collaboration.keep_mine',
    ]);
  });
});

describe('workspace prepare review contract', () => {
  it('marks only completed prepare states as terminal', () => {
    expect(isWorkspacePrepareReviewTerminal('queued')).toBe(false);
    expect(isWorkspacePrepareReviewTerminal('running')).toBe(false);
    expect(isWorkspacePrepareReviewTerminal('succeeded')).toBe(true);
    expect(isWorkspacePrepareReviewTerminal('failed')).toBe(true);
    expect(isWorkspacePrepareReviewTerminal('timed_out')).toBe(true);
    expect(isWorkspacePrepareReviewTerminal('canceled')).toBe(true);
  });
});

describe('workspace currentness contract', () => {
  it('treats branch head movement as stale even when the scenario draft is unchanged', () => {
    expect(
      deriveWorkspaceCurrentness({
        snapshot: fingerprint,
        current: { ...fingerprint, refHead: 'sha256:new-head' },
      })
    ).toEqual({ state: 'stale', reasons: ['ref_head_changed'] });
  });

  it('keeps a draft-only change scoped to its own snapshot revision', () => {
    expect(
      deriveWorkspaceCurrentness({
        snapshot: fingerprint,
        current: { ...fingerprint, draftRevision: 4 },
      })
    ).toEqual({ state: 'stale', reasons: ['draft_revision_changed'] });
  });

  it('does not let rejected decisions become commit-ready', () => {
    expect(
      deriveWorkspaceCurrentness({
        snapshot: { ...fingerprint, decisionOutcome: 'rejected' },
        current: fingerprint,
      })
    ).toEqual({ state: 'blocked', reasons: ['decision_rejected'] });
  });
});
