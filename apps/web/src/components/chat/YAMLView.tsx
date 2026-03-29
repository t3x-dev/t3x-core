'use client';

import type { TreeNode, SlotValue } from '@t3x-dev/core';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nestNodes } from '@/lib/treeNesting';
import { parseDisplayYAML, toDisplayYAML } from '@/lib/liteYaml';
import { traceChatToYaml, traceYamlToChat } from '@/lib/hoverTrace';
import { RELEVANCE_THRESHOLD, type RelevanceContext, relevanceScore } from '@/lib/relevanceScore';
import { useExtractionStore } from '@/store/extractionStore';
import { useExtractionUIStore } from '@/store/extractionUIStore';
import { useCommitStore } from '@/store/commitStore';
import { TreeHistoryPopover } from './TreeHistoryPopover';
import { type CompatNode, contentToNodes, treesToNodes } from '@/lib/treeCompat';

// ── YAML Rendering Helpers ──

interface YAMLLine {
  text: string;
  treeId: string;
  slotKey: string | null;
  changeType: 'add' | 'update' | 'remove' | null;
  isAutoSelected: boolean;
  isEmpty: boolean;
  isCollapsed?: boolean;
  collapsedSlotCount?: number;
}

function formatValue(value: SlotValue): string {
  if (typeof value === 'string') {
    // Only quote strings that need it (contain YAML special chars or could be misinterpreted)
    const needsQuote = /[:#{}[\],&*?|>!%@`]/.test(value) || value === '' || value === 'true' || value === 'false' || value === 'null' || /^\d+$/.test(value);
    return needsQuote ? `"${value}"` : value;
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object' && value !== null && 'ref' in value) {
    return `*${(value as { ref: string }).ref}`;
  }
  return String(value);
}

function renderSlotLines(
  lines: YAMLLine[],
  key: string,
  value: SlotValue,
  indent: number,
  treeId: string,
  slotKey: string,
  changeType: 'add' | 'update' | 'remove' | null,
  isAutoSelected: boolean
): void {
  const pad = '  '.repeat(indent);

  // Simple values: key: "value"
  if (typeof value === 'string' || typeof value === 'number') {
    lines.push({
      text: `${pad}${key}: ${formatValue(value)}`,
      treeId,
      slotKey,
      changeType,
      isAutoSelected,
      isEmpty: false,
    });
    return;
  }

  // SlotRef: key: *f_002
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && 'ref' in value) {
    lines.push({
      text: `${pad}${key}: ${formatValue(value)}`,
      treeId,
      slotKey,
      changeType,
      isAutoSelected,
      isEmpty: false,
    });
    return;
  }

  // InlineNode: nested object with type + slots
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'type' in value &&
    'slots' in value
  ) {
    const inlineNode = value as {
      type: string;
      slots: Record<string, SlotValue>;
      _sourceNodeId?: string;
    };
    const childNodeId = inlineNode._sourceNodeId ?? treeId;
    lines.push({
      text: `${pad}${key}:`,
      treeId: childNodeId,
      slotKey: null,
      changeType,
      isAutoSelected,
      isEmpty: false,
    });
    for (const [k, v] of Object.entries(inlineNode.slots)) {
      renderSlotLines(lines, k, v, indent + 1, childNodeId, k, changeType, isAutoSelected);
    }
    return;
  }

  // Array — always use bullet points
  if (Array.isArray(value)) {
    const arr = value as SlotValue[];
    lines.push({
      text: `${pad}${key}:`,
      treeId,
      slotKey,
      changeType,
      isAutoSelected,
      isEmpty: false,
    });
    for (const item of arr) {
      if (typeof item === 'string' || typeof item === 'number') {
        lines.push({
          text: `${pad}  - ${formatValue(item)}`,
          treeId,
          slotKey,
          changeType,
          isAutoSelected,
          isEmpty: false,
        });
      } else if (typeof item === 'object' && item !== null && 'type' in item && 'slots' in item) {
        // InlineNode in array
        const inlineNode = item as {
          type: string;
          slots: Record<string, SlotValue>;
          _sourceNodeId?: string;
        };
        const childNodeId = inlineNode._sourceNodeId ?? treeId;
        lines.push({
          text: `${pad}  - ${inlineNode.type}:`,
          treeId: childNodeId,
          slotKey: null,
          changeType,
          isAutoSelected,
          isEmpty: false,
        });
        for (const [k, v] of Object.entries(inlineNode.slots)) {
          renderSlotLines(lines, k, v, indent + 2, childNodeId, k, changeType, isAutoSelected);
        }
      } else {
        lines.push({
          text: `${pad}  - ${formatValue(item)}`,
          treeId,
          slotKey,
          changeType,
          isAutoSelected,
          isEmpty: false,
        });
      }
    }
    return;
  }

  // Fallback
  lines.push({
    text: `${pad}${key}: ${JSON.stringify(value)}`,
    treeId,
    slotKey,
    changeType,
    isAutoSelected,
    isEmpty: false,
  });
}

// ── Component ──

export function YAMLView() {
  const draft = useExtractionStore((s) => s.draft);
  const applyTreeChanges = useExtractionStore((s) => s.applyTreeChanges);
  const yopsHistory = useExtractionStore((s) => s.yopsHistory);
  const yopsLog = useExtractionStore((s) => s.yopsLog);
  const isExtracting = useExtractionStore((s) => s.isExtracting);
  const hoveredNodeId = useExtractionUIStore((s) => s.hoveredNodeId);
  const hoveredTurnIndex = useExtractionUIStore((s) => s.hoveredTurnIndex);
  const hoveredFromChat = useExtractionUIStore((s) => s.hoveredFromChat);
  const scrollToCenter = useExtractionUIStore((s) => s.scrollToCenter);
  const setHoveredNodeId = useExtractionUIStore((s) => s.setHoveredNodeId);
  const gateIssues = useExtractionUIStore((s) => s.gateIssues);
  const llmHighlightedNodeIds = useExtractionUIStore((s) => s.llmHighlightedNodeIds);
  const confirmedNodeIds = useCommitStore((s) => s.confirmedNodeIds);
  const confirmedSlotKeys = useCommitStore((s) => s.confirmedSlotKeys);
  const confirmNode = useCommitStore((s) => s.confirmNode);
  const unconfirmNode = useCommitStore((s) => s.unconfirmNode);
  const confirmSlot = useCommitStore((s) => s.confirmSlot);
  const unconfirmSlot = useCommitStore((s) => s.unconfirmSlot);
  const committedNodeIds = useCommitStore((s) => s.committedNodeIds);
  const manualEditedNodeIds = useCommitStore((s) => s.manualEditedNodeIds);

  // Track DOM refs for each YAML line by treeId for Chat→YAML scrolling
  const lineRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // When a chat span is clicked/hovered (hoveredFromChat=true), scroll the YAML line into view
  useEffect(() => {
    if (hoveredFromChat && hoveredNodeId) {
      const el = lineRefs.current.get(hoveredNodeId);
      if (el) {
        el.scrollIntoView({
          behavior: 'smooth',
          block: scrollToCenter ? 'center' : 'nearest',
        });
        // Reset scrollToCenter after scroll
        if (scrollToCenter) {
          useExtractionUIStore.setState({ scrollToCenter: false });
        }
      }
    }
  }, [hoveredFromChat, hoveredNodeId, scrollToCenter]);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [expandedCollapsed, setExpandedCollapsed] = useState<Record<string, boolean>>({});

  const yamlText = toDisplayYAML(draft);

  useEffect(() => {
    if (!isEditing) setEditValue(yamlText);
  }, [yamlText, isEditing]);

  const handleEdit = useCallback(() => {
    setEditValue(yamlText);
    setIsEditing(true);
  }, [yamlText]);

  const handleSave = useCallback(() => {
    const delta = parseDisplayYAML(editValue, draft);
    const hasChanges =
      delta.changes.length > 0 ||
      (delta.new_relations?.length ?? 0) > 0 ||
      (delta.remove_relations?.length ?? 0) > 0;
    if (hasChanges) applyTreeChanges(delta, 'manual');
    setIsEditing(false);
  }, [editValue, draft, applyTreeChanges]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditValue(yamlText);
  }, [yamlText]);

  // Build change map with age from yops history (index 0 = most recent)
  const changeMap = useMemo(() => {
    const map = new Map<string, { action: 'add' | 'update' | 'remove'; age: number }>();
    // Iterate oldest→newest so newer entries overwrite
    for (let age = yopsHistory.length - 1; age >= 0; age--) {
      for (const c of yopsHistory[age]) {
        const id = c.action === 'add'
          ? (c.parent_path ? `${c.parent_path}.${c.node.key}` : c.node.key)
          : c.target_path;
        map.set(id, { action: c.action, age });
      }
    }
    return map;
  }, [yopsHistory]);

  // Build relevance context
  const relevanceCtx = useMemo((): RelevanceContext => {
    const turnsAgoMap: Record<string, number> = {};
    const touchCountMap: Record<string, number> = {};
    const total = yopsLog.length;
    for (let i = yopsLog.length - 1; i >= 0; i--) {
      const turnsAgo = total - 1 - i;
      const delta = yopsLog[i].yops as { changes?: Array<{ action: string; parent_path?: string; node?: { key: string }; target_path?: string }> };
      for (const c of delta.changes ?? []) {
        const fid = c.action === 'add'
          ? (c.parent_path ? `${c.parent_path}.${c.node?.key}` : c.node?.key ?? '')
          : (c.target_path ?? '');
        if (!(fid in turnsAgoMap)) turnsAgoMap[fid] = turnsAgo;
        touchCountMap[fid] = (touchCountMap[fid] ?? 0) + 1;
      }
    }
    const relationDegreeMap: Record<string, number> = {};
    for (const r of draft.relations) {
      relationDegreeMap[r.from] = (relationDegreeMap[r.from] ?? 0) + 1;
      relationDegreeMap[r.to] = (relationDegreeMap[r.to] ?? 0) + 1;
    }
    return {
      confirmedNodeIds,
      llmHighlightedNodeIds,
      turnsAgoMap,
      touchCountMap,
      relationDegreeMap,
    };
  }, [yopsLog, draft.relations, confirmedNodeIds, llmHighlightedNodeIds]);

  // Convert to compat trees (with .id, .type) for display and relevance scoring
  const nestedNodes = useMemo(() => contentToNodes(draft), [draft]);

  const sortedNodes = useMemo(() => {
    return [...nestedNodes].sort(
      (a, b) => relevanceScore(b, relevanceCtx).score - relevanceScore(a, relevanceCtx).score
    );
  }, [nestedNodes, relevanceCtx]);

  // Build per-line metadata for the YAML display
  // Renders the tree HIERARCHICALLY with proper indentation
  const yamlLines = useMemo(() => {
    const lines: YAMLLine[] = [];

    function renderTreeNode(node: TreeNode, indent: number, parentPath: string): void {
      const pad = '  '.repeat(indent);
      const nodePath = parentPath ? `${parentPath}/${node.key}` : node.key;
      const changeEntry = changeMap.get(nodePath) ?? changeMap.get(nodePath.replace(/\//g, '.'));
      const change = changeEntry?.action ?? null;
      const isAuto = false;

      // Node header
      lines.push({
        text: `${pad}${node.key}:`,
        treeId: nodePath,
        slotKey: null,
        changeType: change,
        isAutoSelected: isAuto,
        isEmpty: false,
      });

      // Slot lines
      for (const [key, value] of Object.entries(node.slots)) {
        renderSlotLines(lines, key, value, indent + 1, nodePath, key, change, isAuto);
      }

      // Children (recursive — proper nesting)
      for (const child of node.children) {
        renderTreeNode(child, indent + 1, nodePath);
      }
    }

    for (const tree of draft.trees) {
      renderTreeNode(tree, 0, '');
      // Blank separator between root trees
      lines.push({
        text: '',
        treeId: tree.key,
        slotKey: null,
        changeType: null,
        isAutoSelected: false,
        isEmpty: true,
      });
    }

    return lines;
  }, [sortedNodes, changeMap, relevanceCtx, expandedCollapsed]);

  // Reverse highlight: when hovering a chat message, which YAML paths light up?
  const reverseHighlightPaths = useMemo(() => {
    if (hoveredTurnIndex == null) return new Set<string>();
    const paths = traceChatToYaml(draft, hoveredTurnIndex);
    // Also include child paths for highlighting
    const expanded = new Set<string>();
    for (const p of paths) {
      expanded.add(p);
      // Add parent paths so the header lights up too
      const segments = p.split('/');
      for (let i = 1; i < segments.length; i++) {
        expanded.add(segments.slice(0, i).join('/'));
      }
    }
    return expanded;
  }, [hoveredTurnIndex, draft]);

  if (draft.trees.length === 0 && !isEditing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        {isExtracting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-[var(--accent-commit)]" />
            <p className="text-xs text-[var(--text-tertiary)]">Extracting nodes...</p>
          </>
        ) : (
          <p className="text-xs text-[var(--text-tertiary)]">No trees yet</p>
        )}
      </div>
    );
  }

  const deltaBarColors: Record<string, string> = {
    add: '#4ade80',
    update: '#facc15',
    remove: '#f87171',
  };

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          YAML
        </span>
        <div className="flex gap-1">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded px-2 py-0.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="rounded bg-[var(--accent-commit)] px-2 py-0.5 text-xs text-white hover:opacity-90"
              >
                Save
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleEdit}
              className="rounded px-2 py-0.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {isEditing ? (
        <textarea
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="flex-1 resize-none rounded border border-[var(--stroke-default)] bg-[var(--surface-panel)] p-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-commit)]"
          spellCheck={false}
        />
      ) : (
        <div className="flex-1 overflow-auto rounded border border-[var(--stroke-default)] bg-[var(--surface-panel)]">
          {yamlLines.map((line, i) => {
            // Blank separator line
            if (line.isEmpty) return <div key={i} style={{ height: 4 }} />;

            const isNodeLine = line.slotKey === null;
            const isConfirmed = isNodeLine
              ? !!confirmedNodeIds[line.treeId]
              : !!confirmedSlotKeys[line.treeId]?.[line.slotKey!];

            // Check if this row is highlighted by reverse hover (chat → YAML via turn hover)
            const isReverseHighlighted = reverseHighlightPaths.has(line.treeId);
            // Check if this row is highlighted from chat source-map interaction (purple)
            const isChatHighlighted = hoveredFromChat && hoveredNodeId === line.treeId;

            // Collapsed trees get distinct grey background
            const collapsedBg = 'rgba(128, 128, 128, 0.1)';

            // Background priority: collapsed > chat-highlight (purple) > reverse-highlight (blue) > confirmed > auto-selected > transparent
            const bg =
              line.isCollapsed && line.slotKey === null
                ? collapsedBg
                : isChatHighlighted
                  ? 'rgba(139, 92, 246, 0.15)'
                  : isReverseHighlighted
                    ? 'rgba(96, 165, 250, 0.15)'
                    : isConfirmed
                      ? 'rgba(74, 222, 128, 0.1)'
                      : line.isAutoSelected
                        ? 'rgba(96, 165, 250, 0.06)'
                        : 'transparent';

            const handleCheck = () => {
              // Collapsed tree header — toggle expand
              if (line.isCollapsed && isNodeLine) {
                setExpandedCollapsed((prev) => ({ ...prev, [line.treeId]: !prev[line.treeId] }));
                return;
              }
              if (isNodeLine) {
                isConfirmed ? unconfirmNode(line.treeId) : confirmNode(line.treeId);
              } else {
                isConfirmed
                  ? unconfirmSlot(line.treeId, line.slotKey!)
                  : confirmSlot(line.treeId, line.slotKey!);
              }
            };

            const animationClass = (() => {
              if (!line.changeType) return 'yaml-node-move';
              switch (line.changeType) {
                case 'add': return 'animate-yaml-enter';
                case 'update': return 'animate-yaml-update';
                case 'remove': return 'animate-yaml-exit';
                default: return 'yaml-node-move';
              }
            })();

            return (
              <div
                key={i}
                className={`group/yaml-line ${animationClass}`}
                data-tree-id={isNodeLine ? line.treeId : undefined}
                ref={(el) => {
                  if (el) lineRefs.current.set(line.treeId, el);
                }}
                onMouseEnter={() => setHoveredNodeId(line.treeId, line.slotKey)}
                onMouseLeave={() => setHoveredNodeId(null)}
                onClick={() => {
                  // Click YAML slot → scroll source chat message into center view
                  const trace = traceYamlToChat(draft, line.treeId, line.slotKey);
                  if (trace.sourceTurnIndex != null) {
                    useExtractionUIStore.setState({ scrollToCenter: true });
                    setHoveredNodeId(line.treeId, line.slotKey);
                  }
                }}
                title={
                  isNodeLine && gateIssues[line.treeId]?.length
                    ? gateIssues[line.treeId]
                        .map((i) => `[${i.severity}] ${i.description}`)
                        .join('\n')
                    : undefined
                }
                style={{
                  display: 'flex',
                  alignItems: 'stretch',
                  background: bg,
                  minHeight: 20,
                  transition: 'background 0.15s',
                  cursor: 'pointer',
                  borderLeft:
                    isNodeLine && gateIssues[line.treeId]?.length
                      ? `3px solid ${gateIssues[line.treeId].some((i) => i.severity === 'error') ? '#f87171' : '#facc15'}`
                      : undefined,
                }}
              >
                {/* Checkbox column */}
                <div
                  style={{
                    width: 22,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isConfirmed}
                    onChange={handleCheck}
                    style={{
                      accentColor: '#4ade80',
                      cursor: 'pointer',
                      opacity: isConfirmed ? 1 : 0.25,
                      width: 11,
                      height: 11,
                    }}
                  />
                </div>

                {/* Change indicator color bar */}
                <div
                  style={{
                    width: 3,
                    flexShrink: 0,
                    background: manualEditedNodeIds.has(line.treeId)
                      ? '#60a5fa' // blue — manual edit
                      : line.changeType
                        ? deltaBarColors[line.changeType]
                        : 'transparent',
                    opacity: manualEditedNodeIds.has(line.treeId)
                      ? 1
                      : line.changeType
                        ? (() => {
                            const entry = changeMap.get(line.treeId);
                            if (!entry) return 1;
                            // age 0 → 1.0, age 1 → 0.5, age 2 → 0.25
                            return entry.age === 0 ? 1 : entry.age === 1 ? 0.5 : 0.25;
                          })()
                        : 1,
                  }}
                />

                {/* YAML text — actual monospace, untouched */}
                <pre
                  style={{
                    margin: 0,
                    padding: '1px 6px',
                    fontSize: 11,
                    lineHeight: '18px',
                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                    color: line.isCollapsed
                      ? 'var(--text-tertiary)'
                      : isNodeLine
                        ? 'var(--text-primary)'
                        : 'var(--text-secondary)',
                    fontWeight: line.isCollapsed ? 400 : isNodeLine ? 600 : 400,
                    fontStyle:
                      line.isCollapsed && line.slotKey === null && !expandedCollapsed[line.treeId]
                        ? 'italic'
                        : undefined,
                    whiteSpace: 'pre',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {isNodeLine && committedNodeIds[line.treeId] && (
                    <span
                      style={{ fontSize: 9, color: 'rgba(74, 222, 128, 0.6)', marginRight: 4 }}
                      title="Committed"
                    >
                      ✓
                    </span>
                  )}
                  {line.text}
                  {line.slotKey === null && manualEditedNodeIds.has(line.treeId) && (
                    <span
                      style={{
                        fontSize: 9,
                        padding: '0 4px',
                        borderRadius: 3,
                        background: 'rgba(96, 165, 250, 0.15)',
                        color: '#60a5fa',
                        marginLeft: 4,
                        fontWeight: 600,
                      }}
                    >
                      manual
                    </span>
                  )}
                  {isNodeLine && (
                    <span
                      className="opacity-0 group-hover/yaml-line:opacity-100 transition-opacity ml-1"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={() => {}}
                    >
                      <TreeHistoryPopover treeId={line.treeId} />
                    </span>
                  )}
                </pre>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
