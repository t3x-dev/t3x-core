// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { PRESETS } from '@t3x-dev/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExtractionStylePanel } from '@/components/settings/ExtractionStylePanel';

describe('ExtractionStylePanel', () => {
  const balanced = PRESETS.balanced;

  it('renders preset buttons', () => {
    render(<ExtractionStylePanel value={balanced} onChange={vi.fn()} />);
    expect(screen.getByText('Concise')).toBeInTheDocument();
    expect(screen.getByText('Balanced')).toBeInTheDocument();
    expect(screen.getByText('Detailed')).toBeInTheDocument();
  });

  it('calls onChange with preset on click', () => {
    const onChange = vi.fn();
    render(<ExtractionStylePanel value={balanced} onChange={onChange} />);
    fireEvent.click(screen.getByText('Detailed'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ granularity: 'detailed' }));
  });

  it('shows global toggle when showGlobalToggle is true', () => {
    render(<ExtractionStylePanel value={null} onChange={vi.fn()} showGlobalToggle />);
    expect(screen.getByText('Use global default')).toBeInTheDocument();
  });

  it('toggles advanced panel when Advanced is clicked', () => {
    render(<ExtractionStylePanel value={balanced} onChange={vi.fn()} />);

    // Initially collapsed
    expect(screen.queryByText('Granularity')).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(screen.getByText('▸ Advanced'));
    expect(screen.getByText('Granularity')).toBeInTheDocument();
    expect(screen.getByText('Quote Length')).toBeInTheDocument();
    expect(screen.getByText('Update Stance')).toBeInTheDocument();
    expect(screen.getByText('AI Suggestions')).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(screen.getByText('▾ Advanced'));
    expect(screen.queryByText('Granularity')).not.toBeInTheDocument();
  });

  it('shows Custom badge when config does not match any preset', () => {
    const customConfig = {
      granularity: 'concise' as const,
      quote_length: 'contextual' as const, // Mismatch
      update_stance: 'conservative' as const,
      tier3: 'skip' as const,
    };
    render(<ExtractionStylePanel value={customConfig} onChange={vi.fn()} />);
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('calls onChange with updated dimension when advanced option is clicked', () => {
    const onChange = vi.fn();
    render(<ExtractionStylePanel value={balanced} onChange={onChange} />);

    // Expand advanced panel
    fireEvent.click(screen.getByText('▸ Advanced'));

    // Click on a different granularity option
    const detailedButtons = screen.getAllByText('Detailed');
    // The first is the preset button, the second is the granularity dimension
    fireEvent.click(detailedButtons[1]);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        granularity: 'detailed',
      })
    );
  });

  it('disables panel when global toggle is on', () => {
    render(<ExtractionStylePanel value={null} onChange={vi.fn()} showGlobalToggle />);

    // Panel should have pointer-events-none class - look for parent div with that class
    const conciseButton = screen.getByText('Concise');
    const parentDiv = conciseButton.parentElement?.parentElement;
    expect(parentDiv?.className).toContain('pointer-events-none');
  });

  it('toggles between global and custom when toggle is clicked', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ExtractionStylePanel value={null} onChange={onChange} showGlobalToggle />
    );

    // Initially using global (value is null)
    const toggle = screen.getByText('Use global default').previousSibling as HTMLElement;

    // Click to switch to custom
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(PRESETS.balanced);

    // Simulate switching back using rerender instead of second render
    onChange.mockClear();
    rerender(<ExtractionStylePanel value={balanced} onChange={onChange} showGlobalToggle />);
    const toggle2 = screen.getByText('Use global default').previousSibling as HTMLElement;
    fireEvent.click(toggle2);
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
