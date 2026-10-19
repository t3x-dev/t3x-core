// @vitest-environment jsdom
import '@testing-library/jest-dom';
import type { WorkspaceFullSchemaReview } from '@t3x-dev/api-client';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { WorkspaceSchemaReviewPanel } from '@/components/workspaces/WorkspaceSchemaReviewPanel';

const projection: WorkspaceFullSchemaReview = {
  schema: 't3x.application/workspace-schema-review/v1',
  base: { status: 'unbound', schemaHash: null, definition: null, bindings: [] },
  draft: {
    status: 'bound',
    schemaHash: `sha256:${'a'.repeat(64)}`,
    definition: { nodes: { advantage: {} } },
    bindings: [],
  },
  actionCount: 3,
  changes: [{ kind: 'ADD', path: 'nodes.advantage', summary: 'Contract path added.' }],
  baseContent: { title: 'Committed title' },
  draftContent: { title: 'Earlier Draft edit', advantage: 'New content' },
};
it('renders exact frozen definitions, complete contents, action count and Hash together', () => {
  render(<WorkspaceSchemaReviewPanel review={projection} />);
  expect(screen.getByText(/3 Draft actions/)).toBeInTheDocument();
  expect(screen.getByText('ADD nodes.advantage')).toBeInTheDocument();
  expect(screen.getByText(projection.draft.schemaHash!)).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Base content', hidden: true })).toHaveTextContent(
    'Committed title'
  );
  expect(
    screen.getByRole('region', { name: 'Complete Draft content', hidden: true })
  ).toHaveTextContent('Earlier Draft edit');
});
it('labels unavailable legacy Base honestly, without presenting an invented diff', () => {
  render(
    <WorkspaceSchemaReviewPanel
      review={{ ...projection, base: { ...projection.base, status: 'unknown' }, changes: [] }}
      historical
    />
  );
  expect(screen.getByText(/Historical complete Review/)).toBeInTheDocument();
  expect(screen.getByRole('alert', { hidden: true })).toHaveTextContent(
    'Accept and Commit are blocked'
  );
  expect(screen.queryByText('No Schema definition changes.')).not.toBeInTheDocument();
});
