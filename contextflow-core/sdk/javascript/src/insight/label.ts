/**
 * Deterministic aspect labeling using entity prioritization and token salience.
 */

export interface LabelInput {
  tokens: string[];
  entities?: string[];
}

const STOPWORDS = new Set(
  [
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "in",
    "for",
    "with",
    "on",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "am",
    "by",
    "at",
    "from",
    "that",
    "this",
    "it",
    "as",
    "about",
    "但", // but
    "以及", // and
    "一个", // one/a
    "这个", // this
    "那个", // that
    "我们", // we
    "你们", // you (plural)
    "他们", // they
    "需要", // need
    "希望", // hope/wish
    "还有", // also/and
  ].map(word => word.toLowerCase()),
);

export function createLabel(input: LabelInput, maxLength = 40): string {
  const entity = selectEntity(input.entities);
  const tokenStats = scoreTokens(input.tokens);
  const sortedTokens = tokenStats.sort((a, b) => b.score - a.score);

  const parts: string[] = [];
  if (entity) {
    parts.push(entity);
  }

  for (const { token } of sortedTokens) {
    if (parts.length >= 3) break;
    if (entity && equalsIgnoreCase(token, entity)) continue;
    if (parts.some(part => equalsIgnoreCase(part, token))) continue;
    parts.push(token);
  }

  if (parts.length === 0) {
    const fallback = input.tokens.find(token => token.trim().length > 0) ?? "Aspect";
    return truncate(fallback.trim(), maxLength);
  }

  return assemble(parts, maxLength);
}

function scoreTokens(tokens: string[]): Array<{ token: string; score: number }> {
  const frequency = new Map<string, { token: string; count: number }>();
  let total = 0;

  for (const token of tokens) {
    const normalized = normalizeToken(token);
    if (!normalized) continue;
    total += 1;
    const entry = frequency.get(normalized);
    if (entry) {
      entry.count += 1;
      if (token.length > entry.token.length) {
        entry.token = token;
      }
    } else {
      frequency.set(normalized, { token, count: 1 });
    }
  }

  if (total === 0) {
    return [];
  }

  const scored: Array<{ token: string; score: number }> = [];
  for (const { token, count } of frequency.values()) {
    const normalized = normalizeToken(token);
    if (!normalized) continue;
    const tf = count / total;
    const stopwordPenalty = STOPWORDS.has(normalized) ? 0.25 : 1;
    const lengthBoost = Math.log(1 + token.length);
    const score = tf * stopwordPenalty * lengthBoost;
    scored.push({ token: token.trim(), score });
  }

  return scored.filter(entry => entry.token.length > 0);
}

function selectEntity(entities?: string[]): string | undefined {
  if (!entities) return undefined;
  for (const entity of entities) {
    const trimmed = entity?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function equalsIgnoreCase(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
}

function normalizeToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return "";
  return trimmed.toLowerCase();
}

function assemble(parts: string[], maxLength: number): string {
  const working = [...parts];
  let label = working.join(" · ");

  while (label.length > maxLength && working.length > 1) {
    working.pop();
    label = working.join(" · ");
  }

  if (label.length > maxLength) {
    label = truncate(label, maxLength);
  }

  return label;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(1, maxLength - 1))}…`;
}
