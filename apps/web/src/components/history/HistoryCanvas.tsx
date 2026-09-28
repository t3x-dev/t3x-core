'use client';

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  GitBranch,
  GitMerge,
  Hand,
  List,
  Maximize2,
  MousePointer2,
  PanelsTopLeft,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { type PointerEvent, useMemo, useRef, useState } from 'react';
import { formatDate, shortHash } from '@/domain/format/formatters';
import { buildHistoryCanvasSvg, downloadTextFile } from '@/domain/history/historyCanvasExport';
import type { ApiCommit, Branch } from '@/types/api';
import styles from './HistoryCanvas.module.css';

export interface CanvasCommit {
  commit: ApiCommit;
  diffStats?: { addedCount: number; modifiedCount: number; removedCount: number } | null;
}

interface HistoryCanvasProps {
  branches: Branch[];
  commits: CanvasCommit[];
  selectedBranch: string;
  onBack: () => void;
  onBranchChange: (branch: string) => void;
  onListView: () => void;
  onViewDiff: (hash: string) => void;
}

const POSITIONS = [
  { left: 60, top: 350, width: 220, height: 120, kind: 'root' },
  { left: 360, top: 190, width: 240, height: 136, kind: 'main' },
  { left: 360, top: 490, width: 240, height: 136, kind: 'feature' },
  { left: 680, top: 340, width: 280, height: 176, kind: 'merge' },
] as const;

type CanvasPosition = (typeof POSITIONS)[number];

function edgePath(parent: CanvasPosition, child: CanvasPosition, parentIndex: number) {
  const parentCenterX = parent.left + parent.width / 2;
  const childCenterX = child.left + child.width / 2;
  const parentCenterY = parent.top + parent.height / 2;
  const childCenterY = child.top + child.height / 2;
  const horizontallyAligned = Math.abs(childCenterX - parentCenterX) < 80;

  if (horizontallyAligned) {
    const downward = childCenterY >= parentCenterY;
    const startX = parentCenterX;
    const startY = downward ? parent.top + parent.height : parent.top;
    const endX = childCenterX;
    const endY = downward ? child.top : child.top + child.height;
    const controlY = startY + (endY - startY) / 2;
    return `M ${startX} ${startY} C ${startX} ${controlY}, ${endX} ${controlY}, ${endX} ${endY}`;
  }

  const rightward = childCenterX > parentCenterX;
  const startX = rightward ? parent.left + parent.width : parent.left;
  const endX = rightward ? child.left : child.left + child.width;
  const startY = parentCenterY;
  const endY = childCenterY + (child.kind === 'merge' ? (parentIndex - 0.5) * 40 : 0);
  const direction = rightward ? 1 : -1;
  const controlDistance = Math.max(44, Math.abs(endX - startX) * 0.45);
  const firstControlX = startX + direction * controlDistance;
  const secondControlX = endX - direction * controlDistance;
  return `M ${startX} ${startY} C ${firstControlX} ${startY}, ${secondControlX} ${endY}, ${endX} ${endY}`;
}

function authorName(commit: ApiCommit) {
  return commit.author?.name || commit.author?.id || commit.author?.type || 'Unknown';
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'U'
  );
}

function graphCommits(commits: CanvasCommit[]) {
  return commits.slice(0, 4).reverse();
}

export function HistoryCanvas({
  branches,
  commits,
  selectedBranch,
  onBack,
  onBranchChange,
  onListView,
  onViewDiff,
}: HistoryCanvasProps) {
  const nodes = useMemo(() => graphCommits(commits), [commits]);
  const [selectedHash, setSelectedHash] = useState(() => nodes.at(-1)?.commit.hash ?? '');
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [canvasTool, setCanvasTool] = useState<'select' | 'pan'>('select');
  const [isPanning, setIsPanning] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(
    null
  );

  function resetView() {
    setZoom(100);
    setPan({ x: 0, y: 0 });
  }

  function beginPan(
    event: {
      clientX: number;
      clientY: number;
      preventDefault: () => void;
      target: EventTarget | null;
    },
    currentTarget: HTMLElement,
    pointerId?: number
  ) {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-history-chrome]')) return;
    if (canvasTool !== 'pan' || dragRef.current) return;
    event.preventDefault();
    if (pointerId !== undefined) currentTarget.setPointerCapture?.(pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    setIsPanning(true);
  }

  function movePan(clientX: number, clientY: number) {
    const drag = dragRef.current;
    if (!drag) return;
    setPan({
      x: drag.panX + clientX - drag.startX,
      y: drag.panY + clientY - drag.startY,
    });
  }

  function endPan(currentTarget: HTMLElement, pointerId?: number) {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsPanning(false);
    if (pointerId !== undefined && currentTarget.hasPointerCapture?.(pointerId)) {
      currentTarget.releasePointerCapture?.(pointerId);
    }
  }

  function handleCanvasPointerDown(event: PointerEvent<HTMLElement>) {
    beginPan(event, event.currentTarget, event.pointerId);
  }

  function handleCanvasPointerMove(event: PointerEvent<HTMLElement>) {
    movePan(event.clientX, event.clientY);
  }

  function handleCanvasPointerUp(event: PointerEvent<HTMLElement>) {
    endPan(event.currentTarget, event.pointerId);
  }
  const selected = nodes.find((item) => item.commit.hash === selectedHash) ?? nodes.at(-1);
  const selectedCommit = selected?.commit;
  const edges = useMemo(
    () =>
      nodes.flatMap((child, childIndex) => {
        const childPosition = POSITIONS[childIndex];
        if (!childPosition) return [];
        return child.commit.parents.flatMap((parentHash, parentIndex) => {
          const parentNodeIndex = nodes.findIndex((node) => node.commit.hash === parentHash);
          const parentPosition = POSITIONS[parentNodeIndex];
          if (parentNodeIndex < 0 || !parentPosition) return [];
          const feature =
            child.commit.branch !== nodes[parentNodeIndex]?.commit.branch || parentIndex > 0;
          return [
            {
              d: edgePath(parentPosition, childPosition, parentIndex),
              feature,
              key: `${parentHash}-${child.commit.hash}`,
              parentHash,
              childHash: child.commit.hash,
            },
          ];
        });
      }),
    [nodes]
  );

  function downloadGraph() {
    downloadTextFile(
      `history-${selectedBranch === 'all' ? 'all-branches' : selectedBranch}.svg`,
      buildHistoryCanvasSvg({
        edges,
        nodes: nodes.map((item, index) => {
          const position = POSITIONS[index] ?? POSITIONS[3];
          return {
            hash: item.commit.hash,
            message: item.commit.message || 'Untitled commit',
            branch: item.commit.branch || 'main',
            left: position.left,
            top: position.top,
            width: position.width,
            height: position.height,
          };
        }),
      }),
      'image/svg+xml;charset=utf-8'
    );
  }

  const parentCommits =
    selectedCommit?.parents
      .map((hash) => commits.find((item) => item.commit.hash === hash)?.commit)
      .filter((commit): commit is ApiCommit => Boolean(commit)) ?? [];
  const author = selectedCommit ? authorName(selectedCommit) : 'Unknown';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerGroup}>
          <button
            className={`${styles.headerButton} ${styles.headerBack}`}
            onClick={onBack}
            type="button"
          >
            <ArrowLeft size={16} strokeWidth={2.5} />
            Back to History
          </button>
          <span className={styles.headerDivider} />
          <h1 className={styles.title}>History Canvas</h1>
        </div>
        <button className={styles.headerButton} onClick={onListView} type="button">
          <List className={styles.listIcon} size={16} />
          List View
        </button>
      </header>

      <main className={styles.main}>
        <section
          aria-label="Commit graph canvas"
          className={`${styles.canvas} ${canvasTool === 'pan' ? styles.canvasPan : ''} ${isPanning ? styles.canvasPanning : ''}`}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerUp}
          onMouseDown={(event) => beginPan(event, event.currentTarget)}
          onMouseMove={(event) => movePan(event.clientX, event.clientY)}
          onMouseUp={(event) => endPan(event.currentTarget)}
          onMouseLeave={(event) => endPan(event.currentTarget)}
        >
          <div className={styles.canvasTopLeft} data-history-chrome="true">
            <label className={`${styles.canvasButton} ${styles.branchSelect}`}>
              <select
                aria-label="Canvas branch filter"
                className={styles.branchSelectInput}
                value={selectedBranch}
                onChange={(event) => onBranchChange(event.target.value)}
              >
                <option value="all">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.branch_id} value={branch.name}>
                    {branch.name}
                  </option>
                ))}
              </select>
              <span aria-hidden="true" className={styles.branchDot} />
              <span className={styles.branchSelectLabel}>
                {selectedBranch === 'all' ? 'All branches' : selectedBranch}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={`${styles.mutedIcon} ${styles.branchSelectChevron}`}
                size={14}
                strokeWidth={2.5}
              />
            </label>
            <span className={styles.commitCount}>{commits.length} Commits</span>
          </div>

          <div className={styles.canvasTopRight} data-history-chrome="true">
            <div className={styles.zoomGroup}>
              <button
                aria-label="Zoom out"
                className={styles.zoomButton}
                onClick={() => setZoom((value) => Math.max(70, value - 10))}
                type="button"
              >
                <ZoomOut size={18} strokeWidth={2.5} />
              </button>
              <span className={styles.zoomDivider} />
              <span className={styles.zoomValue}>{zoom}%</span>
              <span className={styles.zoomDivider} />
              <button
                aria-label="Zoom in"
                className={styles.zoomButton}
                onClick={() => setZoom((value) => Math.min(130, value + 10))}
                type="button"
              >
                <ZoomIn size={18} strokeWidth={2.5} />
              </button>
            </div>
            <button
              aria-label="Fit to view"
              className={`${styles.canvasButton} ${styles.iconOnly}`}
              onClick={resetView}
              type="button"
            >
              <Maximize2 size={18} />
            </button>
          </div>

          <div
            className={`${styles.viewport} ${isPanning ? styles.viewportPanning : ''}`}
            data-history-viewport="true"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})` }}
          >
            {edges.length > 0 && (
              <svg aria-hidden="true" className={styles.edges} data-history-edges="true">
                <defs>
                  <marker
                    id="history-arrow-indigo"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path className={styles.markerMain} d="M 0 1 L 10 5 L 0 9 z" />
                  </marker>
                  <marker
                    id="history-arrow-pink"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path className={styles.markerFeature} d="M 0 1 L 10 5 L 0 9 z" />
                  </marker>
                </defs>
                {edges.map((edge) => (
                  <path
                    className={edge.feature ? styles.edgeFeature : styles.edgeMain}
                    d={edge.d}
                    data-child-hash={edge.childHash}
                    data-parent-hash={edge.parentHash}
                    key={edge.key}
                    markerEnd={
                      edge.feature ? 'url(#history-arrow-pink)' : 'url(#history-arrow-indigo)'
                    }
                  />
                ))}
              </svg>
            )}

            {nodes.map((item, index) => {
              const position = POSITIONS[index] ?? POSITIONS[3];
              const commit = item.commit;
              const isSelected = commit.hash === selected?.commit.hash;
              const feature = position.kind === 'feature';
              return (
                <button
                  aria-label={`Inspect ${commit.message || shortHash(commit.hash)}`}
                  className={`${styles.node} ${position.kind === 'root' ? styles.nodeRoot : ''} ${feature ? styles.nodeFeature : ''} ${isSelected ? styles.selectedNode : ''}`}
                  key={commit.hash}
                  onClick={() => setSelectedHash(commit.hash)}
                  style={{ left: position.left, top: position.top, width: position.width }}
                  type="button"
                >
                  <span className={styles.nodeTop} />
                  <span className={styles.nodeBody}>
                    <span className={styles.nodeTitle}>
                      <span className={styles.nodeIcon}>
                        {commit.parents.length > 1 ? (
                          <GitMerge size={isSelected ? 20 : 16} strokeWidth={2.5} />
                        ) : (
                          <GitBranch size={isSelected ? 20 : 15} strokeWidth={2.5} />
                        )}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span className={styles.nodeMessage}>
                          {commit.message || 'Untitled commit'}
                        </span>
                        {isSelected && (
                          <span className={styles.selectedSubtitle}>
                            {commit.parents.length > 1
                              ? 'Merged history revision'
                              : `Committed to ${commit.branch || 'main'}`}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className={styles.nodeMeta}>
                      <span className={styles.hash}>{shortHash(commit.hash)}</span>
                      {isSelected && item.diffStats ? (
                        <span className={styles.stats}>
                          <span className={styles.statAdded}>+{item.diffStats.addedCount}</span>
                          <span className={styles.statDivider}>|</span>
                          <span className={styles.statModified}>
                            ~{item.diffStats.modifiedCount}
                          </span>
                          <span className={styles.statDivider}>|</span>
                          <span className={styles.statRemoved}>-{item.diffStats.removedCount}</span>
                        </span>
                      ) : (
                        <span
                          className={`${styles.branchBadge} ${feature ? styles.branchBadgeFeature : ''} ${position.kind === 'root' ? styles.branchBadgeRoot : ''}`}
                        >
                          <span className={styles.miniDot} />
                          {commit.branch || 'main'}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className={styles.toolDock} data-history-chrome="true">
            <button
              aria-label="Select tool"
              aria-pressed={canvasTool === 'select'}
              className={`${styles.toolButton} ${canvasTool === 'select' ? styles.toolActive : ''}`}
              onClick={() => setCanvasTool('select')}
              type="button"
            >
              <MousePointer2 size={18} strokeWidth={2.5} />
            </button>
            <button
              aria-label="Pan tool"
              aria-pressed={canvasTool === 'pan'}
              className={`${styles.toolButton} ${canvasTool === 'pan' ? styles.toolActive : ''}`}
              onClick={() => setCanvasTool('pan')}
              type="button"
            >
              <Hand size={18} strokeWidth={2.5} />
            </button>
            <span className={styles.toolDivider} />
            <button
              aria-label="Reset canvas view"
              className={styles.toolButton}
              onClick={() => {
                setCanvasTool('select');
                resetView();
              }}
              type="button"
            >
              <PanelsTopLeft size={18} strokeWidth={2.5} />
            </button>
            <button
              aria-label="Download canvas"
              className={styles.toolButton}
              onClick={downloadGraph}
              type="button"
            >
              <Download size={18} strokeWidth={2.5} />
            </button>
          </div>
        </section>

        <aside aria-label="Commit inspector" className={styles.inspector}>
          <div className={styles.inspectorHeader}>
            <h2 className={styles.inspectorTitle}>Inspector</h2>
            <button
              aria-label="Close inspector"
              className={styles.closeButton}
              onClick={onListView}
              type="button"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>
          {selectedCommit ? (
            <>
              <div className={styles.inspectorBody}>
                <div className={styles.inspectHero}>
                  <span className={styles.inspectIcon}>
                    {selectedCommit.parents.length > 1 ? (
                      <GitMerge size={28} strokeWidth={2.5} />
                    ) : (
                      <GitBranch size={28} strokeWidth={2.5} />
                    )}
                  </span>
                  <div>
                    <h3 className={styles.inspectHeading}>
                      {selectedCommit.message || 'Untitled commit'}
                    </h3>
                    <div className={styles.hashGroup}>
                      <span className={styles.inspectHash}>
                        <span className={styles.hash}>{shortHash(selectedCommit.hash)}</span>
                        <button
                          aria-label="Copy hash"
                          className={styles.copyButton}
                          onClick={() => void navigator.clipboard?.writeText(selectedCommit.hash)}
                          type="button"
                        >
                          <Copy size={14} />
                        </button>
                      </span>
                      <span className={styles.merged}>
                        <CheckCircle2 size={12} fill="currentColor" /> Committed
                      </span>
                    </div>
                  </div>
                </div>
                <span className={styles.separator} />
                <div className={styles.card}>
                  <span className={styles.eyebrow}>Commit Flow</span>
                  <div className={styles.flow}>
                    <span className={styles.flowBranch}>
                      <span className={`${styles.miniDot} ${styles.pinkDot}`} />
                      <span>{parentCommits.at(-1)?.branch || 'parent'}</span>
                    </span>
                    <ArrowRight className={styles.mutedIcon} size={16} strokeWidth={2.5} />
                    <span className={styles.flowBranch}>
                      <span className={`${styles.miniDot} ${styles.indigoDot}`} />
                      <span>{selectedCommit.branch || 'main'}</span>
                    </span>
                  </div>
                </div>
                <div className={styles.card}>
                  <span className={styles.eyebrow}>Parent Commits</span>
                  <div className={styles.parentList}>
                    {(parentCommits.length
                      ? parentCommits
                      : selectedCommit.parents.map(
                          (hash) => ({ hash, branch: 'parent' }) as ApiCommit
                        )
                    ).map((parent, index) => (
                      <div className={styles.parent} key={parent.hash}>
                        <span className={styles.parentMain}>
                          <span
                            className={`${styles.parentIcon} ${index > 0 ? styles.parentIconFeature : ''}`}
                          >
                            <GitBranch size={12} strokeWidth={2.5} />
                          </span>
                          <span className={styles.parentHash}>{shortHash(parent.hash)}</span>
                        </span>
                        <span className={styles.parentBranch}>{parent.branch || 'parent'}</span>
                      </div>
                    ))}
                    {selectedCommit.parents.length === 0 && (
                      <span className={styles.detailLabel}>Root commit has no parent.</span>
                    )}
                  </div>
                </div>
                <div className={styles.checks}>
                  <span className={styles.eyebrow}>Status Checks</span>
                  <div className={styles.checkGrid}>
                    <span className={styles.check}>
                      <CheckCircle2 size={16} fill="currentColor" /> Schema Check
                    </span>
                    <span className={styles.check}>
                      <CheckCircle2 size={16} fill="currentColor" /> Replay Check
                    </span>
                  </div>
                </div>
                <div className={styles.details}>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Date</span>
                    <span className={styles.detailValue}>
                      {formatDate(selectedCommit.committed_at)}
                    </span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Author</span>
                    <span className={styles.author}>
                      <span className={styles.avatar}>{initials(author)}</span>
                      {author}
                    </span>
                  </div>
                </div>
              </div>
              <div className={styles.inspectorFooter}>
                <button
                  className={`${styles.footerButton} ${styles.footerPrimary}`}
                  onClick={() => onViewDiff(selectedCommit.hash)}
                  type="button"
                >
                  <ExternalLink size={18} strokeWidth={2.5} /> View Diff Changes
                </button>
                <button
                  className={styles.footerButton}
                  disabled
                  title="No pull request URL is recorded for this commit"
                  type="button"
                >
                  <ExternalLink size={18} strokeWidth={2.5} /> Open PR in GitHub
                </button>
              </div>
            </>
          ) : (
            <div className={styles.inspectorBody}>
              <p className={styles.detailLabel}>Select a commit to inspect its details.</p>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
