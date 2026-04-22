/**
 * Deterministic JSON repair for LLM output.
 *
 * F12 — inspired by BoundaryML's Schema-Aligned Parser. LLMs frequently
 * produce near-valid JSON that JSON.parse rejects for small reasons:
 * trailing commas, JavaScript-style comments, truncated output leaving
 * brackets unclosed. Each repair is narrow and idempotent. All are
 * string-aware so characters inside "quoted strings" pass through
 * untouched.
 *
 * Used as a drop-in replacement for JSON.parse inside provider adapters
 * and the pipeline's plain-text fallback path. Prefer it when parsing
 * LLM-emitted JSON; use raw JSON.parse when parsing content you control
 * (your own tests, your own fixtures).
 */

export type RepairName = 'strip-comments' | 'strip-trailing-commas' | 'close-brackets';

export type RepairResult =
  | { ok: true; value: unknown; repairsApplied: RepairName[] }
  | { ok: false };

/**
 * Strip // line comments and /* block comments *\/ outside of string literals.
 */
export function stripJsonComments(text: string): string {
  let out = '';
  let i = 0;
  let inString = false;
  let isEscape = false;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (isEscape) isEscape = false;
      else if (ch === '\\') isEscape = true;
      else if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    // Line comment: skip to next newline (keep the newline for line-count parity).
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    // Block comment: skip through */.
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length - 1 && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Remove commas immediately preceding a closing `}` or `]`, outside string
 * literals. Trailing commas are the single most common LLM JSON bug.
 */
export function stripTrailingCommas(text: string): string {
  let out = '';
  let i = 0;
  let inString = false;
  let isEscape = false;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (isEscape) isEscape = false;
      else if (ch === '\\') isEscape = true;
      else if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === ',') {
      // Look ahead past whitespace — if the next non-space char closes a
      // container, drop the comma.
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j] ?? '')) j += 1;
      const next = text[j];
      if (next === '}' || next === ']') {
        i += 1;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Close any unclosed strings and append the missing closing brackets for
 * unbalanced `{` or `[`. Handles the common "model got truncated" case.
 */
export function closeUnbalancedBrackets(text: string): string {
  const stack: Array<'}' | ']'> = [];
  let inString = false;
  let isEscape = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (isEscape) isEscape = false;
      else if (ch === '\\') isEscape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') {
      if (stack[stack.length - 1] === ch) stack.pop();
    }
  }
  let out = text;
  if (inString) out += '"';
  while (stack.length > 0) {
    out += stack.pop();
  }
  return out;
}

/**
 * Try to JSON.parse `text`. If it fails, apply repairs progressively and
 * re-parse after each. Returns the parsed value together with the list of
 * repairs that ended up being applied (useful for telemetry), or `{ ok: false }`
 * if no combination parses.
 */
export function tryParseWithRepair(text: string): RepairResult {
  try {
    return { ok: true, value: JSON.parse(text), repairsApplied: [] };
  } catch {
    // fall through to repair passes
  }

  // Order matters: close-brackets runs *before* strip-trailing-commas so
  // a final trailing comma (before an implicit missing `}` or `]`) has an
  // explicit closing bracket to be removed against.
  const passes: Array<[RepairName, (s: string) => string]> = [
    ['strip-comments', stripJsonComments],
    ['close-brackets', closeUnbalancedBrackets],
    ['strip-trailing-commas', stripTrailingCommas],
  ];

  const applied: RepairName[] = [];
  let current = text;
  for (const [name, fn] of passes) {
    const next = fn(current);
    if (next !== current) {
      applied.push(name);
      current = next;
      try {
        return { ok: true, value: JSON.parse(current), repairsApplied: applied };
      } catch {
        // keep going — subsequent repairs might rescue it
      }
    }
  }

  // Final attempt: all passes applied, in case partial parses missed interactions.
  if (applied.length > 0) {
    try {
      return { ok: true, value: JSON.parse(current), repairsApplied: applied };
    } catch {
      // fall through
    }
  }

  return { ok: false };
}
