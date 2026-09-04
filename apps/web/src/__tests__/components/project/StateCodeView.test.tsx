// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StateCodeView } from '@/components/project/StateCodeView';

const yamlText = 'prd:\n  outcome: New';
const lines = [
  { text: 'prd:', path: 'prd', kind: 'unchanged' as const },
  { text: '  outcome: Old', path: 'prd/outcome', kind: 'removed' as const },
  { text: '  outcome: New', path: 'prd/outcome', kind: 'added' as const },
];

describe('shared StateCodeView', () => {
  it('preserves State typography, file header, formats and search', () => {
    render(<StateCodeView branch="main" rootKey="prd" validationReady yamlText={yamlText} />);
    const heading = screen.getByRole('heading', { name: 'prd-state.yaml' });
    expect(screen.getByLabelText('YAML code view')).toHaveClass('p-4');
    expect(screen.getByLabelText('YAML code view').firstElementChild).toHaveClass(
      'rounded-md',
      'border'
    );
    expect(heading).toHaveClass('text-[14px]', 'font-semibold');
    expect(heading.closest('header')).toHaveClass('min-h-[64px]', 'px-5');
    expect(screen.getByRole('region', { name: 'Canonical YAML content' })).toHaveClass(
      'text-[13px]',
      'leading-[22px]'
    );
    expect(screen.getByText('Valid Schema')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'JSON', exact: true }));
    expect(screen.getByRole('heading', { name: 'prd-state.json' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Find in code' }));
    fireEvent.change(screen.getByPlaceholderText('Find in code...'), { target: { value: 'New' } });
    expect(screen.getByText('1 matches')).toBeInTheDocument();
  });

  it('adds accessible diff selection without changing the base typography and copies only the result', async () => {
    const onSelectPath = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(
      <StateCodeView
        branch="main"
        rootKey="prd"
        validationReady={false}
        yamlText={yamlText}
        review={{
          lines,
          selectedPath: 'prd/outcome',
          onSelectPath,
          statusLabel: 'Draft preview — base not verified',
        }}
      />
    );
    const removed = screen.getByRole('button', { name: 'Select code path prd/outcome, line 2' });
    const codeView = screen.getByLabelText('YAML code view');
    expect(codeView).not.toHaveClass('p-4');
    expect(codeView.firstElementChild).not.toHaveClass('rounded-md');
    expect(codeView.firstElementChild).not.toHaveClass('border');
    expect(codeView.firstElementChild).not.toHaveClass('shadow-[var(--fx-shadow-sm)]');
    expect(removed).toHaveAttribute('data-diff-kind', 'removed');
    expect(removed).toHaveClass('min-h-[22px]');
    expect(removed.tagName).toBe('BUTTON');
    fireEvent.click(removed);
    expect(onSelectPath).toHaveBeenCalledWith('prd/outcome');
    expect(
      screen.getByRole('button', { name: 'Select code path prd/outcome, line 3' })
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Copy YAML result' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(yamlText));
    expect(screen.queryByText('Valid Schema')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'JSON', exact: true }));
    expect(screen.getByRole('region', { name: 'JSON code content' })).not.toHaveTextContent('Old');
    fireEvent.click(screen.getByRole('button', { name: /Select code path prd\/outcome, line/ }));
    expect(onSelectPath).toHaveBeenCalledTimes(2);
  });
});
