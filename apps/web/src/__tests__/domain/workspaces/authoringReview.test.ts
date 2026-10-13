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
