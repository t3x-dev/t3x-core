import { describe, expect, it } from 'vitest';
import { conversationMemorySystemMessage } from '@/hooks/sourceThreads/conversationMemorySystemMessage';

describe('conversationMemorySystemMessage', () => {
  it('sends memory text as the system message and leaves estimate and sources off the message', () => {
    const message = conversationMemorySystemMessage({
      text: '  pinned fact  ',
      token_estimate: 42,
      sources: [{ type: 'commit', id: 'commit-1', title: 'head' }],
    });

    expect(message).toEqual({ role: 'system', content: 'pinned fact' });
    expect(JSON.stringify(message)).not.toContain('token_estimate');
    expect(JSON.stringify(message)).not.toContain('commit-1');
    expect(JSON.stringify(message)).not.toContain('sources');
  });

  it('omits the system message when memory text is empty', () => {
    expect(
      conversationMemorySystemMessage({
        text: '   ',
        token_estimate: 0,
        sources: [],
      })
    ).toBeNull();
  });
});
