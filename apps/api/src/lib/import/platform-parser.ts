/**
 * Platform Parser
 *
 * Parses exported conversation data from ChatGPT, Claude.ai, Gemini, Discord, and Feishu.
 * Also supports Slack ZIP exports via parsePlatformExportFromBuffer().
 */

import { isDiscordExport, parseDiscordExport } from './discord-parser';
import { isFeishuExport, parseFeishuExport } from './feishu-parser';
import { isSlackExportZip, parseSlackExport } from './slack-parser';
import type { PlatformConversation, PlatformMessage, PlatformParseResult } from './types';

/**
 * Detect platform and parse exported conversation data (JSON string).
 */
export function parsePlatformExport(jsonString: string): PlatformParseResult {
  let data: unknown;
  try {
    data = JSON.parse(jsonString);
  } catch {
    throw new Error('Invalid JSON: could not parse platform export');
  }

  // Detect platform format
  if (isChatGPTExport(data)) {
    return parseChatGPTExport(data);
  }
  if (isClaudeExport(data)) {
    return parseClaudeExport(data);
  }
  if (isGeminiExport(data)) {
    return parseGeminiExport(data);
  }
  if (isDiscordExport(data)) {
    return parseDiscordExport(data);
  }
  if (isFeishuExport(data)) {
    return parseFeishuExport(data);
  }

  throw new Error(
    'Unrecognized export format. Supported: ChatGPT, Claude.ai, Gemini, Discord, Feishu. For Slack ZIP exports, use the file upload endpoint.'
  );
}

/**
 * Parse a binary platform export (ZIP files like Slack).
 */
export function parsePlatformExportFromBuffer(buffer: Uint8Array): PlatformParseResult {
  if (isSlackExportZip(buffer)) {
    return parseSlackExport(buffer);
  }

  throw new Error(
    'Unrecognized ZIP format. Currently only Slack workspace exports are supported as ZIP files.'
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ChatGPT
// ═══════════════════════════════════════════════════════════════════════════

interface ChatGPTConversation {
  title: string;
  id: string;
  create_time: number;
  mapping: Record<
    string,
    {
      id: string;
      message?: {
        author: { role: string };
        content: { parts?: string[] };
        create_time?: number;
      };
      parent?: string;
      children?: string[];
    }
  >;
}

function isChatGPTExport(data: unknown): data is ChatGPTConversation[] {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    typeof data[0] === 'object' &&
    data[0] !== null &&
    'mapping' in data[0]
  );
}

function parseChatGPTExport(data: ChatGPTConversation[]): PlatformParseResult {
  const conversations: PlatformConversation[] = [];

  for (const conv of data) {
    const messages: PlatformMessage[] = [];

    // Walk the mapping tree to extract messages in order
    const nodes = Object.values(conv.mapping);
    // Sort by create_time to get chronological order
    const messageNodes = nodes
      .filter((n) => n.message?.content?.parts && n.message.author.role !== 'system')
      .sort((a, b) => (a.message?.create_time ?? 0) - (b.message?.create_time ?? 0));

    for (const node of messageNodes) {
      const msg = node.message;
      if (!msg?.content?.parts) continue;

      const content = msg.content.parts.filter((p) => typeof p === 'string').join('\n');
      if (!content.trim()) continue;

      messages.push({
        role: msg.author.role === 'assistant' ? 'assistant' : 'user',
        content,
        created_at: msg.create_time ? new Date(msg.create_time * 1000).toISOString() : undefined,
      });
    }

    if (messages.length > 0) {
      conversations.push({
        id: conv.id,
        title: conv.title || 'Untitled',
        messages,
        created_at: conv.create_time ? new Date(conv.create_time * 1000).toISOString() : undefined,
      });
    }
  }

  return { conversations, platform: 'chatgpt' };
}

// ═══════════════════════════════════════════════════════════════════════════
// Claude.ai
// ═══════════════════════════════════════════════════════════════════════════

interface ClaudeConversation {
  uuid: string;
  name: string;
  created_at: string;
  chat_messages: Array<{
    uuid: string;
    sender: string; // "human" | "assistant"
    text: string;
    created_at: string;
  }>;
}

function isClaudeExport(data: unknown): data is ClaudeConversation[] {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    typeof data[0] === 'object' &&
    data[0] !== null &&
    'chat_messages' in data[0]
  );
}

function parseClaudeExport(data: ClaudeConversation[]): PlatformParseResult {
  const conversations: PlatformConversation[] = [];

  for (const conv of data) {
    const messages: PlatformMessage[] = conv.chat_messages
      .filter((m) => m.text.trim())
      .map((m) => ({
        role: m.sender === 'human' ? ('user' as const) : ('assistant' as const),
        content: m.text,
        created_at: m.created_at,
      }));

    if (messages.length > 0) {
      conversations.push({
        id: conv.uuid,
        title: conv.name || 'Untitled',
        messages,
        created_at: conv.created_at,
      });
    }
  }

  return { conversations, platform: 'claude' };
}

// ═══════════════════════════════════════════════════════════════════════════
// Gemini
// ═══════════════════════════════════════════════════════════════════════════

interface GeminiExport {
  conversations?: Array<{
    id: string;
    title: string;
    messages: Array<{
      role: string;
      content: string;
      timestamp?: string;
    }>;
  }>;
}

function isGeminiExport(data: unknown): data is GeminiExport {
  return (
    typeof data === 'object' &&
    data !== null &&
    'conversations' in data &&
    Array.isArray((data as GeminiExport).conversations)
  );
}

function parseGeminiExport(data: GeminiExport): PlatformParseResult {
  const conversations: PlatformConversation[] = [];

  for (const conv of data.conversations ?? []) {
    const messages: PlatformMessage[] = conv.messages
      .filter((m) => m.content.trim())
      .map((m) => ({
        role: m.role === 'model' ? ('assistant' as const) : ('user' as const),
        content: m.content,
        created_at: m.timestamp,
      }));

    if (messages.length > 0) {
      conversations.push({
        id: conv.id,
        title: conv.title || 'Untitled',
        messages,
      });
    }
  }

  return { conversations, platform: 'gemini' };
}
