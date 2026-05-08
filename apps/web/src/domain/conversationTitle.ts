const MAX_CONVERSATION_TITLE_LENGTH = 25;
const PLACEHOLDER_TITLES = new Set(['new chat', 'untitled conversation']);

export function deriveConversationTitleFromMessage(message: string): string {
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'New Chat';
  if (normalized.length <= MAX_CONVERSATION_TITLE_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_CONVERSATION_TITLE_LENGTH - 3).trimEnd()}...`;
}

export function isPlaceholderConversationTitle(title: string | null | undefined): boolean {
  if (title == null) return false;
  return PLACEHOLDER_TITLES.has(title.trim().toLowerCase());
}
