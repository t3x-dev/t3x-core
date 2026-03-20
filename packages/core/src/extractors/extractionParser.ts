/**
 * Extraction Response Parser
 *
 * Parses LLM output into validated ExtractionItem[].
 * Handles markdown code fences and validates manually (no Zod — core has no Zod dep).
 */

export interface ExtractionItem {
  text: string;
  confidence: number;
  quote: string;
  turn_index: number;
}

export class ExtractionParseError extends Error {
  constructor(
    message: string,
    public readonly raw: string
  ) {
    super(message);
    this.name = 'ExtractionParseError';
  }
}

/**
 * Strip markdown code fences from LLM output.
 * Handles ```json ... ```, ``` ... ```, and bare JSON.
 */
function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  // Match ```json\n...\n``` or ```\n...\n```
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

/**
 * Validate a single extraction item.
 * Returns an error message or null if valid.
 */
function validateItem(item: unknown, index: number): string | null {
  if (typeof item !== 'object' || item === null) {
    return `[${index}]: not an object`;
  }

  const obj = item as Record<string, unknown>;

  if (typeof obj.text !== 'string' || obj.text.length === 0) {
    return `[${index}].text: must be a non-empty string`;
  }
  if (typeof obj.confidence !== 'number' || obj.confidence < 0 || obj.confidence > 1) {
    return `[${index}].confidence: must be a number between 0 and 1`;
  }
  if (typeof obj.quote !== 'string' || obj.quote.length === 0) {
    return `[${index}].quote: must be a non-empty string`;
  }
  if (
    typeof obj.turn_index !== 'number' ||
    !Number.isInteger(obj.turn_index) ||
    obj.turn_index < 0
  ) {
    return `[${index}].turn_index: must be a non-negative integer`;
  }

  return null;
}

/**
 * Parse raw LLM response into validated ExtractionItem[].
 * Strips markdown fences, parses JSON, validates structure.
 *
 * @throws ExtractionParseError on invalid input
 */
export function parseExtractionResponse(raw: string): ExtractionItem[] {
  const cleaned = stripCodeFences(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new ExtractionParseError(`Invalid JSON: ${cleaned.slice(0, 200)}`, raw);
  }

  if (!Array.isArray(parsed)) {
    throw new ExtractionParseError('Expected JSON array', raw);
  }

  const errors: string[] = [];
  const results: ExtractionItem[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const err = validateItem(parsed[i], i);
    if (err) {
      errors.push(err);
    } else {
      const obj = parsed[i] as Record<string, unknown>;
      results.push({
        text: obj.text as string,
        confidence: obj.confidence as number,
        quote: obj.quote as string,
        turn_index: obj.turn_index as number,
      });
    }
  }

  if (errors.length > 0 && results.length === 0) {
    throw new ExtractionParseError(`Schema validation failed: ${errors.join('; ')}`, raw);
  }

  // If some items are valid and some are not, return the valid ones (lenient parsing)
  if (errors.length > 0 && results.length > 0) {
    console.warn(
      `[ExtractionParser] Dropped ${errors.length}/${parsed.length} invalid items: ${errors.slice(0, 3).join('; ')}`
    );
  }
  return results;
}
