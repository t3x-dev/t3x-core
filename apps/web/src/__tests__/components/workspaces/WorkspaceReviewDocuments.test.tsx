// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceReviewContentPreview } from '@/components/workspaces/WorkspaceReviewDocuments';

const draft = {
  candidate: {
    checklist: { title: 'Revised checklist' },
    items: { item1: { done: false, task: 'Verify saved result', count: 0 } },
  },
};

describe('Workspace result field table', () => {
  it('uses the State columns and searches values with their ancestors even after collapsing', () => {
    render(<WorkspaceReviewContentPreview value={draft} />);
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Field',
      'Value',
      'Type',
    ]);
    expect(screen.getByText('false')).toBeVisible();
    expect(screen.getByText('0')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.queryByText('Verify saved result')).not.toBeInTheDocument();
    const search = screen.getByRole('textbox', { name: 'Find a field or value' });
    fireEvent.change(search, { target: { value: 'saved result' } });
    for (const label of ['candidate', 'items', 'item1', 'task', 'Verify saved result'])
      expect(screen.getByText(label, { exact: true })).toBeVisible();
    expect(screen.queryByText('checklist')).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.queryByText('Verify saved result')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getByText('Revised checklist')).toBeVisible();
  });

  it('preserves semantic paths for selecting a field and includes recorded relations', () => {
    const select = vi.fn();
    render(
      <WorkspaceReviewContentPreview
        onSelect={select}
        value={{
          domain: 't3x.dev/semantic-content',
          version: 1,
          content: {
            trees: [{ key: 'candidate', slots: { title: 'Exact draft' }, children: [] }],
            relations: [{ from: 'a', to: 'b', type: 'link' }],
          },
        }}
      />
    );
    const row = screen.getByText('Exact draft').closest('tr')!;
    fireEvent.click(row);
    expect(select).toHaveBeenCalledWith('content/trees/[key=candidate]/slots/title');
    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('relations', { exact: true })).toBeVisible();
    expect(screen.queryByText('t3x.dev/semantic-content')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByText('candidate').closest('tr')!, { key: 'Enter' });
    expect(screen.queryByText('Exact draft')).not.toBeInTheDocument();
  });

  it('keeps the frozen value distinct from the Draft and reports an unavailable snapshot', () => {
    const { rerender } = render(
      <WorkspaceReviewContentPreview frozen value={{ title: 'Frozen title' }} />
    );
    expect(screen.getByRole('heading', { name: 'Reviewed content' })).toBeVisible();
    expect(within(screen.getByRole('table')).getByText('Frozen title')).toBeVisible();
    rerender(<WorkspaceReviewContentPreview frozen value={undefined} />);
    expect(
      screen.getByText('The complete content is unavailable for this revision.')
    ).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
