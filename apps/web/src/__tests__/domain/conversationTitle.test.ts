import { describe, expect, it } from 'vitest';
import {
  deriveConversationTitleFromMessage,
  isPlaceholderConversationTitle,
  normalizeGeneratedConversationTitle,
} from '@/domain/conversationTitle';

describe('deriveConversationTitleFromMessage', () => {
  it('limits conversation titles to 25 characters including the ellipsis', () => {
    const title = deriveConversationTitleFromMessage(
      'Please compare the advantages and disadvantages of joining a football academy early'
    );

    expect(title).toBe('Please compare the adv...');
    expect(title.length).toBe(25);
  });

  it('recognizes system-created placeholder titles', () => {
    expect(isPlaceholderConversationTitle('Temporary chat')).toBe(true);
    expect(isPlaceholderConversationTitle('New conversation')).toBe(true);
    expect(isPlaceholderConversationTitle('Compose assistant')).toBe(true);
    expect(isPlaceholderConversationTitle('Release planning')).toBe(false);
  });

  it('cleans generated titles and keeps them within the max length', () => {
    const title = normalizeGeneratedConversationTitle(
      '"Title: Compare football academy advantages and risks"',
      'Fallback'
    );

    expect(title).toBe('Compare football acade...');
    expect(title.length).toBe(25);
  });

  it('falls back when generated titles are empty', () => {
    expect(normalizeGeneratedConversationTitle('   ', 'Fallback title')).toBe('Fallback title');
  });
});
