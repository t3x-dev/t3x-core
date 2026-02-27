/**
 * Slack Export Parser
 *
 * Parses Slack workspace export ZIP files.
 * ZIP structure: channels/ directory with one JSON file per channel.
 * Each JSON file contains an array of messages with { text, user, ts, type, subtype }.
 */

import { unzipSync } from 'fflate';
import type { PlatformConversation, PlatformMessage, PlatformParseResult } from './types';

interface SlackMessage {
  type: string;
  subtype?: string;
  text: string;
  user?: string;
  bot_id?: string;
  ts: string;
}

/**
 * Parse a Slack export ZIP buffer into PlatformParseResult.
 */
export function parseSlackExport(buffer: Uint8Array): PlatformParseResult {
  const files = unzipSync(buffer);
  const conversations: PlatformConversation[] = [];

  // Collect channel JSON files (e.g., "general/2024-01-01.json" or "channels/general.json")
  const channelMessages = new Map<string, SlackMessage[]>();

  for (const [path, data] of Object.entries(files)) {
    // Skip non-JSON files and metadata files
    if (!path.endsWith('.json')) continue;
    if (path === 'users.json' || path === 'channels.json' || path === 'integration_logs.json')
      continue;

    try {
      const text = new TextDecoder().decode(data);
      const messages = JSON.parse(text) as unknown;
      if (!Array.isArray(messages)) continue;

      // Extract channel name from path (e.g., "general/2024-01-01.json" → "general")
      const channelName = path.split('/')[0];

      const existing = channelMessages.get(channelName) ?? [];
      existing.push(...(messages as SlackMessage[]));
      channelMessages.set(channelName, existing);
    } catch {
      // Skip unparseable files
    }
  }

  for (const [channelName, msgs] of channelMessages) {
    // Sort by timestamp
    const sorted = msgs
      .filter((m) => m.type === 'message' && !m.subtype && m.text?.trim())
      .sort((a, b) => Number.parseFloat(a.ts) - Number.parseFloat(b.ts));

    if (sorted.length === 0) continue;

    const messages: PlatformMessage[] = sorted.map((m) => ({
      role: m.bot_id ? ('assistant' as const) : ('user' as const),
      content: m.text,
      created_at: new Date(Number.parseFloat(m.ts) * 1000).toISOString(),
    }));

    conversations.push({
      id: `slack_${channelName}`,
      title: `#${channelName}`,
      messages,
    });
  }

  return { conversations, platform: 'slack' };
}

/**
 * Check if a buffer appears to be a Slack export ZIP.
 * Slack exports contain users.json or channels.json at the root.
 */
export function isSlackExportZip(buffer: Uint8Array): boolean {
  try {
    const files = unzipSync(buffer);
    const paths = Object.keys(files);
    return paths.some((p) => p === 'users.json' || p === 'channels.json');
  } catch {
    return false;
  }
}
