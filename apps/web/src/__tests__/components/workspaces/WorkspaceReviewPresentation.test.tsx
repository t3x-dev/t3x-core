// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkspaceReviewComparison } from '@/components/workspaces/WorkspaceReviewComparison';
import { WorkspaceReviewValidation } from '@/components/workspaces/WorkspaceReviewValidation';
import type { ChangeCheckRow } from '@/domain/workspaces/changeDecision';

describe('Review presentation', () => {
  it('does not turn absent checks into success, and filters real failures without changing totals', () => {
    const rendered = render(<WorkspaceReviewValidation checks={[]} />);
    expect(screen.getByText('Not prepared')).toBeVisible();
    expect(screen.queryByText(/checks complete/)).toBeNull();
    rendered.rerender(<WorkspaceReviewValidation checks={[]} running />);
    expect(screen.getByText('Preparing…')).toBeVisible();
    const checks: ChangeCheckRow[] = [
      {
        id: 'integrity',
        label: 'Integrity',
        status: 'passed',
        summary: 'Recorded integrity.',
        findings: [],
      },
      {
        id: 'replay',
        label: 'Replay',
        status: 'failed',
        summary: 'Replay mismatch.',
        findings: [{ code: 'MISMATCH', path: 'doc/title', message: 'Result differs.', count: 1 }],
      },
      {
        id: 'validation',
        label: 'Schema',
        status: 'not_applicable',
        summary: 'No Schema applies.',
        findings: [],
      },
      {
        id: 'runner',
        label: 'Runner',
        status: 'missing',
        summary: 'No run recorded.',
        findings: [],
      },
    ];
    rendered.rerender(<WorkspaceReviewValidation checks={checks} />);
    expect(screen.getByText('1 failed')).toBeVisible();
    expect(screen.getByText('2 of 3 checks complete')).toBeVisible();
    fireEvent.click(screen.getByText('Validation'));
    fireEvent.click(screen.getByRole('button', { name: 'Failed (1)' }));
    expect(screen.getByText(/Result differs/)).toBeVisible();
    expect(screen.queryByText('Recorded integrity.')).toBeNull();
    expect(screen.getByText('2 of 3 checks complete')).toBeVisible();
    rendered.rerender(<WorkspaceReviewValidation checks={[checks[0]]} />);
    expect(screen.getByText('Checks passed')).toBeVisible();
    expect(screen.getByText('No failed checks recorded.')).toBeVisible();
  });

  it('keeps an unknown baseline distinct from additions and shows complete selected values', () => {
    const longValue = 'Long content '.repeat(70);
    const rendered = render(
      <WorkspaceReviewComparison
        before={undefined}
        after={{ title: longValue }}
        subject="Content"
        versionLabel="Fixed Review r3"
      />
    );
    expect(screen.getByText(/comparison is unavailable/)).toBeVisible();
    expect(screen.queryByRole('table')).toBeNull();
    rendered.rerender(
      <WorkspaceReviewComparison
        before={{ keep: false, removed: null }}
        after={{ keep: false, title: longValue }}
        subject="Content"
        versionLabel="Fixed Review r3"
      />
    );
    const table = screen.getByRole('table', { name: 'Content field changes' });
    expect(within(table).getByText(longValue.trim()).closest('td')).toHaveAttribute('colspan', '2');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect title' }));
    const details = screen.getByRole('complementary', { name: 'Content field Details' });
    expect(details).toHaveTextContent(longValue.trim());
    expect(details).toHaveTextContent('Fixed Review r3');
    expect(within(details).queryByRole('heading', { name: 'Before' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect removed' }));
    expect(details).toHaveTextContent('null');
    expect(within(details).queryByRole('heading', { name: 'After' })).toBeNull();
  });

  it('collapses array roots and resets selection to available fields when the revision changes', () => {
    const rendered = render(
      <WorkspaceReviewComparison
        before={[]}
        after={[{ title: 'New' }]}
        subject="Schema"
        versionLabel="Candidate r1"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Toggle (root)', exact: true }));
    expect(screen.queryByRole('button', { name: /Inspect.*title/ })).toBeNull();
    rendered.rerender(
      <WorkspaceReviewComparison
        before={{ old: 1 }}
        after={{ new: 2 }}
        subject="Schema"
        versionLabel="Candidate r2"
      />
    );
    expect(screen.getByRole('complementary')).toHaveTextContent('Candidate r2');
    expect(screen.queryByText('New', { exact: true })).toBeNull();
  });
});
