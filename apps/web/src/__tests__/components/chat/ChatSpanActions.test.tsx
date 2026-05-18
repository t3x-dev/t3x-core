// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSpanActions } from '@/components/chat/ChatSpanActions';
import type { TextSelectionResult } from '@/hooks/shared/useTextSelection';

const mocks = vi.hoisted(() => ({
  applySourceTextEdit: vi.fn(),
}));

vi.mock('@/hooks/shared/useSourceTextDraft', () => ({
  useSourceTextDraft: () => ({
    applySourceTextEdit: mocks.applySourceTextEdit,
    pending: false,
    enabled: true,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
    warning: vi.fn(),
  },
}));

function selection(): TextSelectionResult {
  return {
    text: 'psychology',
    turnHash: 'turn_1',
    turnRole: 'assistant',
    turnText: 'Soccer taps into psychology.',
    startChar: 10,
    endChar: 20,
    rect: new DOMRect(),
  };
}

describe('ChatSpanActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.applySourceTextEdit.mockResolvedValue({
      revisionId: 'str_test',
      opCount: 1,
      status: 'patched',
    });
  });

  it('lets the user edit selected source text before confirming', async () => {
    render(<ChatSpanActions selection={selection()} onDone={vi.fn()} />);

    fireEvent.click(screen.getByText('Replace'));
    fireEvent.change(screen.getByDisplayValue('psychology'), {
      target: { value: 'group psychology' },
    });
    fireEvent.click(screen.getByText('Save & Generate YOps'));

    await waitFor(() => {
      expect(mocks.applySourceTextEdit).toHaveBeenCalledWith({
        action: 'edit',
        turnHash: 'turn_1',
        turnRole: 'assistant',
        text: 'psychology',
        turnText: 'Soccer taps into psychology.',
        start: 10,
        end: 20,
        replacementText: 'group psychology',
      });
    });
  });

  it('stages delete through the same confirm path', async () => {
    render(<ChatSpanActions selection={selection()} onDone={vi.fn()} />);

    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByText('Save & Generate YOps'));

    await waitFor(() => {
      expect(mocks.applySourceTextEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete',
          text: 'psychology',
        })
      );
    });
  });

  it('keeps popover pointer events from bubbling to the selection listener container', () => {
    const onMouseDown = vi.fn();
    const onMouseUp = vi.fn();
    const onDocumentMouseDown = vi.fn();
    const onDocumentMouseUp = vi.fn();
    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('mouseup', onDocumentMouseUp);

    render(
      <div onMouseDown={onMouseDown} onMouseUp={onMouseUp}>
        <ChatSpanActions selection={selection()} onDone={vi.fn()} />
      </div>
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.mouseDown(textarea);
    fireEvent.mouseUp(textarea);

    expect(onMouseDown).not.toHaveBeenCalled();
    expect(onMouseUp).not.toHaveBeenCalled();
    expect(onDocumentMouseDown).not.toHaveBeenCalled();
    expect(onDocumentMouseUp).not.toHaveBeenCalled();

    document.removeEventListener('mousedown', onDocumentMouseDown);
    document.removeEventListener('mouseup', onDocumentMouseUp);
  });
});
