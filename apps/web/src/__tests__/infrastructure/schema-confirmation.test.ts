// @vitest-environment jsdom
import type { AssistantSchemaSettingsView } from '@t3x-dev/api-client';
import { expect, it, vi } from 'vitest';
import { confirmAssistantSchemaSettings } from '@/infrastructure/workspaceAssistant';

vi.mock('@/infrastructure/core', () => ({
  API_V1: '/api/v1',
  injectAuthHeaders: async (headers: Headers) => headers,
  handleResponse: async (response: Response) => {
    const body = await response.json();
    if (!response.ok) throw new Error(body.error.message);
    return body.data;
  },
}));

it.each([
  200, 409,
])('updates only the card, without appending a chat reply on HTTP %s', async (status) => {
  const record: AssistantSchemaSettingsView = {
    settingsId: 's',
    revision: 1,
    status: 'pending',
    conversationId: 'c',
    workspaceRevision: 1,
    schemaHash: 'hash',
    settings: {
      action: 'add_slot',
      nodePath: 'requirements',
      name: 'owner',
      definition: { type: 'string' },
      intent: '新增负责人',
    },
  };
  // Even a stale response envelope must not append another chat message.
  const reply = { turnHash: 'reply', content: '旧版 Confirm 回复' };
  const body =
    status === 200
      ? { success: true, data: { ...record, status: 'applied' }, assistantReply: reply }
      : { success: false, error: { message: 'blocked', details: { assistantReply: reply } } };
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
  const listener = vi.fn();
  window.addEventListener('t3x-source-thread-assistant-reply', listener);
  try {
    const request = confirmAssistantSchemaSettings('p', 'w', record, record.settings, {
      applyToDraft: true,
    });
    if (status === 200) await expect(request).resolves.toMatchObject({ status: 'applied' });
    else await expect(request).rejects.toThrow('blocked');
    expect(listener).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
    window.removeEventListener('t3x-source-thread-assistant-reply', listener);
  }
});
