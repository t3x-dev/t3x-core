import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/api/commits', () => ({
  createCommit: vi.fn(),
  listCommits: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/api/trees', () => ({
  createYOpsEntry: vi.fn(),
}));

import { useExtractionPanelStore } from '@/store/extractionPanelStore';

function getState() {
  return useExtractionPanelStore.getState();
}

describe('extractionPhase state machine', () => {
  beforeEach(() => {
    getState().resetDraft();
    useExtractionPanelStore.setState({
      extractionPhase: 'idle',
      pendingYOps: [],
      acceptedNodeIds: new Set(),
      dismissedNodeIds: new Set(),
      nodeSourceTags: {},
      turnsSinceLastExtract: 0,
    });
  });

  test('initial phase is idle', () => {
    expect(getState().extractionPhase).toBe('idle');
  });

  test('startExtraction sets isExtracting but keeps phase idle', () => {
    getState().startExtraction();
    expect(getState().extractionPhase).toBe('idle');
    expect(getState().isExtracting).toBe(true);
  });

  test('completeYOps transitions yops → triage', () => {
    useExtractionPanelStore.setState({ extractionPhase: 'yops' });
    getState().completeYOps();
    expect(getState().extractionPhase).toBe('triage');
    expect(getState().isExtracting).toBe(false);
  });

  test('goToReview transitions triage → review', () => {
    useExtractionPanelStore.setState({ extractionPhase: 'triage' });
    getState().goToReview();
    expect(getState().extractionPhase).toBe('review');
  });

  test('goBackToTriage transitions review → triage', () => {
    useExtractionPanelStore.setState({ extractionPhase: 'review' });
    getState().goBackToTriage();
    expect(getState().extractionPhase).toBe('triage');
  });

  test('startCommitting transitions review → committing', () => {
    useExtractionPanelStore.setState({ extractionPhase: 'review' });
    getState().startCommitting();
    expect(getState().extractionPhase).toBe('committing');
  });

  test('completeCommit transitions committing → idle', () => {
    useExtractionPanelStore.setState({ extractionPhase: 'committing' });
    getState().completeCommit();
    expect(getState().extractionPhase).toBe('idle');
  });

  test('setPendingYOps stores raw YOps for feed animation', () => {
    const ops = [{ add: { parent: '', node: { key: 'test' }, source: {}, from: 'T1' } }];
    getState().setPendingYOps(ops);
    expect(getState().pendingYOps).toEqual(ops);
  });
});

describe('triage accept/dismiss', () => {
  beforeEach(() => {
    useExtractionPanelStore.setState({
      acceptedNodeIds: new Set(),
      dismissedNodeIds: new Set(),
    });
  });

  test('acceptNode adds to accepted, removes from dismissed', () => {
    useExtractionPanelStore.setState({ dismissedNodeIds: new Set(['budget']) });
    getState().acceptNode('budget');
    expect(getState().acceptedNodeIds.has('budget')).toBe(true);
    expect(getState().dismissedNodeIds.has('budget')).toBe(false);
  });

  test('dismissNode adds to dismissed, removes from accepted', () => {
    useExtractionPanelStore.setState({ acceptedNodeIds: new Set(['budget']) });
    getState().dismissNode('budget');
    expect(getState().dismissedNodeIds.has('budget')).toBe(true);
    expect(getState().acceptedNodeIds.has('budget')).toBe(false);
  });

  test('acceptAll moves all draft tree keys to accepted', () => {
    useExtractionPanelStore.setState({
      draft: {
        trees: [
          { key: 'a', slots: {}, children: [] },
          { key: 'b', slots: {}, children: [] },
          { key: 'c', slots: {}, children: [] },
        ],
        relations: [],
      },
      dismissedNodeIds: new Set(['c']),
    });
    getState().acceptAll();
    const { acceptedNodeIds, dismissedNodeIds } = getState();
    expect(acceptedNodeIds.has('a')).toBe(true);
    expect(acceptedNodeIds.has('b')).toBe(true);
    expect(acceptedNodeIds.has('c')).toBe(true);
    expect(dismissedNodeIds.size).toBe(0);
  });

  test('undismissNode removes from dismissed without accepting', () => {
    useExtractionPanelStore.setState({ dismissedNodeIds: new Set(['x']) });
    getState().undismissNode('x');
    expect(getState().dismissedNodeIds.has('x')).toBe(false);
    expect(getState().acceptedNodeIds.has('x')).toBe(false);
  });

  test('turnsSinceLastExtract increments', () => {
    useExtractionPanelStore.setState({ turnsSinceLastExtract: 0 });
    getState().incrementTurnsSinceLastExtract();
    expect(getState().turnsSinceLastExtract).toBe(1);
    getState().incrementTurnsSinceLastExtract();
    expect(getState().turnsSinceLastExtract).toBe(2);
  });

  test('startExtraction resets turnsSinceLastExtract', () => {
    useExtractionPanelStore.setState({ turnsSinceLastExtract: 7 });
    getState().startExtraction();
    expect(getState().turnsSinceLastExtract).toBe(0);
  });
});
