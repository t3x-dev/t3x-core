// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LeafSemanticPointsPanel } from '@/components/leaf/LeafSemanticPointsPanel';

const points = [
  {
    id: 'trip',
    label: 'trip',
    included: true,
    owner_node_id: 'trip',
    root_tree_id: 'trip',
  },
  {
    id: 'trip/city',
    label: 'trip.city = Kyoto',
    included: true,
    owner_node_id: 'trip',
    root_tree_id: 'trip',
  },
  {
    id: 'trip/duration',
    label: 'trip.duration = 2 days',
    included: false,
    owner_node_id: 'trip',
    root_tree_id: 'trip',
  },
];

describe('LeafSemanticPointsPanel', () => {
  it('renders the included summary and checkbox state', () => {
    render(<LeafSemanticPointsPanel points={points} saving={false} onTogglePoint={vi.fn()} />);

    expect(screen.getByText('State Points')).toBeInTheDocument();
    expect(screen.getByText('2 / 3 included')).toBeInTheDocument();
    expect(screen.getByLabelText('trip')).toBeChecked();
    expect(screen.getByLabelText('trip.city = Kyoto')).toBeChecked();
    expect(screen.getByLabelText('trip.duration = 2 days')).not.toBeChecked();
  });

  it('calls onTogglePoint with the next included state', () => {
    const onTogglePoint = vi.fn();
    render(
      <LeafSemanticPointsPanel points={points} saving={false} onTogglePoint={onTogglePoint} />
    );

    fireEvent.click(screen.getByLabelText('trip.duration = 2 days'));
    fireEvent.click(screen.getByLabelText('trip.city = Kyoto'));

    expect(onTogglePoint).toHaveBeenNthCalledWith(1, 'trip/duration', true);
    expect(onTogglePoint).toHaveBeenNthCalledWith(2, 'trip/city', false);
  });
});
