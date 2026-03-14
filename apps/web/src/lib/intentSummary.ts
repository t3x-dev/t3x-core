import type { Frame } from '@t3x-dev/core';
import { chatStream } from '@/lib/api/chat';

interface IntentResult {
  coreFrameIds: string[];
  justifications: Record<string, string>;
}

/**
 * Ask the LLM which frames represent the user's core current intentions.
 * Sends only frame types and slot keys (not full values) to minimize tokens.
 */
export async function getIntentSummary(
  frames: Frame[],
  signal?: AbortSignal,
): Promise<IntentResult> {
  const frameSummaries = frames.map((f) => ({
    id: f.id,
    type: f.type,
    slots: Object.keys(f.slots),
  }));

  const prompt = `You are analyzing semantic frames extracted from a conversation.
Given these frames, identify which ones represent the user's CORE current intentions — the key decisions and requirements that shape what they want.

Frames:
${JSON.stringify(frameSummaries, null, 2)}

Respond with JSON only:
{"core_frame_ids": ["f_001", ...], "justifications": {"f_001": "reason", ...}}

Select 3-7 frames maximum. Focus on decisions, constraints, and goals — not logistics or minor details.`;

  let fullResponse = '';
  for await (const event of chatStream({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens: 500,
  })) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (event.type === 'token') fullResponse += event.content;
    if (event.type === 'error') throw new Error(event.message);
  }

  const parsed = JSON.parse(fullResponse);
  return {
    coreFrameIds: parsed.core_frame_ids ?? [],
    justifications: parsed.justifications ?? {},
  };
}
