// @vitest-environment jsdom

import { act, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook, waitForHook } from '../../hooks/renderHook';

vi.mock('@/queries/contextManifest', () => ({
  fetchContextManifest: vi.fn(),
}));

import { useContextManifest } from '@/hooks/conversations/useContextManifest';
import { fetchContextManifest } from '@/queries/contextManifest';
import type { ConversationContextManifest } from '@/types/api';

const manifest: ConversationContextManifest = {
  conversation_id: 'conv_1',
  project_id: 'proj_1',
  baseline: {
    commit_hash: null,
    branch: null,
    message: null,
    content: null,
    source: 'none',
    node_count: 0,
    relation_count: 0,
  },
  references: [],
  feedback: [],
  token_estimate: 0,
  sources: [],
  chat_context_text: '',
  extraction_context_text: '',
};

const manifest2: ConversationContextManifest = {
  ...manifest,
  conversation_id: 'conv_2',
};

function deferred<T>(): {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
} {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanupRoots();
});

describe('useContextManifest', () => {
  it('loads the manifest when a conversation id is available', async () => {
    vi.mocked(fetchContextManifest).mockResolvedValueOnce(manifest);

    const { result } = renderHook(() => useContextManifest('conv_1'));

    expect(result.current.manifest).toBeNull();
    expect(result.current.loading).toBe(true);

    await waitForHook();

    expect(fetchContextManifest).toHaveBeenCalledWith('conv_1');
    expect(result.current.manifest).toBe(manifest);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('exposes load failures and supports reload', async () => {
    const failure = new Error('manifest failed');
    vi.mocked(fetchContextManifest).mockRejectedValueOnce(failure).mockResolvedValueOnce(manifest);

    const { result } = renderHook(() => useContextManifest('conv_1'));
    await waitForHook();

    expect(result.current.manifest).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(failure);

    await act(async () => {
      await result.current.reload();
    });

    expect(fetchContextManifest).toHaveBeenCalledTimes(2);
    expect(result.current.manifest).toBe(manifest);
    expect(result.current.error).toBeNull();
  });

  it('resets manifest state when no conversation id is available', async () => {
    vi.mocked(fetchContextManifest).mockResolvedValueOnce(manifest);
    const { result } = renderHook(() => {
      const [conversationId, setConversationId] = useState<string | null>('conv_1');
      return {
        setConversationId,
        contextManifest: useContextManifest(conversationId),
      };
    });
    await waitForHook();

    expect(result.current.contextManifest.manifest).toBe(manifest);

    act(() => {
      result.current.setConversationId(null);
    });
    await waitForHook();

    expect(result.current.contextManifest.manifest).toBeNull();
    expect(result.current.contextManifest.loading).toBe(false);
    expect(result.current.contextManifest.error).toBeNull();
  });

  it('ignores stale reload completion after the conversation id changes', async () => {
    const initialLoad = deferred<ConversationContextManifest>();
    const staleReload = deferred<ConversationContextManifest>();
    const nextLoad = deferred<ConversationContextManifest>();
    vi.mocked(fetchContextManifest)
      .mockReturnValueOnce(initialLoad.promise)
      .mockReturnValueOnce(staleReload.promise)
      .mockReturnValueOnce(nextLoad.promise);

    const { result } = renderHook(() => {
      const [conversationId, setConversationId] = useState('conv_1');
      return {
        setConversationId,
        contextManifest: useContextManifest(conversationId),
      };
    });

    await act(async () => {
      initialLoad.resolve(manifest);
      await initialLoad.promise;
    });

    expect(result.current.contextManifest.manifest).toBe(manifest);
    expect(result.current.contextManifest.loading).toBe(false);

    await act(async () => {
      void result.current.contextManifest.reload();
    });
    expect(fetchContextManifest).toHaveBeenNthCalledWith(2, 'conv_1');
    expect(result.current.contextManifest.loading).toBe(true);

    act(() => {
      result.current.setConversationId('conv_2');
    });
    expect(fetchContextManifest).toHaveBeenNthCalledWith(3, 'conv_2');

    await act(async () => {
      nextLoad.resolve(manifest2);
      await nextLoad.promise;
    });

    expect(result.current.contextManifest.manifest).toBe(manifest2);
    expect(result.current.contextManifest.loading).toBe(false);
    expect(result.current.contextManifest.error).toBeNull();

    await act(async () => {
      staleReload.resolve(manifest);
      await staleReload.promise;
    });

    expect(result.current.contextManifest.manifest).toBe(manifest2);
    expect(result.current.contextManifest.loading).toBe(false);
    expect(result.current.contextManifest.error).toBeNull();
  });
});
