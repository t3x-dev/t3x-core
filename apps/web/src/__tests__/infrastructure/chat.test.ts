import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatStream } from '@/infrastructure/chat';

const fetchMock = vi.fn();
const encoder = new TextEncoder();

function streamFromChunks(chunks: string[]) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe('chatStream', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses split SSE frames and keeps the trailing frame without a blank-line delimiter', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        streamFromChunks([
          'data: {"type":"token","content":"Serv',
          'ice"}\n\n',
          'data: {"type":"done","content":"Service"}',
        ]),
        { status: 200 }
      )
    );

    const events = [];
    for await (const event of chatStream({
      messages: [{ role: 'user', content: 'draft outcome' }],
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'token', content: 'Service' },
      { type: 'done', content: 'Service' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/chat\/stream$/),
      expect.objectContaining({
        method: 'POST',
      })
    );
  });
});
