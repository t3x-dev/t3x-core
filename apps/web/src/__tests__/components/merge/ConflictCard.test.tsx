// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConflictCard } from '@/components/merge/ConflictCard';

describe('ConflictCard', () => {
  it('uses voice-oriented merge decision labels', () => {
    render(
      <ConflictCard
        conflict={{
          treeId: 'plan',
          sourceNode: { key: 'plan', slots: { timing: 'launch Friday' }, children: [] },
          targetNode: { key: 'plan', slots: { timing: 'launch Monday' }, children: [] },
          slotConflicts: [
            {
              key: 'timing',
              sourceValue: 'launch Friday',
              targetValue: 'launch Monday',
            },
          ],
        }}
        decisionLabels={{
          source: 'Use feature',
          target: 'Use main',
          both: 'Keep both voices',
          edit: 'Edit voice',
        }}
        isActive={false}
        onResolve={vi.fn()}
        onSelect={vi.fn()}
        resolution={null}
      />
    );

    expect(screen.getByRole('button', { name: /Use feature/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /Use main/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /Keep both voices/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /Edit voice/i })).toBeVisible();
  });
});
