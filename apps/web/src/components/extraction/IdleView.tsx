'use client';

import { useCommitStore } from '@/store/commitStore';

/**
 * IdleView — shown when phase='idle'.
 *
 * Two states:
 * 1. No prior data: centered icon + instructional text + Cmd+E hint
 * 2. Has committed nodes: collapsed committed node rows + optional extract nudge
 */
export function IdleView() {
  const committedNodeSnapshot = useCommitStore((s) => s.committedNodeSnapshot);
  const committedKeys = Object.keys(committedNodeSnapshot);
  const hasCommitted = committedKeys.length > 0;

  if (!hasCommitted) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center"
        style={{ padding: '40px 24px', gap: 12 }}
      >
        <div style={{ fontSize: 36, opacity: 0.12 }}>&#9878;</div>
        <div
          className="text-[var(--text-tertiary)]"
          style={{ fontSize: 11, lineHeight: 1.7 }}
        >
          Chat with the AI, then click{' '}
          <strong className="text-[var(--accent-commit)]">Extract</strong>
          <br />
          when you want to save key points.
        </div>
        <div
          className="text-[var(--text-tertiary)]"
          style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}
        >
          Keyboard shortcut: Cmd+E
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Section header */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: '7px 14px',
          fontSize: 9,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '1px',
          color: 'var(--text-tertiary)',
          background: 'rgba(255,255,255,0.015)',
          borderBottom: '1px solid var(--stroke-default)',
        }}
      >
        <span>Committed</span>
        <span style={{ fontWeight: 400 }}>from previous extraction</span>
      </div>

      {/* Committed rows */}
      <div style={{ padding: '2px 0', opacity: 0.5 }}>
        {committedKeys.map((key) => {
          const node = committedNodeSnapshot[key];
          const slotCount = node ? Object.keys(node.slots).length : 0;
          return (
            <div
              key={key}
              className="flex items-center gap-1.5 cursor-pointer"
              style={{ padding: '5px 10px 5px 14px', minHeight: 28 }}
            >
              {/* Green bar */}
              <div
                style={{
                  width: 4,
                  alignSelf: 'stretch',
                  background: '#4ade80',
                  opacity: 0.25,
                }}
              />
              {/* Check mark */}
              <span
                style={{ fontSize: 10, color: '#4ade80', opacity: 0.4 }}
              >
                &#10003;
              </span>
              {/* Node key */}
              <span
                className="flex-1"
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  color: 'var(--text-tertiary)',
                }}
              >
                {key}:
              </span>
              {/* Slot count badge */}
              <span
                style={{
                  fontSize: 9,
                  padding: '1px 6px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--text-tertiary)',
                }}
              >
                {slotCount} slot{slotCount !== 1 ? 's' : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
