'use client';

import { useState } from 'react';
import { useTriageStore, type TriageItem, type TriageDecision, type TriageSource } from '@/store/triageStore';
import { useExtractionUIStore } from '@/store/extractionUIStore';
import { cn } from '@/lib/utils';

/**
 * TriageView — Phase 2. Compact rows for accepting/dismissing extracted items.
 * Each row is a single topic. Expand to toggle individual slots.
 */

// ── Source tag component ──

const SOURCE_TAG_STYLES: Record<TriageSource, { bg: string; color: string; label: string }> = {
  user: { bg: 'rgba(139,92,246,0.15)', color: 'var(--accent-extract)', label: 'USER' },
  llm: { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa', label: 'LLM' },
  both: { bg: 'rgba(250,204,21,0.15)', color: '#facc15', label: 'BOTH' },
};

function SourceTag({ source }: { source: TriageSource }) {
  const style = SOURCE_TAG_STYLES[source];
  return (
    <span
      className="shrink-0"
      style={{
        fontSize: 7,
        fontWeight: 700,
        padding: '1px 5px',
        borderRadius: 3,
        letterSpacing: '0.5px',
        background: style.bg,
        color: style.color,
      }}
    >
      {style.label}
    </span>
  );
}

// ── Expanded slots ──

function SlotToggles({ item }: { item: TriageItem }) {
  const slotToggles = useTriageStore((s) => s.slotToggles);
  const toggleSlot = useTriageStore((s) => s.toggleSlot);
  const toggles = slotToggles[item.id] ?? {};

  return (
    <div
      style={{
        padding: '0 0 6px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        background: 'rgba(255,255,255,0.01)',
      }}
    >
      {Object.entries(item.slots).map(([key, value]) => {
        const isOn = toggles[key] !== false;
        return (
          <div
            key={key}
            className={cn('flex items-center gap-1.5 cursor-pointer rounded-[3px]', isOn ? '' : '')}
            style={{
              padding: '2px 10px 2px 0',
              fontSize: 10,
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            }}
            onClick={() => toggleSlot(item.id, key, !isOn)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') toggleSlot(item.id, key, !isOn);
            }}
            role="checkbox"
            aria-checked={isOn}
            tabIndex={0}
          >
            {/* Checkbox */}
            <span
              className="flex items-center justify-center shrink-0"
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                border: isOn ? 'none' : '1px solid var(--stroke-light, #333648)',
                background: isOn ? '#4ade80' : 'transparent',
                color: isOn ? '#000' : 'transparent',
                fontSize: 7,
                opacity: isOn ? 1 : 0.3,
              }}
            >
              {isOn && '\u2713'}
            </span>
            {/* Key */}
            <span
              style={{
                color: 'var(--text-tertiary)',
                opacity: isOn ? 1 : 0.3,
                textDecoration: isOn ? 'none' : 'line-through',
              }}
            >
              {key}:
            </span>
            {/* Value */}
            <span
              style={{
                color: 'var(--text-secondary)',
                opacity: isOn ? 1 : 0.3,
                textDecoration: isOn ? 'none' : 'line-through',
              }}
            >
              {typeof value === 'string' ? value : JSON.stringify(value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Compact row ──

function TriageRow({ item }: { item: TriageItem }) {
  const [expanded, setExpanded] = useState(false);
  const decisions = useTriageStore((s) => s.decisions);
  const acceptItem = useTriageStore((s) => s.acceptItem);
  const dismissItem = useTriageStore((s) => s.dismissItem);

  const decision: TriageDecision = decisions[item.id] ?? 'pending';
  const isAccepted = decision === 'accepted';
  const isDismissed = decision === 'dismissed';
  const slotCount = Object.keys(item.slots).length;

  // Bar color class
  const barStyle: React.CSSProperties = {
    width: 4,
    alignSelf: 'stretch',
    flexShrink: 0,
  };
  if (isDismissed) {
    barStyle.background = '#f87171';
    barStyle.opacity = 0.4;
  } else if (isAccepted && item.source !== 'llm') {
    // Auto-accepted (user/both)
    barStyle.background = '#4ade80';
    barStyle.opacity = 0.5;
  } else if (isAccepted) {
    barStyle.background = '#4ade80';
  } else {
    barStyle.background = 'var(--stroke-light, #333648)';
  }

  return (
    <>
      <div
        className={cn(
          'flex items-center cursor-pointer transition-all duration-150',
          isAccepted && 'bg-[rgba(74,222,128,0.02)]',
          isDismissed && 'opacity-20',
        )}
        style={{
          minHeight: 36,
          borderBottom: '1px solid rgba(255,255,255,0.03)',
        }}
      >
        {/* Color bar */}
        <div style={barStyle} />

        {/* Body */}
        <div
          className="flex flex-1 items-center gap-2 min-w-0"
          style={{ padding: '6px 10px' }}
        >
          {/* Expand chevron */}
          <span
            className="shrink-0 text-center transition-transform duration-150"
            style={{
              fontSize: 10,
              color: 'var(--text-tertiary)',
              width: 14,
              transform: expanded ? 'rotate(90deg)' : 'none',
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (!isDismissed) setExpanded(!expanded);
            }}
          >
            &#9656;
          </span>

          {/* Name */}
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              color: isDismissed ? 'var(--text-tertiary)' : 'var(--text-primary)',
              textDecoration: isDismissed ? 'line-through' : 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {item.id}
          </span>

          {/* Preview */}
          <span
            className="flex-1 min-w-0"
            style={{
              fontSize: 10,
              color: 'var(--text-tertiary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            }}
          >
            {item.preview}
          </span>

          {/* Source tag */}
          <SourceTag source={item.source} />

          {/* Slot count */}
          <span
            className="shrink-0"
            style={{
              fontSize: 9,
              color: 'var(--text-tertiary)',
            }}
          >
            {slotCount}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex gap-[1px] shrink-0 pr-1.5">
          <button
            type="button"
            className="flex items-center justify-center border-none rounded-[5px] cursor-pointer transition-all duration-[120ms] bg-transparent"
            style={{
              width: 26,
              height: 26,
              color: '#4ade80',
              opacity: isAccepted ? 1 : 0.4,
              fontSize: 12,
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (isAccepted) {
                // Toggle back to pending — re-dismiss or just leave
              } else {
                acceptItem(item.id);
              }
            }}
            aria-label="Accept item"
          >
            &#10003;
          </button>
          <button
            type="button"
            className="flex items-center justify-center border-none rounded-[5px] cursor-pointer transition-all duration-[120ms] bg-transparent"
            style={{
              width: 26,
              height: 26,
              color: '#f87171',
              opacity: 0.2,
              fontSize: 12,
            }}
            onClick={(e) => {
              e.stopPropagation();
              dismissItem(item.id);
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = '0.7';
              (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.15)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = '0.2';
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
            aria-label="Dismiss item"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Expanded slots */}
      {expanded && !isDismissed && <SlotToggles item={item} />}
    </>
  );
}

// ── Main ──

export function TriageView() {
  const items = useTriageStore((s) => s.items);
  const decisions = useTriageStore((s) => s.decisions);
  const acceptAll = useTriageStore((s) => s.acceptAll);
  const setPhase = useExtractionUIStore((s) => s.setPhase);

  const acceptedCount = Object.values(decisions).filter((d) => d === 'accepted').length;
  const dismissedCount = Object.values(decisions).filter((d) => d === 'dismissed').length;

  return (
    <div className="flex flex-col h-full">
      {/* Triage rows */}
      <div className="flex-1 overflow-y-auto">
        {items.map((item) => (
          <TriageRow key={item.id} item={item} />
        ))}
      </div>

      {/* Action bar */}
      <div
        className="flex items-center gap-2"
        style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--stroke-default)',
          background: 'rgba(255,255,255,0.03)',
        }}
      >
        <span className="flex-1" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
          {acceptedCount} accepted &middot; {dismissedCount} dismissed
        </span>
        <button
          type="button"
          className="cursor-pointer transition-all duration-150"
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid var(--stroke-default)',
            fontSize: 10,
            fontWeight: 600,
            background: 'transparent',
            color: 'var(--text-tertiary)',
          }}
          onClick={acceptAll}
        >
          Accept All
        </button>
        <button
          type="button"
          className="cursor-pointer transition-all duration-150"
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: 'none',
            fontSize: 10,
            fontWeight: 600,
            background: '#4ade80',
            color: '#000',
          }}
          onClick={() => setPhase('review')}
        >
          Review &rarr;
        </button>
      </div>
    </div>
  );
}
