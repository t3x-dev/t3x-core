// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/chat/ScriptEditor', () => ({
  ScriptEditor: () => <div data-testid="mobile-script-editor">YOps editor</div>,
}));

vi.mock('@/components/chat/AfterPanel', () => ({
  AfterPanel: ({ onContinueEditing }: { onContinueEditing?: () => void }) => (
    <div data-testid="mobile-after-panel">
      Result panel
      <button type="button" onClick={onContinueEditing}>
        Continue editing
      </button>
    </div>
  ),
}));

import { MobileWorkspaceSheet } from '@/components/chat/MobileWorkspaceSheet';

describe('MobileWorkspaceSheet', () => {
  it('keeps Chat, YOps, and Result available through a compact segmented control', () => {
    render(<MobileWorkspaceSheet />);

    expect(screen.getByRole('tablist', { name: 'Mobile workspace views' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'YOps' }));

    expect(screen.getByRole('tab', { name: 'YOps' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('dialog', { name: 'YOps' })).toBeVisible();
    expect(screen.getByTestId('mobile-script-editor')).toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: 'Result' }));

    expect(screen.getByRole('tab', { name: 'Result' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('dialog', { name: 'Result' })).toBeVisible();
    expect(screen.getByTestId('mobile-after-panel')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Continue editing' }));

    expect(screen.getByRole('dialog', { name: 'YOps' })).toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true');
  });
});
