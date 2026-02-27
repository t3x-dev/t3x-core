/**
 * Discord Export Parser
 *
 * Parses Discord chat exports from DiscordChatExporter (JSON format).
 * Format: { guild, channel, messages: [{ id, content, author: { name, isBot }, timestamp }] }
 */

import type { PlatformConversation, PlatformMessage, PlatformParseResult } from './types';

interface DiscordExport {
  guild?: { id: string; name: string };
  channel: { id: string; name: string; topic?: string };
  messages: Array<{
    id: string;
    content: string;
    author: { id: string; name: string; isBot: boolean };
    timestamp: string;
  }>;
}

/**
 * Check if parsed JSON is a Discord export (DiscordChatExporter format).
 */
export function isDiscordExport(data: unknown): data is DiscordExport {
  return (
    typeof data === 'object' &&
    data !== null &&
    'channel' in data &&
    'messages' in data &&
    Array.isArray((data as DiscordExport).messages) &&
    (data as DiscordExport).messages.length > 0 &&
    typeof (data as DiscordExport).messages[0]?.author === 'object'
  );
}

/**
 * Parse a Discord export JSON into PlatformParseResult.
 */
export function parseDiscordExport(data: DiscordExport): PlatformParseResult {
  const messages: PlatformMessage[] = data.messages
    .filter((m) => m.content.trim())
    .map((m) => ({
      role: m.author.isBot ? ('assistant' as const) : ('user' as const),
      content: m.content,
      created_at: m.timestamp,
    }));

  const channelName = data.channel.name || 'unknown-channel';
  const guildName = data.guild?.name;
  const title = guildName ? `${guildName} / #${channelName}` : `#${channelName}`;

  const conversations: PlatformConversation[] = [];

  if (messages.length > 0) {
    conversations.push({
      id: data.channel.id,
      title,
      messages,
    });
  }

  return { conversations, platform: 'discord' };
}
