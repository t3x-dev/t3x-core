'use client';

import { Loader2 } from 'lucide-react';
import { useExtractionStore } from '@/store/extractionStore';

/**
 * YOpsFeed — Phase 1. Shows streaming extraction results as they arrive.
 *
 * Reads yopsHistory[0] (latest batch). Each item is a native YOp
 * (discriminated union: { add: AddOp } | { set: SetOp } | { drop: DropOp } | ...)
 * with additional `index` and `total` fields from the SSE envelope.
 *
 * Older items dim to 30% opacity. Bottom progress bar shows count/total.
 */

/* ── YOp type detection ── */

function getYOpType(yop: any): { type: string; data: any } {
  if ('add' in yop) return { type: 'add', data: yop.add };
  if ('set' in yop) return { type: 'set', data: yop.set };
  if ('drop' in yop) return { type: 'drop', data: yop.drop };
  if ('unset' in yop) return { type: 'unset', data: yop.unset };
  if ('rename' in yop) return { type: 'rename', data: yop.rename };
  if ('move' in yop) return { type: 'move', data: yop.move };
  if ('clone' in yop) return { type: 'clone', data: yop.clone };
  if ('nest' in yop) return { type: 'nest', data: yop.nest };
  if ('split' in yop) return { type: 'split', data: yop.split };
  if ('fold' in yop) return { type: 'fold', data: yop.fold };
  if ('merge' in yop) return { type: 'merge', data: yop.merge };
  if ('relate' in yop) return { type: 'relate', data: yop.relate };
  if ('unrelate' in yop) return { type: 'unrelate', data: yop.unrelate };
  // TreeChange format fallback (for manual changes that use the old format)
  if ('action' in yop) return { type: yop.action, data: yop };
  return { type: 'unknown', data: yop };
}

/* ── Icon mapping ── */

function yopIcon(type: string): { symbol: string; cls: string } {
  switch (type) {
    case 'add':
    case 'clone':
      return { symbol: '+', cls: 'add' };
    case 'set':
    case 'update':
    case 'rename':
    case 'move':
    case 'nest':
    case 'split':
    case 'fold':
    case 'merge':
    case 'relate':
    case 'unrelate':
      return { symbol: '~', cls: 'update' };
    case 'drop':
    case 'remove':
    case 'unset':
      return { symbol: '-', cls: 'remove' };
    default:
      return { symbol: '?', cls: 'update' };
  }
}

/* ── Path extraction ── */

function yopPath(type: string, data: any): string {
  switch (type) {
    case 'add': {
      // data.node is Record<string, unknown> — the key is the node name
      const nodeKey = data.node ? (Object.keys(data.node)[0] ?? '') : '';
      const parent = data.parent ?? '';
      return parent ? `${parent}.${nodeKey}` : nodeKey;
    }
    case 'set':
    case 'unset':
    case 'drop':
    case 'fold':
      return data.path ?? '';
    case 'rename':
    case 'move':
    case 'clone':
      return data.path ?? '';
    case 'nest':
      return (data.paths ?? []).join(', ');
    case 'split':
      return data.path ?? '';
    case 'merge':
      return (data.paths ?? []).join(', ');
    case 'relate':
    case 'unrelate':
      return `${data.from ?? ''} - ${data.to ?? ''}`;
    // TreeChange fallback
    case 'update':
    case 'remove':
      return data.target_path ?? '';
    default:
      return '';
  }
}

/* ── Value description ── */

function yopValue(type: string, data: any): string {
  switch (type) {
    case 'add': {
      // data.node is Record<string, unknown> — first key's value contains slots
      const nodeKey = data.node ? Object.keys(data.node)[0] : undefined;
      if (!nodeKey) return 'new topic';
      const slots = data.node[nodeKey];
      if (slots == null || typeof slots !== 'object') return 'new topic';
      const entries = Object.entries(slots as Record<string, unknown>);
      if (entries.length === 0) return 'new topic';
      const preview = entries
        .slice(0, 2)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join(', ');
      return entries.length > 2 ? `${preview}...` : preview;
    }
    case 'set': {
      const v = data.value;
      return typeof v === 'string' ? v : JSON.stringify(v);
    }
    case 'drop':
      return data.reason ? `removed (${data.reason})` : 'removed';
    case 'unset':
      return 'slot removed';
    case 'rename':
      return `renamed to ${data.to ?? '?'}`;
    case 'move':
      return `moved to ${data.to ?? '?'}`;
    case 'clone':
      return `cloned to ${data.to ?? '?'}`;
    case 'nest':
      return `nested under ${data.under ?? '?'}`;
    case 'split': {
      const keys = data.into ? Object.keys(data.into) : [];
      return `split into ${keys.join(', ') || '?'}`;
    }
    case 'fold':
      return 'folded';
    case 'merge':
      return `merged into ${data.into ?? '?'}`;
    case 'relate':
      return `${data.type ?? 'related'}`;
    case 'unrelate':
      return `unrelated (${data.type ?? ''})`;
    // TreeChange fallback
    case 'update': {
      const slots = data.slots;
      if (!slots) return 'updated';
      const keys = Object.keys(slots);
      if (keys.length === 0) return 'updated';
      const preview = keys
        .slice(0, 2)
        .map((k: string) => {
          const v = slots[k];
          if (v === null) return `${k}: removed`;
          return typeof v === 'string' ? v : JSON.stringify(v);
        })
        .join(', ');
      return keys.length > 2 ? `${preview}...` : preview;
    }
    case 'remove':
      return 'removed';
    default:
      return '';
  }
}

/* ── Style constants ── */

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

/* ── Component ── */

export function YOpsFeed() {
  const yopsHistory = useExtractionStore((s) => s.yopsHistory);
  const isExtracting = useExtractionStore((s) => s.isExtracting);

  const latestBatch: any[] = yopsHistory[0] ?? [];
  const count = latestBatch.length;

  // Use `total` from the first item's SSE envelope if available, else fall back to count
  const total =
    count > 0 && typeof latestBatch[0]?.total === 'number' ? latestBatch[0].total : count;

  // Nothing yet and still extracting: show spinner
  if (count === 0 && isExtracting) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--accent-extract)' }} />
        <span className="text-[var(--text-tertiary)]" style={{ fontSize: 11 }}>
          Processing conversation...
        </span>
      </div>
    );
  }

  // Nothing at all
  if (count === 0) {
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
        {latestBatch.map((yop, idx) => {
          const { type, data } = getYOpType(yop);
          const icon = yopIcon(type);
          const isDim = idx < count - 3;
          const iconCls = icon.cls;
          const path = yopPath(type, data);
          const value = yopValue(type, data);

          return (
            <div
              key={`${path}-${idx}`}
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
                <span style={{ color: 'var(--text-secondary)' }}>{path}</span>
                <span
                  style={{
                    color: 'var(--text-tertiary)',
                    margin: '0 3px',
                  }}
                >
                  &rarr;
                </span>
                <span style={{ color: 'var(--text-primary)' }}>{value}</span>
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
          {count}/{total}
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
              width: total > 0 ? `${Math.round((count / total) * 100)}%` : '0%',
              background: 'var(--accent-extract)',
              borderRadius: 1,
              transition: 'width 0.3s',
            }}
          />
        </div>
        {!isExtracting && <span style={{ color: '#4ade80' }}>complete</span>}
        {isExtracting && <span style={{ color: 'var(--accent-extract)' }}>extracting...</span>}
      </div>
    </div>
  );
}
