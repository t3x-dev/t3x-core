import { describe, expect, it } from 'vitest';
import {
  MergeDraftDecisionIntegrityError,
  readMergeDraftDecision,
} from '../lib/merge-draft-decisions';

const decision = {
  conflictResolutions: { service: 'source' as const },
  keepFromSource: ['new-service'],
  keepFromTarget: [],
  keepRelationsFromSource: true,
  keepRelationsFromTarget: true,
};

describe('readMergeDraftDecision', () => {
  it('prefers the dedicated decision column', () => {
    expect(
      readMergeDraftDecision({
        preparedJson: JSON.stringify({ decisions: { invalid: true } }),
        decisionJson: JSON.stringify(decision),
      })
    ).toEqual(decision);
  });

  it('retains a read-only path for legacy embedded decisions', () => {
    expect(
      readMergeDraftDecision({
        preparedJson: JSON.stringify({ conflicts: [], decisions: decision }),
        decisionJson: null,
      })
    ).toEqual(decision);
  });

  it('fails closed for an invalid stored decision', () => {
    expect(() =>
      readMergeDraftDecision({
        preparedJson: JSON.stringify({ conflicts: [] }),
        decisionJson: JSON.stringify({ conflictResolutions: {} }),
      })
    ).toThrow(MergeDraftDecisionIntegrityError);
  });
});
