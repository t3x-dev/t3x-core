/**
 * @yops-dev/core — YAML Parse / Serialize
 *
 * parseYOpsYaml: string → YOp[]
 * formatYOps:    YOp[] → string
 *
 * The spec's normative root is `{ yops: [...] }`. The parser also accepts
 * a bare YAML array for ergonomics and backwards compatibility; the
 * serializer always emits the keyed form.
 */

import * as yaml from 'js-yaml';
import type { YOp } from './types';

export interface ParseOk {
  ok: true;
  ops: YOp[];
}

export interface ParseError {
  ok: false;
  error: string;
}

export type ParseResult = ParseOk | ParseError;

export function parseYOpsYaml(yamlStr: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlStr);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (Array.isArray(parsed)) {
    return { ok: true, ops: parsed as YOp[] };
  }

  if (parsed && typeof parsed === 'object') {
    const inner = (parsed as { yops?: unknown }).yops;
    if (Array.isArray(inner)) {
      return { ok: true, ops: inner as YOp[] };
    }
  }

  return {
    ok: false,
    error: 'Expected a YAML array of ops, or { yops: [...] }, got ' + typeof parsed,
  };
}

export function formatYOps(ops: YOp[]): string {
  return yaml.dump(
    { yops: ops },
    {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
      quotingType: "'",
      forceQuotes: false,
    }
  );
}
