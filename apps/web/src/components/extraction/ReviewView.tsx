'use client';

import { useState, useCallback } from 'react';
import { useTriageStore } from '@/store/triageStore';
import { useExtractionUIStore } from '@/store/extractionUIStore';
import { useExtractionStore } from '@/store/extractionStore';
import { useCommitStore } from '@/store/commitStore';
import { traceYamlToChat } from '@/lib/hoverTrace';

/**
 * ReviewView — Phase 3. Shows accepted YAML from triage, with bidirectional
 * source tracing, manual-add badges, edit mode, and commit bar.
 */

// ── YAML line component ──

function YamlLine({
  bar,
  isHeader,
  slotKey,
  slotValue,
  isManual,
  nodePath,
}: {
  bar: 'green' | 'blue' | 'dim' | 'committed';
  isHeader: boolean;
  slotKey?: string;
  slotValue?: string;
  isManual?: boolean;
  nodePath: string;
}) {
  const draft = useExtractionStore((s) => s.draft);
  const setHoveredNodeId = useExtractionUIStore((s) => s.setHoveredNodeId);
  const setHoveredTurnIndex = useExtractionUIStore((s) => s.setHoveredTurnIndex);
  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);

  const barColors: Record<string, string> = {
    green: '#4ade80',
    blue: '#60a5fa',
    dim: 'var(--text-tertiary)',
    committed: '#4ade80',
  };

  const barOpacity: Record<string, number> = {
    green: 1,
    blue: 1,
    dim: 0.15,
    committed: 0.25,
  };

  // Trace on click
  const handleClick = useCallback(() => {
    const result = traceYamlToChat(draft, nodePath, slotKey ?? null);
    if (result.sourceTurnIndex != null) {
      setHoveredTurnIndex(result.sourceTurnIndex);
      setHoveredNodeId(nodePath, slotKey ?? null);
      setIsClicked(true);
    }
  }, [draft, nodePath, slotKey, setHoveredTurnIndex, setHoveredNodeId]);

  // Derive trace tag
  const traceResult = isHovered ? traceYamlToChat(draft, nodePath, slotKey ?? null) : null;
  const traceTag = traceResult?.sourceTurnIndex ? `\u2190 T${traceResult.sourceTurnIndex}` : null;

  return (
    <div
      className="flex items-stretch cursor-pointer transition-[background] duration-150"
      style={{
        minHeight: 22,
        background: isClicked ? 'rgba(139,92,246,0.06)' : isHovered ? 'rgba(255,255,255,0.04)' : 'transparent',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsClicked(false);
      }}
      onClick={handleClick}
    >
      {/* Color bar */}
      <div
        className="shrink-0"
        style={{
          width: 4,
          background: barColors[bar],
          opacity: barOpacity[bar],
        }}
      />
      {/* Text */}
      <div
        className="flex-1 overflow-hidden text-ellipsis"
        style={{
          padding: '2px 8px',
          fontSize: 11,
          lineHeight: '18px',
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          whiteSpace: 'pre',
        }}
      >
        {isHeader ? (
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            {nodePath}:
          </span>
        ) : (
          <>
            <span style={{ color: 'var(--text-secondary)' }}>
              {'  '}{slotKey}:{' '}
            </span>
            <span style={{ color: 'var(--text-primary)' }}>
              {slotValue}
            </span>
          </>
        )}

        {/* Trace tag */}
        {traceTag && (
          <span
            style={{
              fontSize: 8,
              color: 'var(--accent-commit)',
              opacity: isHovered ? 0.5 : 0,
              transition: 'opacity 0.15s',
              marginLeft: 4,
              cursor: 'pointer',
              padding: '1px 4px',
              borderRadius: 3,
            }}
          >
            {traceTag}
          </span>
        )}

        {/* Manual badge */}
        {isManual && (
          <span
            style={{
              fontSize: 8,
              color: '#60a5fa',
              padding: '1px 4px',
              background: 'rgba(96,165,250,0.15)',
              borderRadius: 3,
              marginLeft: 4,
            }}
          >
            manual
          </span>
        )}
      </div>
    </div>
  );
}

// ── Committed section ──

function CommittedSection() {
  const committedNodeSnapshot = useCommitStore((s) => s.committedNodeSnapshot);
  const keys = Object.keys(committedNodeSnapshot);
  if (keys.length === 0) return null;

  return (
    <>
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
          marginTop: 4,
        }}
      >
        <span>Committed</span>
        <span style={{ fontWeight: 400 }}>{keys.length} nodes</span>
      </div>
      <div style={{ padding: '2px 0', opacity: 0.4 }}>
        {keys.map((key) => {
          const node = committedNodeSnapshot[key];
          const slotCount = node ? Object.keys(node.slots).length : 0;
          return (
            <div
              key={key}
              className="flex items-center gap-1.5 cursor-pointer"
              style={{ padding: '5px 10px 5px 14px', minHeight: 28 }}
            >
              <div
                style={{
                  width: 4,
                  alignSelf: 'stretch',
                  background: '#4ade80',
                  opacity: 0.25,
                }}
              />
              <span style={{ fontSize: 10, color: '#4ade80', opacity: 0.4 }}>
                &#10003;
              </span>
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
              <span
                style={{
                  fontSize: 9,
                  padding: '1px 6px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--text-tertiary)',
                }}
              >
                {slotCount}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Main ──

export function ReviewView() {
  const getAcceptedContent = useTriageStore((s) => s.getAcceptedContent);
  const manualAdditions = useTriageStore((s) => s.manualAdditions);
  const resetTriage = useTriageStore((s) => s.reset);
  const setPhase = useExtractionUIStore((s) => s.setPhase);
  const commitNodes = useCommitStore((s) => s.commitNodes);
  const isCommitting = useCommitStore((s) => s.isCommitting);

  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState('');

  const accepted = getAcceptedContent();

  // Count totals
  let totalNodes = accepted.length;
  let totalSlots = 0;
  for (const item of accepted) {
    totalSlots += Object.keys(item.slots).length;
  }

  // Build set of manual keys per item for badge display
  const manualKeys = new Set<string>();
  for (const m of manualAdditions) {
    manualKeys.add(`${m.targetId}::${m.key}`);
  }

  // Convert accepted to YAML text for edit mode
  const toYamlText = useCallback(() => {
    const lines: string[] = [];
    for (const item of accepted) {
      lines.push(`${item.id}:`);
      for (const [key, value] of Object.entries(item.slots)) {
        lines.push(`  ${key}: ${value}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }, [accepted]);

  const handleEditToggle = () => {
    if (!editMode) {
      setEditText(toYamlText());
    }
    setEditMode(!editMode);
  };

  const handleCommit = async () => {
    try {
      await commitNodes('');
      setPhase('idle');
      resetTriage();
    } catch {
      // Error handled by store
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
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
          <span>Changes to commit</span>
          <span>
            <button
              type="button"
              className="cursor-pointer"
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                border: '1px solid var(--stroke-default)',
                fontSize: 9,
                fontWeight: 600,
                background: 'transparent',
                color: 'var(--text-secondary)',
              }}
              onClick={handleEditToggle}
            >
              {editMode ? 'Cancel' : 'Edit YAML'}
            </button>
          </span>
        </div>

        {editMode ? (
          /* Edit textarea */
          <div style={{ padding: 0 }}>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: 'none',
                outline: 'none',
                resize: 'none',
                background: 'var(--surface-panel)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                fontSize: 11,
                lineHeight: 1.6,
                minHeight: 200,
              }}
            />
            <div className="flex gap-2 justify-end" style={{ padding: '6px 10px' }}>
              <button
                type="button"
                className="cursor-pointer"
                style={{
                  padding: '4px 12px',
                  borderRadius: 4,
                  border: '1px solid var(--stroke-default)',
                  fontSize: 9,
                  fontWeight: 600,
                  background: 'transparent',
                  color: 'var(--text-tertiary)',
                }}
                onClick={() => setEditMode(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="cursor-pointer"
                style={{
                  padding: '4px 12px',
                  borderRadius: 4,
                  border: 'none',
                  fontSize: 9,
                  fontWeight: 600,
                  background: 'var(--accent-commit)',
                  color: '#fff',
                }}
                onClick={() => setEditMode(false)}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          /* YAML lines */
          <div style={{ padding: '2px 0' }}>
            {accepted.map((item, itemIdx) => (
              <div key={item.id}>
                {/* Node header */}
                <YamlLine
                  bar="green"
                  isHeader
                  nodePath={item.id}
                />
                {/* Slot lines */}
                {Object.entries(item.slots).map(([key, value]) => {
                  const isManual = manualKeys.has(`${item.id}::${key}`);
                  return (
                    <YamlLine
                      key={key}
                      bar={isManual ? 'blue' : 'green'}
                      isHeader={false}
                      slotKey={key}
                      slotValue={typeof value === 'string' ? value : JSON.stringify(value)}
                      isManual={isManual}
                      nodePath={item.id}
                    />
                  );
                })}
                {/* Spacer between nodes */}
                {itemIdx < accepted.length - 1 && <div style={{ height: 6 }} />}
              </div>
            ))}
          </div>
        )}

        {/* Committed section */}
        <CommittedSection />
      </div>

      {/* Commit bar */}
      <div
        className="flex items-center gap-2"
        style={{
          padding: '10px 14px',
          borderTop: '1px solid var(--stroke-default)',
          background: 'var(--surface-raised)',
        }}
      >
        {/* Back button */}
        <button
          type="button"
          className="cursor-pointer"
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid var(--stroke-default)',
            fontSize: 10,
            fontWeight: 600,
            background: 'transparent',
            color: 'var(--text-tertiary)',
          }}
          onClick={() => setPhase('triage')}
        >
          &larr; Back
        </button>

        {/* Stats */}
        <span className="flex-1" style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
          {totalNodes} node{totalNodes !== 1 ? 's' : ''} &middot; {totalSlots} slot{totalSlots !== 1 ? 's' : ''}
        </span>

        {/* Commit button */}
        <button
          type="button"
          className="cursor-pointer"
          style={{
            padding: '7px 16px',
            borderRadius: 6,
            border: 'none',
            fontSize: 11,
            fontWeight: 600,
            background: 'var(--accent-commit)',
            color: '#fff',
            opacity: isCommitting ? 0.6 : 1,
          }}
          disabled={isCommitting}
          onClick={handleCommit}
        >
          {isCommitting ? 'Committing...' : 'Commit'}
        </button>
      </div>
    </div>
  );
}
