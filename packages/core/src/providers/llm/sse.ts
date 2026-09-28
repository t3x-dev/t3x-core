export interface ProviderSseFrame {
  event: string;
  data: string;
}

function framesFromBuffer(buffer: string, flush: boolean) {
  const parts = buffer.split(/\r?\n\r?\n/);
  const remaining = flush ? '' : (parts.pop() ?? '');
  if (flush && parts.at(-1) === '') parts.pop();
  return { frames: parts.filter(Boolean), remaining };
}

export async function* readProviderSse(response: Response): AsyncGenerator<ProviderSseFrame> {
  const reader = response.body?.getReader();
  if (!reader) throw new TypeError('Provider response has no body');
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const parsed = framesFromBuffer(buffer, done);
      buffer = parsed.remaining;
      for (const frame of parsed.frames) {
        let event = '';
        const data: string[] = [];
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
        }
        if (data.length > 0) yield { event, data: data.join('\n') };
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}
