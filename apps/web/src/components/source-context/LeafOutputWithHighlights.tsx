'use client';

/**
 * LeafOutputWithHighlights — Renders leaf output text with committed nodes
 * highlighted in green. Finds node text within the output and highlights
 * matching regions using progressive text search.
 *
 * Extracted from CommitSourceContext for reusability and testing.
 */

import { useMemo } from 'react';
import type { LeafContentNode } from '@/hooks/useSourceContextData';

interface LeafOutputWithHighlightsProps {
  output: string;
  nodes: LeafContentNode[];
}

export function LeafOutputWithHighlights({ output, nodes }: LeafOutputWithHighlightsProps) {
  // Find highlight ranges by locating node text within the output.
  // Sorts by first occurrence position in the output for correct progressive matching,
  // then merges overlapping ranges to prevent segment builder corruption.
  const highlights = useMemo(() => {
    // First pass: find each node's position in the output for ordering
    const positioned = nodes
      .map((sg) => ({ sg, pos: output.indexOf(sg.node.text) }))
      .filter((p) => p.pos !== -1)
      .sort((a, b) => a.pos - b.pos);

    // Second pass: progressive search using the sorted order
    const ranges: Array<{ start: number; end: number }> = [];
    let searchFrom = 0;
    for (const { sg } of positioned) {
      const idx = output.indexOf(sg.node.text, searchFrom);
      if (idx !== -1) {
        ranges.push({ start: idx, end: idx + sg.node.text.length });
        searchFrom = idx + sg.node.text.length;
      }
    }
    // Merge overlapping ranges
    const merged: Array<{ start: number; end: number }> = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r.start <= last.end) {
        last.end = Math.max(last.end, r.end);
      } else {
        merged.push({ ...r });
      }
    }
    return merged;
  }, [output, nodes]);

  if (highlights.length === 0) {
    // No matches found — show output as plain text + node list
    return (
      <div className="space-y-3">
        <div className="text-[0.875rem] leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap break-words">
          {output}
        </div>
        <div className="border-t border-[var(--color-border-light)] pt-2">
          <p className="text-xs text-[var(--color-text-muted)] mb-1">Committed nodes:</p>
          <ul className="space-y-1">
            {nodes.map((sg) => (
              <li
                key={sg.node.id}
                className="flex items-start gap-2 p-1.5 bg-[var(--status-success-muted)] rounded border border-[var(--status-success)]/20"
              >
                <span className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)] px-1 py-0.5 rounded shrink-0">
                  {sg.node.id}
                </span>
                <span className="text-xs text-[var(--color-text-secondary)] break-words">
                  {sg.node.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // Build segments: interleave plain text and highlighted portions
  const segments: Array<{ text: string; highlighted: boolean; offset: number }> = [];
  let cursor = 0;
  for (const h of highlights) {
    if (h.start > cursor) {
      segments.push({ text: output.slice(cursor, h.start), highlighted: false, offset: cursor });
    }
    segments.push({ text: output.slice(h.start, h.end), highlighted: true, offset: h.start });
    cursor = h.end;
  }
  if (cursor < output.length) {
    segments.push({ text: output.slice(cursor), highlighted: false, offset: cursor });
  }

  return (
    <div className="text-[0.875rem] leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap break-words">
      {segments.map((seg) =>
        seg.highlighted ? (
          <mark
            key={`h-${seg.offset}`}
            className="bg-[var(--status-success-muted)] text-[var(--color-text)] rounded-sm px-0.5"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={`t-${seg.offset}`}>{seg.text}</span>
        )
      )}
    </div>
  );
}
