'use client';

import type { YOp } from '@t3x-dev/core';
import { useEffect, useRef, useState } from 'react';

interface YOpsFeedProps {
  ops: YOp[];
  onGoToTriage: () => void;
  paceMs?: number;
}

function describeOp(op: YOp): { type: 'add' | 'update' | 'remove'; path: string; value: string } {
  if ('define' in op) {
    return {
      type: 'add',
      path: op.define.path,
      value: 'new topic',
    };
  }
  if ('populate' in op) {
    const slotPreview = Object.values(op.populate.values)
      .map(String)
      .slice(0, 2)
      .join(', ');
    return {
      type: 'update',
      path: op.populate.path,
      value: slotPreview || 'filled slots',
    };
  }
  if ('set' in op) return { type: 'update', path: op.set.path, value: String(op.set.value) };
  if ('drop' in op)
    return { type: 'remove', path: op.drop.path, value: 'removed' };
  if ('unset' in op) return { type: 'remove', path: op.unset.path, value: 'cleared' };
  if ('rename' in op) return { type: 'update', path: op.rename.path, value: `→ ${op.rename.to}` };
  const key = Object.keys(op)[0];
  return { type: 'update', path: key, value: JSON.stringify(Object.values(op)[0]).slice(0, 40) };
}

const TYPE_STYLES = {
  add: { bg: 'bg-[rgba(74,222,128,0.15)]', text: 'text-[var(--status-success)]', icon: '+' },
  update: { bg: 'bg-[rgba(250,204,21,0.15)]', text: 'text-[var(--status-warning)]', icon: '~' },
  remove: { bg: 'bg-[rgba(248,113,113,0.15)]', text: 'text-[var(--status-error)]', icon: '−' },
};

export function YOpsFeed({ ops, onGoToTriage, paceMs = 350 }: YOpsFeedProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (ops.length === 0) return;

    completedRef.current = false;
    setVisibleCount(0);

    let idx = 0;
    const timer = setInterval(() => {
      idx++;
      setVisibleCount(idx);

      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }

      if (idx >= ops.length) {
        clearInterval(timer);
        completedRef.current = true;
      }
    }, paceMs);

    return () => clearInterval(timer);
  }, [ops, paceMs]);

  const total = ops.length;
  const done = visibleCount >= total;
  const descriptions = ops.map(describeOp);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-1.5">
        {descriptions.map((desc, i) => {
          if (i >= visibleCount) return null;
          const isDim = visibleCount > 2 && i < visibleCount - 2;
          const style = TYPE_STYLES[desc.type];

          return (
            <div
              key={`${desc.path}-${i}`}
              className={`flex items-start gap-2 px-3.5 py-1 text-[11px] font-mono transition-opacity duration-150 ${
                isDim ? 'opacity-30' : 'opacity-100'
              }`}
            >
              <div
                className={`w-4 h-4 rounded flex items-center justify-center text-[9px] font-extrabold shrink-0 mt-0.5 ${style.bg} ${style.text}`}
              >
                {style.icon}
              </div>
              <div className="flex-1 leading-[1.5]">
                <span className="text-[var(--text-secondary)]">{desc.path}</span>
                <span className="text-[var(--text-tertiary)] mx-[3px]">&rarr;</span>
                <span className="text-[var(--text-primary)]">{desc.value}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 px-3.5 py-2 text-[10px] text-[var(--text-tertiary)] border-t border-[var(--stroke-default)]">
        <span>
          {visibleCount}/{total}
        </span>
        <div className="flex-1 h-[2px] bg-[var(--stroke-default)] rounded-sm overflow-hidden">
          <div
            className="h-full bg-[var(--accent)] rounded-sm transition-[width] duration-300"
            style={{ width: total > 0 ? `${(visibleCount / total) * 100}%` : '0%' }}
          />
        </div>
        {done && <span className="text-[var(--status-success)]">complete</span>}
      </div>
      {done && (
        <div
          className="flex items-center justify-between px-3.5 py-2"
          style={{ borderTop: '1px solid var(--stroke-default)', background: 'var(--hover-bg)' }}
        >
          <span className="text-[10px] text-[var(--status-success)]">
            {total} operations extracted
          </span>
          <button
            type="button"
            onClick={onGoToTriage}
            className="px-3.5 py-1.5 rounded-md bg-[var(--status-success)] text-black text-[10px] font-semibold hover:opacity-90 transition-opacity"
          >
            Triage →
          </button>
        </div>
      )}
    </div>
  );
}
