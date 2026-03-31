'use client';

import { Loader2 } from 'lucide-react';
import { useExtractionStore } from '@/store/extractionStore';
import { useExtractionUIStore } from '@/store/extractionUIStore';
import { useTriageStore } from '@/store/triageStore';

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
  return { type: 'unknown', data: yop };
}

/* ── Icon mapping ── */

function yopIcon(type: string): { symbol: string; cls: string } {
  switch (type) {
    case 'add':
    case 'clone':
      return { symbol: '+', cls: 'add' };
    case 'set':
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

const STEP_LABELS: Record<string, string> = {
  session_state: 'Checking session...',
  readiness_gate: 'Readiness check...',
  drift_check: 'Checking topic drift...',
  extracting: 'LLM extracting...',
  reorganizing: 'Reorganizing tree...',
  validating: 'Validating...',
  persisting: 'Saving...',
};

export function YOpsFeed() {
  const feedYops = useExtractionStore((s) => s.feedYops);
  const pipelineSteps = useExtractionStore((s) => s.pipelineSteps);
  const isExtracting = useExtractionStore((s) => s.isExtracting);
  const phase = useExtractionUIStore((s) => s.phase);
  const setViewTab = useExtractionUIStore((s) => s.setViewTab);

  const count = feedYops.length;
  const firstYop = feedYops[0] as any;
  const total =
    count > 0 && typeof firstYop?.total === 'number' ? firstYop.total : count;

  // Triage data is ready if triageStore has items (either from live extraction or restored from DB)
  const triageItems = useTriageStore((s) => s.items);
  const hasTriageData = triageItems.length > 0;

  // ── Unified layout: scrollable content + persistent sticky footer ──
  return (
    <div className="flex flex-col h-full">
      {/* Scrollable content area */}
      <div className="flex-1 overflow-auto" style={{ padding: '6px 0' }}>
        {/* Empty state: no live YOps */}
        {count === 0 && !isExtracting && (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <span className="text-[var(--text-tertiary)]" style={{ fontSize: 11 }}>
              {hasTriageData
                ? 'YOps from previous extraction completed.'
                : 'No operations yet'}
            </span>
            {hasTriageData && (
              <button
                type="button"
                onClick={() => setViewTab('triage')}
                style={{
                  marginTop: 4, padding: '4px 12px', borderRadius: 6, border: 'none',
                  fontSize: 10, fontWeight: 600, background: '#4ade80', color: '#000', cursor: 'pointer',
                }}
              >
                View Triage &rarr;
              </button>
            )}
          </div>
        )}

        {/* Extracting with no YOps yet: centered spinner */}
        {count === 0 && isExtracting && (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--accent-extract)' }} />
            <span className="text-[var(--text-tertiary)]" style={{ fontSize: 11 }}>
              Waiting for YOps...
            </span>
          </div>
        )}

        {/* YOps feed items */}
        {feedYops.map((yop: any, idx: number) => {
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
              <div className="flex-1" style={{ lineHeight: 1.5 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{path}</span>
                <span style={{ color: 'var(--text-tertiary)', margin: '0 3px' }}>&rarr;</span>
                <span style={{ color: 'var(--text-primary)' }}>{value}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Persistent sticky footer: pipeline steps + progress + action ── */}
      <div
        style={{
          padding: '8px 14px',
          fontSize: 10,
          color: 'var(--text-tertiary)',
          borderTop: '1px solid var(--stroke-default)',
          flexShrink: 0,
        }}
      >
        {/* Progress bar + current step */}
        {(count > 0 || isExtracting) && (
          <div className="flex items-center gap-2">
            <span>{count}/{total || '...'}</span>
            <div
              className="flex-1 overflow-hidden"
              style={{ height: 2, background: 'var(--stroke-default)', borderRadius: 1 }}
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
            {isExtracting && (
              <span style={{ color: 'var(--accent-extract)', display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                <Loader2 className="h-3 w-3 animate-spin" />
                {(() => {
                  const last = pipelineSteps[pipelineSteps.length - 1];
                  return last ? (STEP_LABELS[last.step] ?? last.step) : 'starting...';
                })()}
              </span>
            )}
            {!isExtracting && count > 0 && <span style={{ color: '#4ade80' }}>complete</span>}
          </div>
        )}

        {/* Continue to Triage button */}
        {!isExtracting && hasTriageData && (
          <div className="flex justify-end" style={{ marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setViewTab('triage')}
              style={{
                padding: '5px 14px',
                borderRadius: 6,
                border: 'none',
                fontSize: 10,
                fontWeight: 600,
                background: '#4ade80',
                color: '#000',
                cursor: 'pointer',
              }}
            >
              Continue to Triage &rarr;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
