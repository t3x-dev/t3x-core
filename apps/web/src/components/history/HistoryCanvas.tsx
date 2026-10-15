'use client';

import {
  Background,
  BackgroundVariant,
  type Edge,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  useViewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
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
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDate, shortHash } from '@/domain/format/formatters';
import { buildHistoryCanvasSvg, downloadTextFile } from '@/domain/history/historyCanvasExport';
import {
  HISTORY_LANE_LAYOUT,
  HISTORY_VIRTUALIZE_AFTER,
  type HistoryLane,
  type HistoryLaneNode,
  layoutHistoryLanes,
} from '@/domain/history/historyLaneLayout';
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

const COMPACT_ZOOM = 0.55;
/** The minimap's d3 pan handler swallows a click after any movement, so clicks are detected here. */
const MINIMAP_CLICK_SLOP = 6;

/** Converts a pointer on the minimap SVG into flow coordinates (its viewBox is flow space). */
function minimapPoint(target: EventTarget, clientX: number, clientY: number) {
  if (!(target instanceof Element)) return null;
  const svg = target.closest('.react-flow__minimap')?.querySelector('svg');
  const matrix = svg?.getScreenCTM();
  if (!svg || !matrix) return null;
  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  return { x: point.x, y: point.y };
}

type CommitNodeData = {
  lane: HistoryLaneNode;
  selected: boolean;
  diffStats?: CanvasCommit['diffStats'];
  onSelect: (hash: string) => void;
};

type LaneNodeData = { lane: HistoryLane };

type CommitFlowNode = Node<CommitNodeData, 'commit'>;
type LaneFlowNode = Node<LaneNodeData, 'lane'>;

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

function CommitCardNode({ data }: NodeProps<CommitFlowNode>) {
  const compact = useStore((state) => state.transform[2] < COMPACT_ZOOM);
  const { lane, selected, diffStats, onSelect } = data;
  const commit = lane.commit;
  const label = commit.message || 'Untitled commit';
  const laneStyle = { '--lane-color': lane.color } as CSSProperties;
  return (
    <>
      <Handle
        className={styles.flowHandle}
        isConnectable={false}
        position={Position.Left}
        type="target"
      />
      {compact && !selected ? (
        <button
          aria-label={`Inspect ${commit.message || shortHash(commit.hash)}`}
          className={styles.compactNode}
          onClick={() => onSelect(commit.hash)}
          style={laneStyle}
          title={`${label} · ${shortHash(commit.hash)}`}
          type="button"
        >
          <span className={styles.compactDot} />
          <span className={styles.compactHash}>{shortHash(commit.hash)}</span>
        </button>
      ) : (
        <button
          aria-label={`Inspect ${commit.message || shortHash(commit.hash)}`}
          className={`${styles.node} ${styles.flowNode} ${lane.root ? styles.nodeRoot : ''} ${selected ? styles.selectedNode : ''}`}
          onClick={() => onSelect(commit.hash)}
          style={laneStyle}
          type="button"
        >
          <span className={styles.nodeTop} />
          <span className={styles.nodeBody}>
            <span className={styles.nodeTitle}>
              <span className={styles.nodeIcon}>
                {commit.parents.length > 1 ? (
                  <GitMerge size={selected ? 20 : 16} strokeWidth={2.5} />
                ) : (
                  <GitBranch size={selected ? 20 : 15} strokeWidth={2.5} />
                )}
              </span>
              <span style={{ minWidth: 0 }}>
                <span className={styles.nodeMessage}>{label}</span>
                {selected && (
                  <span className={styles.selectedSubtitle}>
                    {commit.parents.length > 1
                      ? 'Merged history revision'
                      : `Committed to ${lane.branch}`}
                  </span>
                )}
              </span>
            </span>
            <span className={styles.nodeMeta}>
              <span className={styles.hash}>{shortHash(commit.hash)}</span>
              {selected && diffStats ? (
                <span className={styles.stats}>
                  <span className={styles.statAdded}>+{diffStats.addedCount}</span>
                  <span className={styles.statDivider}>|</span>
                  <span className={styles.statModified}>~{diffStats.modifiedCount}</span>
                  <span className={styles.statDivider}>|</span>
                  <span className={styles.statRemoved}>-{diffStats.removedCount}</span>
                </span>
              ) : (
                <span className={styles.branchBadge}>
                  <span className={styles.miniDot} />
                  {lane.branch}
                </span>
              )}
            </span>
          </span>
        </button>
      )}
      <Handle
        className={styles.flowHandle}
        isConnectable={false}
        position={Position.Right}
        type="source"
      />
    </>
  );
}

function LaneBandNode({ data }: NodeProps<LaneFlowNode>) {
  return (
    <div
      className={styles.laneBand}
      data-history-lane={data.lane.branch}
      style={{ '--lane-color': data.lane.color } as CSSProperties}
    >
      <span className={styles.laneLabel}>
        <span className={styles.miniDot} />
        {data.lane.branch}
      </span>
    </div>
  );
}

const NODE_TYPES = { commit: CommitCardNode, lane: LaneBandNode };

export function HistoryCanvas(props: HistoryCanvasProps) {
  return (
    <ReactFlowProvider>
      <HistoryCanvasInner key={props.selectedBranch} {...props} />
    </ReactFlowProvider>
  );
}

function HistoryCanvasInner({
  branches,
  commits,
  selectedBranch,
  onBack,
  onBranchChange,
  onListView,
  onViewDiff,
}: HistoryCanvasProps) {
  const layout = useMemo(() => layoutHistoryLanes(commits.map((item) => item.commit)), [commits]);
  const diffStatsByHash = useMemo(
    () => new Map(commits.map((item) => [item.commit.hash, item.diffStats])),
    [commits]
  );
  const latestHash = layout.nodes.at(-1)?.hash ?? '';
  const [selectedHash, setSelectedHash] = useState(latestHash);
  const [canvasTool, setCanvasTool] = useState<'select' | 'pan'>('select');
  const { fitView, setCenter, zoomIn, zoomOut } = useReactFlow();
  const { zoom } = useViewport();

  const selected =
    layout.nodes.find((node) => node.hash === selectedHash) ?? layout.nodes.at(-1) ?? null;
  const selectedCommit = selected?.commit;

  const focusNode = useCallback(
    (node: HistoryLaneNode | null | undefined, duration = 0) => {
      if (!node) return;
      void setCenter(
        node.x + HISTORY_LANE_LAYOUT.nodeWidth / 2,
        node.y + HISTORY_LANE_LAYOUT.nodeHeight / 2,
        { zoom: 1, duration }
      );
    },
    [setCenter]
  );

  const minimapPress = useRef<{ x: number; y: number } | null>(null);

  function jumpTo(point: { x: number; y: number }) {
    const { nodeWidth, nodeHeight } = HISTORY_LANE_LAYOUT;
    const target = layout.nodes.find(
      (node) =>
        point.x >= node.x &&
        point.x <= node.x + nodeWidth &&
        point.y >= node.y &&
        point.y <= node.y + nodeHeight
    );
    if (target) {
      setSelectedHash(target.hash);
      focusNode(target, 240);
      return;
    }
    void setCenter(point.x, point.y, { zoom, duration: 240 });
  }

  const latestNode = layout.nodes.at(-1);
  useEffect(() => {
    focusNode(latestNode);
  }, [focusNode, latestNode]);

  const flowNodes = useMemo<Array<CommitFlowNode | LaneFlowNode>>(
    () => [
      ...layout.lanes.map(
        (lane): LaneFlowNode => ({
          id: `lane:${lane.branch}`,
          type: 'lane',
          position: { x: 0, y: lane.y },
          data: { lane },
          width: layout.width,
          height: HISTORY_LANE_LAYOUT.laneHeight,
          draggable: false,
          selectable: false,
          focusable: false,
          zIndex: -1,
        })
      ),
      ...layout.nodes.map(
        (node): CommitFlowNode => ({
          id: node.hash,
          type: 'commit',
          position: { x: node.x, y: node.y },
          data: {
            lane: node,
            selected: node.hash === selected?.hash,
            diffStats: diffStatsByHash.get(node.hash),
            onSelect: setSelectedHash,
          },
          width: HISTORY_LANE_LAYOUT.nodeWidth,
          height: HISTORY_LANE_LAYOUT.nodeHeight,
          draggable: false,
          selectable: false,
          zIndex: node.hash === selected?.hash ? 2 : 1,
        })
      ),
    ],
    [diffStatsByHash, layout, selected?.hash]
  );

  const flowEdges = useMemo<Edge[]>(
    () =>
      layout.edges.map((edge) => ({
        id: edge.key,
        source: edge.parentHash,
        target: edge.childHash,
        type: edge.crossLane ? 'default' : 'straight',
        focusable: false,
        selectable: false,
        markerEnd: { type: MarkerType.ArrowClosed, color: edge.color, width: 16, height: 16 },
        style: {
          stroke: edge.color,
          strokeWidth: 3,
          strokeOpacity: 0.8,
          ...(edge.crossLane ? { strokeDasharray: '6 4' } : {}),
        },
        data: { parentHash: edge.parentHash, childHash: edge.childHash },
      })),
    [layout.edges]
  );

  function resetView() {
    setCanvasTool('select');
    focusNode(selected, 200);
  }

  function downloadGraph() {
    downloadTextFile(
      `history-${selectedBranch === 'all' ? 'all-branches' : selectedBranch}.svg`,
      buildHistoryCanvasSvg({
        width: layout.width,
        height: layout.height,
        lanes: layout.lanes.map((lane) => ({
          branch: lane.branch,
          color: lane.color,
          y: lane.y,
          height: HISTORY_LANE_LAYOUT.laneHeight,
        })),
        edges: layout.edges.map((edge) => ({
          d: edge.d,
          feature: edge.crossLane,
          color: edge.color,
        })),
        nodes: layout.nodes.map((node) => ({
          hash: node.hash,
          message: node.commit.message || 'Untitled commit',
          branch: node.branch,
          left: node.x,
          top: node.y,
          width: HISTORY_LANE_LAYOUT.nodeWidth,
          height: HISTORY_LANE_LAYOUT.nodeHeight,
        })),
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
          className={`${styles.canvas} ${canvasTool === 'pan' ? styles.canvasPan : ''}`}
          onPointerDownCapture={(event) => {
            minimapPress.current = minimapPoint(event.target, event.clientX, event.clientY)
              ? { x: event.clientX, y: event.clientY }
              : null;
          }}
          onPointerUpCapture={(event) => {
            const press = minimapPress.current;
            minimapPress.current = null;
            if (
              !press ||
              Math.hypot(event.clientX - press.x, event.clientY - press.y) > MINIMAP_CLICK_SLOP
            ) {
              return;
            }
            const point = minimapPoint(event.target, event.clientX, event.clientY);
            if (point) jumpTo(point);
          }}
        >
          <ReactFlow
            className={styles.flowCanvas}
            data-history-viewport="true"
            edges={flowEdges}
            edgesFocusable={false}
            elementsSelectable={false}
            maxZoom={1.5}
            minZoom={0.15}
            nodeTypes={NODE_TYPES}
            nodes={flowNodes}
            nodesConnectable={false}
            nodesDraggable={false}
            onNodeClick={(_, node) => {
              if (node.type === 'commit' && canvasTool === 'select') setSelectedHash(node.id);
            }}
            onlyRenderVisibleElements={layout.nodes.length > HISTORY_VIRTUALIZE_AFTER}
            panOnDrag={canvasTool === 'pan' ? true : [1]}
            panOnScroll
            proOptions={{ hideAttribution: true }}
            zoomOnDoubleClick={false}
          >
            <Background
              color="var(--stroke-default)"
              gap={24}
              size={1.5}
              variant={BackgroundVariant.Dots}
            />
            <MiniMap
              ariaLabel="History minimap"
              className={styles.minimap}
              maskColor="color-mix(in srgb, var(--surface-panel) 70%, transparent)"
              nodeBorderRadius={4}
              nodeColor={(node) =>
                node.type === 'lane'
                  ? `${(node.data as LaneNodeData).lane.color}14`
                  : node.id === selected?.hash
                    ? 'var(--accent-commit)'
                    : (node.data as CommitNodeData).lane.color
              }
              pannable
              position="bottom-right"
              zoomable
            />
          </ReactFlow>

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
                onClick={() => void zoomOut({ duration: 180 })}
                type="button"
              >
                <ZoomOut size={18} strokeWidth={2.5} />
              </button>
              <span className={styles.zoomDivider} />
              <span className={styles.zoomValue}>{Math.round(zoom * 100)}%</span>
              <span className={styles.zoomDivider} />
              <button
                aria-label="Zoom in"
                className={styles.zoomButton}
                onClick={() => void zoomIn({ duration: 180 })}
                type="button"
              >
                <ZoomIn size={18} strokeWidth={2.5} />
              </button>
            </div>
            <button
              aria-label="Fit to view"
              className={`${styles.canvasButton} ${styles.iconOnly}`}
              onClick={() => void fitView({ padding: 0.12, duration: 240 })}
              type="button"
            >
              <Maximize2 size={18} />
            </button>
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
              onClick={resetView}
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
