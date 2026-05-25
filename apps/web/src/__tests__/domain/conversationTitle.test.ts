import { describe, expect, it } from 'vitest';
import {
  deriveConversationTitleFromMessage,
  isPlaceholderConversationTitle,
} from '@/domain/conversationTitle';

describe('deriveConversationTitleFromMessage', () => {
  it('limits conversation titles to 25 characters including the ellipsis', () => {
    const title = deriveConversationTitleFromMessage(
      'Please compare the advantages and disadvantages of joining a football academy early'
    );

    expect(title).toBe('Please compare the adv...');
    expect(title.length).toBe(25);
  });

  it('treats temporary chat as a placeholder title', () => {
    expect(isPlaceholderConversationTitle('Temporary chat')).toBe(true);
  });
});
