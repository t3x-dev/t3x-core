import type { TreeNode } from '@t3x-dev/core';
import { chatStream } from '@/lib/api/chat';

interface IntentResult {
  coreNodeIds: string[];
  justifications: Record<string, string>;
}

/**
 * Ask the LLM which nodes represent the user's core current intentions.
 * Sends only node keys and slot keys (not full values) to minimize tokens.
 */
export async function getIntentSummary(
  nodes: TreeNode[],
  signal?: AbortSignal
): Promise<IntentResult> {
  const frameSummaries = nodes.map((f) => ({
    id: f.key,
    type: f.key,
    slots: Object.keys(f.slots),
  }));

  const prompt = `You are analyzing semantic trees extracted from a conversation.
Given these nodes, identify which ones represent the user's CORE current intentions — the key decisions and requirements that shape what they want.

Frames:
${JSON.stringify(frameSummaries, null, 2)}

Respond with JSON only:
{"core_tree_ids": ["f_001", ...], "justifications": {"f_001": "reason", ...}}

Select 3-7 trees maximum. Focus on decisions, constraints, and goals — not logistics or minor details.`;

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
    coreNodeIds: parsed.core_tree_ids ?? [],
    justifications: parsed.justifications ?? {},
  };
}
