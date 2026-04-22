/**
 * Extract the first balanced JSON object or array from a text blob.
 * Handles: bare JSON, JSON inside ```json …``` fences, JSON after preamble.
 * Returns null if no object or array is found.
 *
 * Shared across LLM provider adapters so they can convert a plain-text
 * model response into parseable JSON when the provider's structured-output
 * path returns non-JSON content.
 */
export function extractJsonBlock(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed;

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();

  const openIndex = Math.min(
    ...['{', '['].map((ch) => {
      const idx = trimmed.indexOf(ch);
      return idx === -1 ? Number.POSITIVE_INFINITY : idx;
    })
  );
  if (!Number.isFinite(openIndex)) return null;

  const open = trimmed[openIndex];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = openIndex; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return trimmed.slice(openIndex, i + 1);
    }
  }
  return null;
}
