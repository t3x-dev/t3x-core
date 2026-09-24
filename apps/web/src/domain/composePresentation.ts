const ACRONYMS = new Map([
  ['ai', 'AI'],
  ['api', 'API'],
  ['http', 'HTTP'],
  ['https', 'HTTPS'],
  ['id', 'ID'],
  ['mcp', 'MCP'],
  ['prd', 'PRD'],
  ['t3x', 'T3X'],
  ['url', 'URL'],
]);

export function humanizeComposeIdentifier(value: string) {
  const decoded = (() => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  })();
  return decoded
    .replace(/^\[key=|\]$/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word, index) => {
      const acronym = ACRONYMS.get(word.toLowerCase());
      if (acronym) return acronym;
      return index === 0 ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word;
    })
    .join(' ');
}

export function composePathLabel(path: string | null | undefined, fallback = 'Changed field') {
  if (!path) return humanizeComposeIdentifier(fallback);
  const keys = [...path.matchAll(/\[key=([^\]]+)\]/g)];
  const candidate = keys.at(-1)?.[1] ?? path.split('/').filter(Boolean).at(-1) ?? fallback;
  return humanizeComposeIdentifier(candidate) || humanizeComposeIdentifier(fallback);
}

export function composePathBreadcrumb(path: string | null | undefined, fallback = 'Changed field') {
  if (!path) return humanizeComposeIdentifier(fallback);
  const keys = [...path.matchAll(/\[key=([^\]]+)\]/g)].map((match) => match[1]);
  const segments = keys.length ? keys : path.split('/').filter(Boolean);
  return segments.map(humanizeComposeIdentifier).join(' / ');
}

export function composeActorLabel(actor: string) {
  const identity = actor.split(':').at(-1) ?? actor;
  return humanizeComposeIdentifier(identity);
}

export function composeNodeTitle(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const slots = (value as Record<string, unknown>).slots;
  if (!slots || typeof slots !== 'object' || Array.isArray(slots)) return undefined;
  const title = (slots as Record<string, unknown>).title;
  return typeof title === 'string' && title.trim() ? title : undefined;
}

export function composeValueLabel(value: unknown, fallback: string): string {
  if (value === undefined) return fallback;
  if (value === null) return 'Empty';
  if (typeof value === 'string') {
    if (!value) return 'Empty text';
    return /^[A-Za-z0-9_-]+$/.test(value) && /[_-]/.test(value)
      ? humanizeComposeIdentifier(value)
      : value;
  }
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (!value.length) return 'Empty list';
    const items = value.slice(0, 3).map((item) => composeValueLabel(item, 'Empty'));
    return `${items.join(', ')}${
      value.length > items.length ? ` +${value.length - items.length} more` : ''
    }`;
  }
  if (typeof value === 'object') {
    const title = composeNodeTitle(value);
    if (title) return title;
    const record = value as Record<string, unknown>;
    const preferred = ['title', 'name', 'label', 'key'].find(
      (key) => typeof record[key] === 'string' && String(record[key]).trim()
    );
    if (preferred) return humanizeComposeIdentifier(String(record[preferred]));
    const visible = Object.entries(record).filter(([key]) => key !== 'children');
    if (!visible.length && Array.isArray(record.children)) {
      return record.children.length ? `${record.children.length} child fields` : 'No child fields';
    }
    const count = Object.keys(record).length;
    return `${count} structured ${count === 1 ? 'field' : 'fields'}`;
  }
  return String(value);
}

const VALUE_KEYS = [
  'title',
  'name',
  'label',
  'description',
  'text',
  'value',
  'count',
  'replicas',
  'percentage',
  'timeout',
  'enabled',
  'key',
];

function isScalar(value: unknown): value is string | number | boolean | null | undefined {
  return value == null || ['string', 'number', 'boolean'].includes(typeof value);
}

function sameValue(left: unknown, right: unknown) {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function representativeLeaf(value: unknown, depth = 0): unknown {
  if (depth > 8 || isScalar(value)) return value;
  const title = composeNodeTitle(value);
  if (title) return title;
  if (Array.isArray(value)) return representativeLeaf(value[0], depth + 1);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of VALUE_KEYS) {
      if (record[key] !== undefined) return representativeLeaf(record[key], depth + 1);
    }
    for (const [key, child] of Object.entries(record)) {
      if (key === 'children') continue;
      const leaf = representativeLeaf(child, depth + 1);
      if (leaf !== undefined) return leaf;
    }
    return representativeLeaf(record.children, depth + 1);
  }
  return value;
}

function changedLeafPair(
  before: unknown,
  after: unknown,
  depth = 0
): { before: unknown; after: unknown } | null {
  if (sameValue(before, after)) return null;
  if (depth > 8) return { before, after };
  if (isScalar(before) || isScalar(after)) {
    return {
      before: isScalar(before) ? before : representativeLeaf(before),
      after: isScalar(after) ? after : representativeLeaf(after),
    };
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const identity = (item: unknown) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
      const record = item as Record<string, unknown>;
      return ['id', 'key', 'name', 'title']
        .map((key) => record[key])
        .find((value) => value !== undefined && value !== null && isScalar(value));
    };
    const paired = before.map((item, index) => {
      const id = identity(item);
      const match = id === undefined ? after[index] : after.find((entry) => identity(entry) === id);
      return [item, match] as const;
    });
    for (const [left, right] of paired) {
      const change = changedLeafPair(left, right, depth + 1);
      if (change) return change;
    }
    if (after.length > before.length)
      return changedLeafPair(undefined, after[before.length], depth + 1);
    if (before.length > after.length)
      return changedLeafPair(before[after.length], undefined, depth + 1);
    return null;
  }

  if (
    before &&
    after &&
    typeof before === 'object' &&
    typeof after === 'object' &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const left = before as Record<string, unknown>;
    const right = after as Record<string, unknown>;
    const keys = [...new Set([...VALUE_KEYS, ...Object.keys(left), ...Object.keys(right)])];
    for (const key of keys) {
      if (key === 'children') continue;
      const change = changedLeafPair(left[key], right[key], depth + 1);
      if (change) return change;
    }
    return changedLeafPair(left.children, right.children, depth + 1);
  }

  return { before, after };
}

export function composeValueChangeLabels(
  before: unknown,
  after: unknown,
  beforeFallback = 'Absent',
  afterFallback = 'Absent'
) {
  const pair = changedLeafPair(before, after) ?? { before, after };
  return {
    before: composeValueLabel(pair.before, beforeFallback),
    after: composeValueLabel(pair.after, afterFallback),
  };
}

export function composeTextChangeSegments(before: string, after: string) {
  if (before === after) return { prefix: before, before: '', after: '', suffix: '' };
  let prefixLength = 0;
  const maxPrefix = Math.min(before.length, after.length);
  while (prefixLength < maxPrefix && before[prefixLength] === after[prefixLength])
    prefixLength += 1;

  const isWordCharacter = (value: string | undefined) =>
    Boolean(value && /[A-Za-z0-9_]/.test(value));
  while (
    prefixLength > 0 &&
    isWordCharacter(before[prefixLength - 1]) &&
    (isWordCharacter(before[prefixLength]) || isWordCharacter(after[prefixLength]))
  )
    prefixLength -= 1;

  let suffixLength = 0;
  const maxSuffix = Math.min(before.length - prefixLength, after.length - prefixLength);
  while (
    suffixLength < maxSuffix &&
    before[before.length - 1 - suffixLength] === after[after.length - 1 - suffixLength]
  )
    suffixLength += 1;

  const beforeSuffixStart = before.length - suffixLength;
  const afterSuffixStart = after.length - suffixLength;
  if (
    suffixLength > 0 &&
    isWordCharacter(before[beforeSuffixStart]) &&
    (isWordCharacter(before[beforeSuffixStart - 1]) || isWordCharacter(after[afterSuffixStart - 1]))
  )
    suffixLength = 0;

  return {
    prefix: before.slice(0, prefixLength),
    before: before.slice(prefixLength, before.length - suffixLength || undefined),
    after: after.slice(prefixLength, after.length - suffixLength || undefined),
    suffix: suffixLength ? before.slice(-suffixLength) : '',
  };
}
