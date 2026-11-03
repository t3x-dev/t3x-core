// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChangeReviewChanges } from '@/components/workspaces/ChangeReviewChanges';

const groups = [
  {
    id: 'candidate',
    label: 'Knowledge assistant',
    breadcrumb: 'Candidate / Requirements',
    kind: 'added' as const,
    fields: [
      {
        name: 'Acceptance',
        before: undefined,
        after: 'People can retrieve every relevant knowledge item.',
        kind: 'added' as const,
      },
    ],
  },
];

describe('ChangeReviewChanges', () => {
  it('lets field changes grow with the Review page', () => {
    render(
      <ChangeReviewChanges
        groups={groups}
        operations={[{ op: 'set', path: ['candidate', 'title'], value: 'Knowledge assistant' }]}
      />
    );

    const fields = screen.getByRole('region', { name: 'Field changes' });
    expect(fields.closest('[data-slot="state-scroll-area"]')).toBeNull();
    expect(screen.queryByLabelText('Vertical scrollbar')).not.toBeInTheDocument();
    expect(within(fields).getByText('Knowledge assistant')).toBeInTheDocument();
  });

  it('keeps operations in the same page flow', () => {
    render(
      <ChangeReviewChanges
        groups={groups}
        operations={[{ op: 'set', path: ['candidate', 'title'], value: 'Knowledge assistant' }]}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: /Operations/ }));

    const scroller = screen.getByRole('region', { name: 'Operations' });
    expect(within(scroller).getByText('SET candidate/title')).toBeInTheDocument();
    expect(scroller.closest('[data-slot="state-scroll-area"]')).toBeNull();
    expect(screen.getByRole('tab', { name: /Operations/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});
