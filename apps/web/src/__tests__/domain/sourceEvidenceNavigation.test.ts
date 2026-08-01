import { describe, expect, it } from 'vitest';
import {
  isLegacyRepositorySourceLink,
  legacyRepositorySourceTarget,
  repositoryConversationSourceHref,
} from '@/domain/sourceEvidenceNavigation';

describe('source evidence navigation', () => {
  it('binds repository, source, commit, branch, turn, and return identity', () => {
    const href = repositoryConversationSourceHref({
      projectId: 'proj/one',
      conversationId: 'conv/one',
      branch: 'release/next',
      commitId: 'sha256:abc',
      turnHash: 'sha256:turn',
      returnTo: '/project/proj%2Fone/commit/sha256%3Aabc?tab=yaml',
    });

    expect(href).toBe(
      '/project/proj%2Fone/sources/conversations/conv%2Fone?branch=release%2Fnext&commit=sha256%3Aabc&turn=sha256%3Aturn&returnTo=%2Fproject%2Fproj%252Fone%2Fcommit%2Fsha256%253Aabc%3Ftab%3Dyaml'
    );
  });

  it('recognizes only explicit legacy provenance links', () => {
    expect(isLegacyRepositorySourceLink(new URLSearchParams({ view: 'source' }))).toBe(true);
    expect(isLegacyRepositorySourceLink(new URLSearchParams({ view: 'chat' }))).toBe(false);
    expect(isLegacyRepositorySourceLink(new URLSearchParams())).toBe(false);
  });

  it('preserves legacy provenance context in the repository target', () => {
    const target = legacyRepositorySourceTarget(
      'proj_1',
      'conv_1',
      new URLSearchParams({
        view: 'source',
        branch: 'main',
        commit: 'sha256:commit',
        turn: 'sha256:turn',
        returnTo: '/deploy/eval/run_1',
      })
    );

    expect(target).toBe(
      '/project/proj_1/sources/conversations/conv_1?branch=main&commit=sha256%3Acommit&turn=sha256%3Aturn&returnTo=%2Fdeploy%2Feval%2Frun_1'
    );
  });
});
