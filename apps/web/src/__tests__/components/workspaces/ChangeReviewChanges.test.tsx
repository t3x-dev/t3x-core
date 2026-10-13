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
  it('keeps field changes in a keyboard-accessible scroll area', () => {
    render(
      <ChangeReviewChanges
        groups={groups}
        operations={[{ op: 'set', path: ['candidate', 'title'], value: 'Knowledge assistant' }]}
      />
    );

    const scroller = screen.getByRole('region', { name: 'Field changes' });
    expect(scroller).toHaveAttribute('tabindex', '0');
    expect(scroller.closest('[data-slot="state-scroll-area"]')).toHaveClass(
      'h-[clamp(18rem,calc(100dvh-28rem),40rem)]'
    );
    expect(screen.getByLabelText('Vertical scrollbar')).toBeInTheDocument();
    expect(within(scroller).getByText('Knowledge assistant')).toBeInTheDocument();
  });

  it('preserves the scroll area when switching to operations', () => {
    render(
      <ChangeReviewChanges
        groups={groups}
        operations={[{ op: 'set', path: ['candidate', 'title'], value: 'Knowledge assistant' }]}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: /Operations/ }));

    const scroller = screen.getByRole('region', { name: 'Operations' });
    expect(within(scroller).getByText('SET candidate/title')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Operations/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});
