/**
 * Feishu (飞书) Export Parser
 *
 * Parses Feishu message export JSON.
 * Format: { messages: [{ msg_type, content, sender: { sender_type } }] }
 */

import type { PlatformConversation, PlatformMessage, PlatformParseResult } from './types';

interface FeishuExport {
  chat_id?: string;
  chat_name?: string;
  messages: Array<{
    msg_type: string;
    content: string;
    sender: {
      sender_type: string; // "user" | "bot" | "app"
      sender_id?: string;
      name?: string;
    };
    create_time?: string;
  }>;
}

/**
 * Check if parsed JSON is a Feishu export.
 */
export function isFeishuExport(data: unknown): data is FeishuExport {
  return (
    typeof data === 'object' &&
    data !== null &&
    'messages' in data &&
    Array.isArray((data as FeishuExport).messages) &&
    (data as FeishuExport).messages.length > 0 &&
    typeof (data as FeishuExport).messages[0]?.sender === 'object' &&
    'sender_type' in (data as FeishuExport).messages[0].sender
  );
}

/**
 * Parse a Feishu export JSON into PlatformParseResult.
 */
export function parseFeishuExport(data: FeishuExport): PlatformParseResult {
  const messages: PlatformMessage[] = data.messages
    .filter((m) => m.msg_type === 'text' && m.content.trim())
    .map((m) => {
      // Try parsing content as JSON (Feishu wraps text in {"text":"..."})
      let text = m.content;
      try {
        const parsed = JSON.parse(m.content) as { text?: string };
        if (parsed.text) text = parsed.text;
      } catch {
        // Use content as-is
      }

      return {
        role:
          m.sender.sender_type === 'bot' || m.sender.sender_type === 'app'
            ? ('assistant' as const)
            : ('user' as const),
        content: text,
        created_at: m.create_time,
      };
    })
    .filter((m) => m.content.trim());

  const conversations: PlatformConversation[] = [];

  if (messages.length > 0) {
    conversations.push({
      id: data.chat_id ?? `feishu_${Date.now()}`,
      title: data.chat_name || 'Feishu Chat',
      messages,
    });
  }

  return { conversations, platform: 'feishu' };
}
