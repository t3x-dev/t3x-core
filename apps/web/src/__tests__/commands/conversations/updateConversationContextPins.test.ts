import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/infrastructure/pins', () => ({
  updateConversationContext: vi.fn(),
}));

import {
  ConversationPersistenceError,
  updateConversationContextPins,
} from '@/commands/conversations';
import { updateConversationContext } from '@/infrastructure/pins';

describe('commands/conversations/updateConversationContextPins', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates the conversation context selected pins', async () => {
    const context = {
      conversation_id: 'conv_1',
      selected_pin_ids: ['pin_1', 'pin_2'],
      updated_at: '2026-05-25T00:00:00.000Z',
    };
    vi.mocked(updateConversationContext).mockResolvedValueOnce(context);

    await expect(updateConversationContextPins('conv_1', ['pin_1', 'pin_2'])).resolves.toBe(
      context
    );

    expect(updateConversationContext).toHaveBeenCalledWith('conv_1', ['pin_1', 'pin_2']);
  });

  it('forwards null selected pins to use the default context', async () => {
    const context = {
      conversation_id: 'conv_1',
      selected_pin_ids: null,
      updated_at: '2026-05-25T00:00:00.000Z',
    };
    vi.mocked(updateConversationContext).mockResolvedValueOnce(context);

    await expect(updateConversationContextPins('conv_1', null)).resolves.toBe(context);

    expect(updateConversationContext).toHaveBeenCalledWith('conv_1', null);
  });

  it('wraps persistence failures in ConversationPersistenceError', async () => {
    const cause = new Error('network failed');
    vi.mocked(updateConversationContext).mockRejectedValueOnce(cause);

    try {
      await updateConversationContextPins('conv_1', []);
      throw new Error('expected updateConversationContextPins to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ConversationPersistenceError);
      expect(error).toMatchObject({
        name: 'ConversationPersistenceError',
        code: 'conversation_persistence',
        message: 'network failed',
        cause,
      });
    }
  });
});
