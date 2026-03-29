'use client';

import type { TreeChange } from '@t3x-dev/core';
import { Loader2 } from 'lucide-react';
import { useExtractionStore } from '@/store/extractionStore';

/**
 * YOpsFeed — Phase 1. Shows streaming extraction results as they arrive.
 *
 * Reads yopsHistory[0] (latest batch). Each change renders as a compact row
 * with operation icon, path, arrow, and value. Older items dim to 30% opacity.
 * Bottom progress bar shows count/total.
 */

function changeIcon(action: TreeChange['action']): { symbol: string; cls: string } {
  switch (action) {
    case 'add':
      return { symbol: '+', cls: 'add' };
    case 'update':
      return { symbol: '~', cls: 'update' };
    case 'remove':
      return { symbol: '-', cls: 'remove' };
    default:
      return { symbol: '?', cls: 'update' };
  }
}

function changePath(change: TreeChange): string {
  if (change.action === 'add') {
    const parent = change.parent_path ?? '';
    return parent ? `${parent}.${change.node.key}` : change.node.key;
  }
  return change.target_path;
}

function changeValue(change: TreeChange): string {
  if (change.action === 'add') {
    const slots = change.node.slots;
    const keys = Object.keys(slots);
    if (keys.length === 0) return 'new topic';
    const preview = keys
      .slice(0, 2)
      .map((k) => {
        const v = slots[k];
        return typeof v === 'string' ? v : JSON.stringify(v);
      })
      .join(', ');
    return keys.length > 2 ? `${preview}...` : preview;
  }
  if (change.action === 'update') {
    const slots = change.slots;
    const keys = Object.keys(slots);
    if (keys.length === 0) return 'updated';
    const preview = keys
      .slice(0, 2)
      .map((k) => {
        const v = slots[k];
        if (v === null) return `${k}: removed`;
        return typeof v === 'string' ? v : JSON.stringify(v);
      })
      .join(', ');
    return keys.length > 2 ? `${preview}...` : preview;
  }
  return 'removed';
}

const iconBgColors: Record<string, string> = {
  add: 'rgba(74,222,128,0.15)',
  update: 'rgba(250,204,21,0.15)',
  remove: 'rgba(248,113,113,0.15)',
};

const iconFgColors: Record<string, string> = {
  add: '#4ade80',
  update: '#facc15',
  remove: '#f87171',
};

export function YOpsFeed() {
  const yopsHistory = useExtractionStore((s) => s.yopsHistory);
  const isExtracting = useExtractionStore((s) => s.isExtracting);

  const latestBatch: TreeChange[] = yopsHistory[0] ?? [];
  const total = latestBatch.length;

  // Nothing yet and still extracting: show spinner
  if (total === 0 && isExtracting) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2
          className="h-5 w-5 animate-spin"
          style={{ color: 'var(--accent-extract)' }}
        />
        <span
          className="text-[var(--text-tertiary)]"
          style={{ fontSize: 11 }}
        >
          Processing conversation...
        </span>
      </div>
    );
  }

  // Nothing at all
  if (total === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-[var(--text-tertiary)]" style={{ fontSize: 11 }}>
          No operations yet
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Feed items */}
      <div style={{ padding: '6px 0' }}>
        {latestBatch.map((change, idx) => {
          const icon = changeIcon(change.action);
          const isDim = idx < total - 3;
          const iconCls = icon.cls;

          return (
            <div
              key={`${changePath(change)}-${idx}`}
              className="flex items-start gap-2"
              style={{
                padding: '4px 14px',
                fontSize: 11,
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                opacity: isDim ? 0.3 : 1,
                transition: 'opacity 150ms ease',
              }}
            >
              {/* Operation icon */}
              <div
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  fontSize: 9,
                  fontWeight: 800,
                  marginTop: 2,
                  background: iconBgColors[iconCls] ?? iconBgColors.update,
                  color: iconFgColors[iconCls] ?? iconFgColors.update,
                }}
              >
                {icon.symbol}
              </div>

              {/* Text content */}
              <div className="flex-1" style={{ lineHeight: 1.5 }}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {changePath(change)}
                </span>
                <span
                  style={{
                    color: 'var(--text-tertiary)',
                    margin: '0 3px',
                  }}
                >
                  &rarr;
                </span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {changeValue(change)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div
        className="flex items-center gap-2"
        style={{
          padding: '8px 14px',
          fontSize: 10,
          color: 'var(--text-tertiary)',
          borderTop: '1px solid var(--stroke-default)',
        }}
      >
        <span>
          {total}/{total}
        </span>
        <div
          className="flex-1 overflow-hidden"
          style={{
            height: 2,
            background: 'var(--stroke-default)',
            borderRadius: 1,
          }}
        >
          <div
            style={{
              height: '100%',
              width: '100%',
              background: 'var(--accent-extract)',
              borderRadius: 1,
              transition: 'width 0.3s',
            }}
          />
        </div>
        {!isExtracting && (
          <span style={{ color: '#4ade80' }}>complete</span>
        )}
        {isExtracting && (
          <span style={{ color: 'var(--accent-extract)' }}>extracting...</span>
        )}
      </div>
    </div>
  );
}
