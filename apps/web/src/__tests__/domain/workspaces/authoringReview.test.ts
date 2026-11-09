import { describe, expect, it } from 'vitest';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import {
  authoringReviewDocuments,
  authoringReviewOperations,
  authoringSemanticPath,
  authoringVisibleCards,
  buildAuthoringReviewProjection,
} from '@/domain/workspaces/authoringReview';

const current = {
  domain: 't3x.dev/semantic-content',
  version: 1,
  content: {
    trees: [
      {
        key: 'prd',
        slots: {},
        children: [
          {
            key: 'requirements',
            slots: {},
            children: [{ key: 'weather', slots: { title: '天气为晴天' }, children: [] }],
          },
        ],
      },
    ],
    relations: [],
  },
};

const cards = [
  {
    nodeId: 'weather',
    path: 'content/trees/[key=prd]/children/[key=requirements]/children/[key=weather]/slots/title',
    after: '天气为晴天',
  },
  { nodeId: 'domain', path: 'domain', after: 't3x.dev/semantic-content' },
  { nodeId: 'version', path: 'version', after: 1 },
  { nodeId: 'content', path: 'content', after: current.content },
];

describe('authoringReview', () => {
  it.each([
    'sha256:current-base',
    null,
  ])('uses the same authoring basis for the content and its identity: %s', (refHead) => {
    const candidate = {
      ...getProjectWorkspaceStarterCandidate('proj_1'),
      baseCommitHash: 'sha256:old-base',
      targetBranch: 'old-branch',
      revision: 2,
    };
    const projection = buildAuthoringReviewProjection(
      candidate,
      {
        schema: 't3x.application/workspace-authoring-view/v1',
        projectionVersion: 1,
        workspaceRevision: 9,
        compositionRevision: 3,
        basis: { refName: 'current-branch', refHead, baseDigest: 'current-state' },
        actions: [],
        selected: null,
        node: null,
        nextBeforeSequence: null,
        base: { title: 'Current base' },
        current: { title: 'Current draft' },
        netDiff: [],
      },
      { content: null, deterministicValidation: null }
    );
    expect(projection?.candidate).toMatchObject({
      baseCommitHash: refHead,
      targetBranch: 'current-branch',
      revision: 9,
    });
    expect(projection?.review.deterministicValidation?.baselineTrees).toHaveLength(1);
    expect(candidate.baseCommitHash).toBe('sha256:old-base');
  });

  it('projects ordinary YAML documents without rewriting their authoring paths', () => {
    const raw = { prd: { experiments: { owner: 'Alice', hypothesis: 'Keep this evidence' } } };
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    const projection = buildAuthoringReviewProjection(
      candidate,
      {
        schema: 't3x.application/workspace-authoring-view/v1',
        projectionVersion: 1,
        workspaceRevision: 4,
        compositionRevision: 2,
        basis: { refName: 'main', refHead: null, baseDigest: 'empty' },
        actions: [],
        selected: null,
        node: null,
        nextBeforeSequence: null,
        base: {},
        current: raw,
        netDiff: [{ nodeId: 'prd', path: 'prd', after: raw.prd }],
      },
      { content: null, deterministicValidation: null }
    );
    expect(projection?.review.content).toEqual({
      trees: [
        {
          key: 'prd',
          slots: {},
          children: [{ key: 'experiments', slots: raw.prd.experiments, children: [] }],
        },
      ],
      relations: [],
    });
    expect(projection?.candidate.yopsDraft.operations[0]?.path).toBe('prd');
    expect(raw.prd.experiments.owner).toBe('Alice');
    expect(
      authoringReviewDocuments({
        base: {},
        current: { domain: 't3x.dev/semantic-content', content: {} },
      })
    ).toBeNull();
  });
  it('projects an empty repository base onto the current authoring tree', () => {
    const documents = authoringReviewDocuments({
      base: {},
      current,
    });
    expect(documents?.baseline).toEqual({ trees: [], relations: [] });
    expect(documents?.current.trees[0]?.key).toBe('prd');
    expect(authoringSemanticPath(cards[0]!.path)).toBe('prd/requirements/weather/title');
    expect(authoringVisibleCards(cards).map((card) => card.path)).toEqual([
      cards[0]!.path,
      'domain',
      'version',
    ]);
    expect(authoringReviewOperations(cards).map((operation) => operation.path)).toEqual([
      'prd/requirements/weather/title',
      'domain',
      'version',
    ]);
  });
  it('keeps a missing or unreadable Before distinct from an empty Base', () => {
    expect(authoringReviewDocuments({ current })).toBeNull();
    expect(authoringReviewDocuments({ base: null, current })).toBeNull();
  });

  it('keeps the authoring review projection when the recorded base is empty', () => {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    const projection = buildAuthoringReviewProjection(
      candidate,
      {
        schema: 't3x.application/workspace-authoring-view/v1',
        projectionVersion: 1,
        workspaceRevision: 4,
        compositionRevision: 2,
        basis: { refName: 'main', refHead: null, baseDigest: 'empty' },
        actions: [],
        selected: null,
        netDiff: cards,
        node: null,
        nextBeforeSequence: null,
        base: {},
        current,
      },
      {
        changeProjection: null,
        content: null,
        deterministicValidation: null,
        precondition: null,
        reviewSnapshot: null,
        transitionId: null,
        view: null,
      }
    );
    expect(projection).not.toBeNull();
    expect(projection?.candidate.yopsDraft.operations[0]?.afterValue).toBe('天气为晴天');
    expect(projection?.review.deterministicValidation?.previewTrees?.[0]?.key).toBe('prd');
  });
});
