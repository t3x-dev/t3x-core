import { describe, expect, it } from 'vitest';
import {
  CHAT_SIDEBAR_DEFAULT_WIDTH,
  CHAT_SIDEBAR_MAX_WIDTH,
  CHAT_SIDEBAR_MIN_WIDTH,
  clampChatSidebarWidth,
} from '@/store/chatStore';

describe('chat sidebar sizing', () => {
  it('keeps the resizable sidebar inside the supported design range', () => {
    expect(clampChatSidebarWidth(CHAT_SIDEBAR_MIN_WIDTH - 1)).toBe(CHAT_SIDEBAR_MIN_WIDTH);
    expect(clampChatSidebarWidth(CHAT_SIDEBAR_MAX_WIDTH + 1)).toBe(CHAT_SIDEBAR_MAX_WIDTH);
    expect(clampChatSidebarWidth(300.4)).toBe(300);
    expect(clampChatSidebarWidth(Number.NaN)).toBe(CHAT_SIDEBAR_DEFAULT_WIDTH);
  });
});
