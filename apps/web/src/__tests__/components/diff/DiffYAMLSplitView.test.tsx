// @vitest-environment jsdom

import '@testing-library/jest-dom';
import type { SemanticContent, TreeDiff } from '@t3x-dev/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DiffYAMLSplitView } from '@/components/diff/DiffYAMLSplitView';

const targetContent: SemanticContent = {
  trees: [
    {
      key: 'food_ideas',
      slots: {
        fresh: ['sushi', 'tacos'],
      },
      children: [],
    },
  ],
  relations: [],
};

const addedDiff: TreeDiff = {
  identical: [],
  modified: [],
  onlyInSource: [],
  onlyInTarget: ['food_ideas'],
  relationsAdded: [],
  relationsRemoved: [],
};

describe('DiffYAMLSplitView', () => {
  it('labels split-pane placeholders so added content does not look unloaded', () => {
    render(
      <DiffYAMLSplitView
        diff={addedDiff}
        targetContent={targetContent}
        activeNodeId={null}
        onSelectNode={vi.fn()}
        showIdentical={false}
      />
    );

    expect(screen.getByText('Not present in base')).toBeVisible();
  });
});
