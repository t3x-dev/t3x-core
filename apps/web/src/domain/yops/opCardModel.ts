/**
 * L2 — structured display model for a single SourcedYOp.
 *
 * The chat workspace's op cards (PR 3 of the YOps Workbench plan) need
 * more than the plain-English summary `summarizeOp()` returns. They need
 * a structured object with verb, path, source provenance, model, time,
 * and raw YAML so the React card can lay out the columns / chips and
 * the MCP `t3x_query` response can reuse the same shape (agent-native
 * parity, plan §5.7).
 *
 * This module owns that pure model. It is React-free, framework-free,
 * and only depends on `@t3x-dev/core` types and `js-yaml` for the raw
 * YAML serialization. Callers decide how to render — the card consumes
 * an OpCardModel; the agent surface can reproduce the same shape from
 * MCP-local code without taking a transitive dependency on apps/web.
 */

import type { HumanEditSurface, Source, SourcedYOp } from '@t3x-dev/core';
import * as yaml from 'js-yaml';
import { summarizeOp, verbOf } from './opSummary';

export type OpCardSourceKind = 'human' | 'llm' | 'unknown';

export interface OpCardSource {
  /** Origin family — drives the chip color + icon in the card. */
  kind: OpCardSourceKind;
  /** ISO timestamp (`source.at`) — passed through unchanged. */
  at: string;
  /**
   * For LLM ops: the model name (e.g. `gpt-4o-mini`). For human ops:
   * the author label. `null` when neither is known.
   */
  attribution: string | null;
  /**
   * For human ops: the UI surface that produced the edit, when known.
   * `null` for LLM ops and for legacy human rows that pre-date the
   * surface field. The card renders this as a "via Tree / via Raw YAML
   * / via Inline" suffix; absence just renders without a suffix.
   */
  surface: HumanEditSurface | null;
}

export interface OpCardProvenance {
  /** Source-turn hash. The full hash, not truncated — callers truncate for display. */
  turnHash: string;
  /** Quote excerpt the LLM cited. Empty string when the model didn't include one. */
  quote: string;
  /** Inclusive start char in the source turn content, when known. */
  startChar: number | null;
  /** Exclusive end char, when known. */
  endChar: number | null;
}

export interface OpCardModel {
  /**
   * Stable per-op identity — `${at}-${verb}-${path}` with safe fallbacks.
   * Useful as a React key without leaking display strings into hashing.
   */
  key: string;
  /** YOp verb: `define` | `set` | `populate` | `relate` | etc. */
  verb: string;
  /**
   * The op's primary path (or relation endpoint). `null` for ops that
   * don't carry a path (rare; mostly DCL ops in the registry).
   */
  path: string | null;
  /** Plain-English summary from `summarizeOp()`. */
  summary: string;
  /** Source family + attribution + timestamp. */
  source: OpCardSource;
  /**
   * LLM provenance, when the source is `llm` AND the op carries a
   * `turn_ref`. `null` for human ops. The card surfaces `quote` as
   * an excerpt next to the summary; the disclosure expands the full
   * fields including `startChar` / `endChar` for highlight ranges.
   */
  provenance: OpCardProvenance | null;
  /**
   * Pretty-printed YAML of the op (without `source`). What the
   * disclosure body shows when expanded. Computed once per model so
   * the card doesn't re-stringify on every render.
   */
  rawYaml: string;
}

/**
 * Strip the `source` field before serializing the YAML body. Source
 * meta is rendered separately (chips + provenance section); putting
 * it in the raw YAML block too would visually duplicate it.
 */
function stripSource(op: SourcedYOp): Record<string, unknown> {
  const { source: _drop, ...rest } = op as unknown as Record<string, unknown>;
  return rest;
}

/**
 * Pull the `path` (or relation `from`) out of a YOp's payload. Mirrors
 * the lookup in `summarizeOp` but exposes it as structured data so the
 * card can render path-as-chip independently.
 */
function extractPath(op: SourcedYOp): string | null {
  for (const [verb, value] of Object.entries(op as Record<string, unknown>)) {
    if (verb === 'source') continue;
    if (value && typeof value === 'object') {
      const v = value as Record<string, unknown>;
      if (typeof v.path === 'string') return v.path;
      // `relate` ops carry endpoints under `from` / `to`.
      if (typeof v.from === 'string') return v.from;
    }
  }
  return null;
}

/**
 * Build an `OpCardModel` from a `SourcedYOp`. Pure.
 *
 * Callers in `apps/web` consume this in React; the equivalent agent
 * surface (when added) re-implements or re-exports the same shape from
 * a layer MCP can import without crossing the `apps/web` boundary.
 */
export function buildOpCardModel(op: SourcedYOp): OpCardModel {
  const src = (op as unknown as { source: Source }).source;
  const verb = verbOf(op);
  const path = extractPath(op);

  let kind: OpCardSourceKind;
  let attribution: string | null;
  let surface: HumanEditSurface | null = null;
  let provenance: OpCardProvenance | null;
  if (src.type === 'llm') {
    kind = 'llm';
    attribution = src.model ?? null;
    const ref = src.turn_ref;
    provenance = ref
      ? {
          turnHash: ref.turn_hash,
          quote: ref.quote ?? '',
          startChar: typeof ref.start_char === 'number' ? ref.start_char : null,
          endChar: typeof ref.end_char === 'number' ? ref.end_char : null,
        }
      : null;
  } else if (src.type === 'human') {
    kind = 'human';
    attribution =
      typeof (src as { author?: unknown }).author === 'string'
        ? (src as { author: string }).author
        : null;
    const candidate = (src as { surface?: unknown }).surface;
    if (candidate === 'tree' || candidate === 'script' || candidate === 'inline') {
      surface = candidate;
    }
    provenance = null;
  } else {
    kind = 'unknown';
    attribution = null;
    provenance = null;
  }

  const rawYaml = yaml.dump(stripSource(op), { lineWidth: -1, noRefs: true });

  return {
    key: `${src.at}-${verb}-${path ?? 'noop'}`,
    verb,
    path,
    summary: summarizeOp(op),
    source: { kind, at: src.at, attribution, surface },
    provenance,
    rawYaml,
  };
}

/**
 * Map a HumanEditSurface to the user-facing label rendered as a "via X"
 * suffix. Centralized so card render and any agent surface render the
 * same string, and so adding a new surface only changes one file.
 */
export function humanEditSurfaceLabel(surface: HumanEditSurface): string {
  switch (surface) {
    case 'tree':
      return 'Tree';
    case 'script':
      return 'Raw YAML';
    case 'inline':
      return 'Inline';
  }
}
