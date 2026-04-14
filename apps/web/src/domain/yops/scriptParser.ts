import { load as parseYaml, dump as stringifyYaml } from 'js-yaml';
import type { YOp } from '@t3x-dev/core';

export interface ParseError {
  line: number;
  message: string;
}

export interface ParseResult {
  ops: YOp[] | null;
  errors: ParseError[];
}

const VALID_OPS = [
  'define', 'drop', 'rename', 'set', 'unset', 'populate', 'append',
  'move', 'clone', 'nest', 'split', 'fold', 'merge',
  'sort', 'unique', 'pick', 'omit', 'assert',
  'relate', 'unrelate',
];

export function parseYOpsScript(text: string): ParseResult {
  if (!text.trim()) return { ops: null, errors: [] };

  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch (e: any) {
    const lineMatch = e.message?.match(/at line (\d+)/);
    const line = lineMatch ? Number.parseInt(lineMatch[1]) : 1;
    return { ops: null, errors: [{ line, message: `YAML syntax error: ${e.message}` }] };
  }

  if (!doc || typeof doc !== 'object') {
    return { ops: null, errors: [{ line: 1, message: 'Expected a YAML document with "yops" key' }] };
  }

  const yops = (doc as Record<string, unknown>).yops;
  if (!Array.isArray(yops)) {
    return { ops: null, errors: [{ line: 1, message: 'Missing "yops" array' }] };
  }

  const errors: ParseError[] = [];
  for (let i = 0; i < yops.length; i++) {
    const op = yops[i];
    if (!op || typeof op !== 'object') {
      errors.push({ line: i + 2, message: `Op ${i + 1}: expected an operation object` });
      continue;
    }
    const keys = Object.keys(op);
    if (keys.length !== 1) {
      errors.push({ line: i + 2, message: `Op ${i + 1}: expected exactly one operation key, got ${keys.length}` });
      continue;
    }
    const opName = keys[0];
    if (!VALID_OPS.includes(opName)) {
      const suggestion = VALID_OPS.find((v) => v.startsWith(opName.slice(0, 2)));
      const hint = suggestion ? ` — did you mean "${suggestion}"?` : '';
      errors.push({ line: i + 2, message: `Op ${i + 1}: unknown operation "${opName}"${hint}` });
    }
  }

  if (errors.length > 0) return { ops: null, errors };
  return { ops: yops as YOp[], errors: [] };
}

export function opsToYaml(ops: YOp[]): string {
  if (ops.length === 0) return '';
  return stringifyYaml({ yops: ops }, { indent: 2 });
}
