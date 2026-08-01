import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PROVENANCE_LINK_OWNERS = [
  'components/commit/CommitTreeIndex.tsx',
  'components/commit/CommitProvenanceGraph.tsx',
  'components/commit/SourceSlideIn.tsx',
  'components/commit/CommitOperationsSidebar.tsx',
  'app/deploy/eval/[runId]/page.tsx',
];

describe('repository source evidence links', () => {
  it('keeps every production provenance owner off legacy Chat destinations', () => {
    const offenders = PROVENANCE_LINK_OWNERS.filter((relativePath) => {
      const source = readFileSync(join(__dirname, '..', '..', relativePath), 'utf8');
      return /href\s*=\s*(?:\{|)[^\n]*\/chat\//.test(source);
    });

    expect(offenders).toEqual([]);
  });
});
