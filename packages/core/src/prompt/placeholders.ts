import type { YValue } from '@t3x-dev/yops';
import { canonicalize } from 'json-canonicalize';
import type {
  PromptPlaceholder,
  PromptPlaceholderParseResult,
  PromptTemplateRenderResult,
} from './types';

const PLACEHOLDER_KEY_RE = /^[a-z][a-z0-9_]*$/;
const PLACEHOLDER_RE = /\{\{([\s\S]*?)\}\}/g;

function serializePromptValue(value: YValue): string {
  if (typeof value === 'string') return value;
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return canonicalize(value);
}

function hasOwn(record: Readonly<Record<string, YValue>>, key: string): boolean {
  return Object.keys(record).includes(key);
}

export function parsePromptPlaceholders(template: string): PromptPlaceholderParseResult {
  const placeholders: PromptPlaceholder[] = [];
  const issues: PromptPlaceholderParseResult['issues'] = [];
  const coveredOffsets = new Set<number>();

  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    const raw = match[0];
    const start = match.index;
    const key = (match[1] ?? '').trim();
    for (let offset = start; offset < start + raw.length; offset += 1) {
      coveredOffsets.add(offset);
    }
    if (!PLACEHOLDER_KEY_RE.test(key)) {
      issues.push({
        offset: start,
        raw,
        message: `Placeholder ${raw} must contain one snake_case variable key.`,
      });
      continue;
    }
    placeholders.push({ key, raw, start, end: start + raw.length });
  }

  for (let offset = 0; offset < template.length - 1; offset += 1) {
    if (template[offset] !== '{' || template[offset + 1] !== '{' || coveredOffsets.has(offset)) {
      continue;
    }
    const closingOffset = template.indexOf('}}', offset + 2);
    const raw =
      closingOffset < 0 ? template.slice(offset) : template.slice(offset, closingOffset + 2);
    issues.push({
      offset,
      raw,
      message: `Placeholder starting at offset ${offset} is not valid double-brace syntax.`,
    });
    offset += Math.max(raw.length - 1, 1);
  }

  issues.sort((left, right) => left.offset - right.offset || left.raw.localeCompare(right.raw));
  return { placeholders, issues };
}

export function renderPromptTemplate(
  template: string,
  values: Readonly<Record<string, YValue>>
): PromptTemplateRenderResult {
  const parsed = parsePromptPlaceholders(template);
  const unresolvedKeys = new Set<string>();
  let cursor = 0;
  let content = '';

  for (const placeholder of parsed.placeholders) {
    content += template.slice(cursor, placeholder.start);
    if (hasOwn(values, placeholder.key)) {
      content += serializePromptValue(values[placeholder.key] as YValue);
    } else {
      content += placeholder.raw;
      unresolvedKeys.add(placeholder.key);
    }
    cursor = placeholder.end;
  }
  content += template.slice(cursor);

  return {
    content,
    placeholders: parsed.placeholders,
    unresolvedKeys: [...unresolvedKeys].sort(),
    issues: parsed.issues,
  };
}
