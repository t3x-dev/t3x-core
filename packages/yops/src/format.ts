/**
 * @yops-dev/core — YAML Parse / Serialize
 *
 * parseYOpsYaml: string → YOp[]
 * formatYOps:    YOp[] → string
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

  if (!Array.isArray(parsed)) {
    return { ok: false, error: 'Expected a YAML array of ops, got ' + typeof parsed };
  }

  return { ok: true, ops: parsed as YOp[] };
}

export function formatYOps(ops: YOp[]): string {
  return yaml.dump(ops, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
    quotingType: "'",
    forceQuotes: false,
  });
}
