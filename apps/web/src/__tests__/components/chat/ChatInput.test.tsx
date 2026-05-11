// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '@/components/chat/ChatInput';

describe('ChatInput draft persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('restores an unsent draft for the same draft key', async () => {
    window.localStorage.setItem(
      't3x:chat-input-draft:conversation:conv_123',
      'restore this after refresh'
    );

    render(<ChatInput draftKey="conversation:conv_123" onSend={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Reply...')).toHaveValue('restore this after refresh');
    });
  });

  it('persists typed text without leaking it to a different draft key', async () => {
    const { rerender } = render(<ChatInput draftKey="conversation:conv_a" onSend={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Reply...'), {
      target: { value: 'keep this scoped to conversation A' },
    });

    await waitFor(() => {
      expect(window.localStorage.getItem('t3x:chat-input-draft:conversation:conv_a')).toBe(
        'keep this scoped to conversation A'
      );
    });

    rerender(<ChatInput draftKey="conversation:conv_b" onSend={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Reply...')).toHaveValue('');
    });
    expect(window.localStorage.getItem('t3x:chat-input-draft:conversation:conv_a')).toBe(
      'keep this scoped to conversation A'
    );
    expect(window.localStorage.getItem('t3x:chat-input-draft:conversation:conv_b')).toBeNull();
  });

  it('clears the persisted draft after sending', async () => {
    const onSend = vi.fn();
    render(<ChatInput draftKey="conversation:conv_123" onSend={onSend} />);

    fireEvent.change(screen.getByPlaceholderText('Reply...'), {
      target: { value: 'send and clear this draft' },
    });

    await waitFor(() => {
      expect(window.localStorage.getItem('t3x:chat-input-draft:conversation:conv_123')).toBe(
        'send and clear this draft'
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(onSend).toHaveBeenCalledWith('send and clear this draft', undefined);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Reply...')).toHaveValue('');
      expect(window.localStorage.getItem('t3x:chat-input-draft:conversation:conv_123')).toBeNull();
    });
  });
});
