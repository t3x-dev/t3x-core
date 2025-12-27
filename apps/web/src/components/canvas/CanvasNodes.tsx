import type { Node, NodeProps } from '@xyflow/react';
import { Handle, NodeToolbar, Position } from '@xyflow/react';
import {
  CheckCircle,
  ChevronDown,
  FileText,
  FlaskConical,
  GitCommit,
  GitMerge,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  MessageSquarePlus,
  PenSquare,
  Plus,
  Rocket,
  Sparkles,
  Twitter,
  XCircle,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import { useProjectStore } from '@/store/projectStore';
import type { CanvasNodeData, LeafType } from '@/types/nodes';

// Define custom node type for React Flow v12
type CanvasNode = Node<CanvasNodeData, 'canvas'>;

// Leaf type definitions with icons and labels
export const LEAF_TYPES: {
  type: LeafType;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  category?: 'output' | 'runner';
}[] = [
  // Runner category - deploy and eval
  { type: 'deploy', label: 'Deploy', icon: Rocket, category: 'runner' },
  { type: 'eval', label: 'Eval', icon: FlaskConical, category: 'runner' },
  // Output category - social and content
  { type: 'twitter', label: 'Twitter', icon: Twitter, category: 'output' },
  {
    type: 'weibo',
    label: '微博',
    icon: ({ size, className }) => (
      <svg
        width={size || 16}
        height={size || 16}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
      >
        <path d="M10.098 20.323c-3.977.391-7.414-1.406-7.672-4.02-.259-2.609 2.759-5.047 6.74-5.441 3.979-.394 7.413 1.404 7.671 4.018.259 2.6-2.759 5.049-6.739 5.443zM9.05 17.219c-.384.616-1.208.884-1.829.602-.612-.279-.793-.991-.406-1.593.379-.595 1.176-.861 1.793-.601.622.263.82.972.442 1.592zm1.27-1.627c-.141.237-.449.353-.689.253-.236-.09-.313-.361-.177-.586.138-.227.436-.346.672-.24.239.09.315.36.194.573zm.176-2.719c-1.893-.493-4.033.45-4.857 2.118-.836 1.704-.026 3.591 1.886 4.21 1.983.64 4.318-.341 5.132-2.179.8-1.793-.201-3.642-2.161-4.149zm7.563-1.224c-.346-.105-.579-.18-.405-.649.381-1.017.422-1.896-.002-2.521-.789-1.161-2.948-1.098-5.418-.032 0 0-.776.34-.577-.277.379-1.207.324-2.218-.267-2.799-1.344-1.32-4.91.051-7.97 3.06C1.87 10.54.5 12.8.5 14.81c0 3.85 4.943 6.19 9.779 6.19 6.332 0 10.546-3.674 10.546-6.587 0-1.762-1.484-2.762-2.766-3.164z" />
      </svg>
    ),
    category: 'output',
  },
  { type: 'wechat', label: '朋友圈', icon: MessageCircle, category: 'output' },
  { type: 'article', label: '文章', icon: FileText, category: 'output' },
  { type: 'email', label: 'Email', icon: Mail, category: 'output' },
  {
    type: 'slack',
    label: 'Slack',
    icon: ({ size, className }) => (
      <svg
        width={size || 16}
        height={size || 16}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
      >
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
      </svg>
    ),
    category: 'output',
  },
];

type Props = NodeProps<CanvasNode>;

const targetHandleStyle = {
  width: 22,
  height: 14,
  borderRadius: 8,
  background: '#fff',
  border: '3px solid #6d6f76',
  top: '50%',
  transform: 'translateY(-50%)',
  left: -6,
};

const sourceHandleStyle = {
  width: 18,
  height: 18,
  borderRadius: 999,
  background: '#fff',
  border: '3px solid #6d6f76',
  top: '50%',
  transform: 'translateY(-50%)',
  right: -9,
};

// Tone-based style configurations - Pro design with refined shadows and gradients
const toneStyles = {
  'main-latest': {
    bg: 'bg-gradient-to-br from-blue-50 to-indigo-50/50',
    border: 'border-blue-400/50',
    shadow: 'shadow-[0_4px_20px_-4px_rgba(59,130,246,0.25),0_0_0_1px_rgba(59,130,246,0.08)]',
    accent: 'text-blue-600',
    badgeBg: 'bg-gradient-to-r from-blue-600 to-indigo-600',
    zIndex: 'z-[4]',
  },
  'main-history': {
    bg: 'bg-gradient-to-br from-slate-50 to-blue-50/30',
    border: 'border-blue-300/40',
    shadow: 'shadow-[0_2px_12px_-4px_rgba(59,130,246,0.15),0_0_0_1px_rgba(59,130,246,0.05)]',
    accent: 'text-blue-500',
    badgeBg: 'bg-blue-500',
    zIndex: 'z-[2]',
  },
  'branch-latest': {
    bg: 'bg-gradient-to-br from-amber-50 to-orange-50/50',
    border: 'border-amber-400/50',
    shadow: 'shadow-[0_4px_20px_-4px_rgba(245,158,11,0.25),0_0_0_1px_rgba(245,158,11,0.08)]',
    accent: 'text-amber-600',
    badgeBg: 'bg-gradient-to-r from-amber-500 to-orange-500',
    zIndex: 'z-[4]',
  },
  'branch-history': {
    bg: 'bg-gradient-to-br from-slate-50 to-amber-50/30',
    border: 'border-amber-300/40',
    shadow: 'shadow-[0_2px_12px_-4px_rgba(245,158,11,0.15),0_0_0_1px_rgba(245,158,11,0.05)]',
    accent: 'text-amber-500',
    badgeBg: 'bg-amber-500',
    zIndex: 'z-[2]',
  },
  staging: {
    bg: 'bg-gradient-to-br from-slate-50 to-slate-100/50',
    border: 'border-slate-300/60 border-dashed',
    shadow: 'shadow-[0_2px_12px_-4px_rgba(100,116,139,0.12),0_0_0_1px_rgba(100,116,139,0.06)]',
    accent: 'text-slate-500',
    badgeBg: 'bg-transparent border border-dashed border-slate-400',
    zIndex: 'z-[3]',
  },
  default: {
    bg: 'bg-gradient-to-br from-white to-slate-50',
    border: 'border-slate-200',
    shadow: 'shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)]',
    accent: 'text-blue-600',
    badgeBg: 'bg-blue-600',
    zIndex: 'z-[2]',
  },
};

// Unit Node - Combined Conversation + Commit
function UnitNode(props: Props) {
  const { data, selected, id } = props;
  const [expanded, setExpanded] = useState(false);
  const tone = useCanvasStore((state) => state.getCommitTone(id));
  const addUnitFromUnit = useCanvasStore((state) => state.addUnitFromUnit);
  const startMergeFromCommit = useCanvasStore((state) => state.createMergePendingCommit);
  const hasMainCommit = useCanvasStore((state) => state.hasMainCommit);
  const openLeafPanel = useCanvasStore((state) => state.openLeafPanel);
  const notify = useProjectStore((state) => state.notifyCallback);

  // Check if commit is in staging state
  const isStaging = data.commitStatus === 'staging';
  const isCommitted = data.commitStatus === 'committed';

  const branchLabel = data.branchType === 'branch' ? data.branchName?.trim() || 'branch' : 'MAIN';

  // Get tone-based styles
  const toneKey = isStaging ? 'staging' : tone || 'default';
  const styles = toneStyles[toneKey as keyof typeof toneStyles] || toneStyles.default;

  const handleAddUnit = () => {
    try {
      addUnitFromUnit(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create unit';
      notify?.(message, 'error');
      console.error('Failed to create unit:', err);
    }
  };

  const canTriggerMerge = data.branchType === 'branch' && tone === 'branch-latest' && hasMainCommit;
  const handleMerge = () => {
    if (!canTriggerMerge) {
      return;
    }
    startMergeFromCommit(id);
  };

  const handleOpenLeafPanel = () => {
    openLeafPanel(id);
  };

  return (
    <>
      {/* Top NodeToolbar - Add Leaf for committed units */}
      {isCommitted && (
        <NodeToolbar position={Position.Top} offset={4} className="nodrag">
          <Button
            variant="outline"
            size="icon"
            className={cn(
              'w-7 h-7 rounded-full bg-white shadow-md border-2',
              'hover:scale-105 transition-transform',
              styles.accent,
              data.branchType === 'main'
                ? 'border-blue-400 hover:bg-blue-50'
                : 'border-orange-400 hover:bg-orange-50'
            )}
            onClick={handleOpenLeafPanel}
            aria-label="Add Leaf Node"
          >
            <Plus size={14} />
          </Button>
        </NodeToolbar>
      )}
      <Handle type="target" position={Position.Left} style={targetHandleStyle} />

      <div
        className={cn(
          'group w-72 rounded-2xl border-2 overflow-visible text-slate-900',
          'transition-all duration-200 ease-out',
          'hover:scale-[1.01] hover:shadow-lg',
          styles.bg,
          styles.border,
          styles.shadow,
          styles.zIndex,
          selected && 'ring-2 ring-primary/40 ring-offset-2 ring-offset-background',
          data.highlightMode === 'main' && 'ring-2 ring-blue-500/50 ring-offset-2',
          data.highlightMode === 'branch' && 'ring-2 ring-amber-500/50 ring-offset-2',
          expanded && 'cursor-text'
        )}
      >
        {/* Conversation Section (Top) */}
        <div className="px-4 pt-4 pb-3 bg-white/70 backdrop-blur-sm rounded-t-[14px]">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="flex items-center justify-center w-5 h-5 rounded-md bg-slate-100">
              <MessageSquare size={12} className="text-slate-500" />
            </div>
            <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">
              Conversation
            </span>
          </div>
          <h4 className="m-0 text-[0.95rem] font-semibold text-slate-800 leading-snug tracking-tight">
            {data.title}
          </h4>
          <div className="flex items-center gap-2 mt-2 text-[0.7rem] text-slate-400">
            <span className="px-1.5 py-0.5 bg-slate-100 rounded">{data.timestamp}</span>
            <span>{data.status}</span>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-slate-200/80 to-transparent" />

        {/* Commit Section (Bottom) */}
        <div className="px-4 pt-3 pb-4">
          <div className="flex justify-between items-center mb-2.5">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex items-center justify-center w-5 h-5 rounded-md',
                  isStaging ? 'bg-slate-100' : 'bg-blue-100'
                )}
              >
                {isStaging ? (
                  <PenSquare size={12} className="text-slate-500" />
                ) : (
                  <GitCommit size={12} className="text-blue-600" />
                )}
              </div>
              <span
                className={cn(
                  'inline-flex items-center px-2.5 py-1 rounded-full text-[0.65rem] font-bold uppercase tracking-wide',
                  isStaging
                    ? 'bg-slate-100 border border-dashed border-slate-300 text-slate-500'
                    : cn(styles.badgeBg, 'text-white shadow-sm')
                )}
              >
                {data.commitHash ? data.commitHash.slice(0, 8) : data.entryId}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {isStaging && (
                <span className="text-[0.6rem] text-slate-400 uppercase tracking-wider font-medium px-2 py-0.5 bg-slate-100 rounded-full">
                  staging
                </span>
              )}
              {data.isMergeCommit && (
                <span className="text-[0.6rem] text-purple-500 uppercase tracking-wider font-medium px-2 py-0.5 bg-purple-50 rounded-full">
                  merge
                </span>
              )}
              <span
                className={cn(
                  'text-[0.65rem] font-semibold px-2 py-0.5 rounded-md border',
                  styles.accent,
                  data.branchType === 'main'
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-amber-50 border-amber-200'
                )}
              >
                {branchLabel}
              </span>
              <button
                className="w-6 h-6 rounded-lg border border-slate-200 bg-white inline-flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-600 hover:border-slate-300 transition-colors"
                onClick={() => setExpanded((prev) => !prev)}
                aria-label="Toggle details"
                aria-expanded={expanded}
                type="button"
              >
                <ChevronDown
                  size={14}
                  className={cn('transition-transform duration-200', expanded && 'rotate-180')}
                />
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center text-xs">
            <div className="inline-flex items-center gap-1.5 font-medium text-slate-600">
              <Sparkles size={12} className="text-amber-500" />
              <span>{isStaging ? 'Staging' : 'Committed'}</span>
            </div>
            {isStaging ? (
              <span className="text-[0.7rem] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                {(data.mustHave?.length || 0) + (data.mustntHave?.length || 0) > 0
                  ? `${data.mustHave?.length || 0}✓ ${data.mustntHave?.length || 0}✗`
                  : 'No constraints'}
              </span>
            ) : (
              <span className="text-slate-400 text-[0.7rem] truncate max-w-[120px]">
                {data.summary || data.timestamp}
              </span>
            )}
          </div>
        </div>

        {/* Expanded Dropdown */}
        {expanded && (
          <div className="mt-2 pt-2 border-t border-black/5 px-4 pb-3 nodrag">
            <p className="text-[0.82rem] text-slate-600 leading-relaxed max-h-20 overflow-y-auto m-0">
              {data.summary || (isStaging ? 'Staging - click to edit' : 'No summary recorded.')}
            </p>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} style={sourceHandleStyle} />

      {/* NodeToolbar - appears on hover/selection */}
      <NodeToolbar position={Position.Right} offset={8} className="flex gap-1.5 nodrag">
        <Button
          variant="outline"
          size="icon"
          className="w-7 h-7 rounded-full bg-white shadow-md border-slate-200 hover:border-blue-400 hover:bg-blue-50"
          onClick={handleAddUnit}
          aria-label="Add Unit"
        >
          <MessageSquarePlus size={14} />
        </Button>
        {data.branchType === 'branch' && (
          <Button
            variant="outline"
            size="icon"
            className="w-7 h-7 rounded-full bg-white shadow-md border-slate-200 hover:border-orange-400 hover:bg-orange-50"
            onClick={handleMerge}
            aria-label="Start Merge"
            disabled={!canTriggerMerge}
          >
            <GitMerge size={14} />
          </Button>
        )}
      </NodeToolbar>
    </>
  );
}

// Status indicator for deploy/eval leaves
function LeafStatusIndicator({ leafType, data }: { leafType: LeafType; data: CanvasNodeData }) {
  const baseClasses =
    'inline-flex items-center gap-1 text-[0.65rem] font-medium px-1.5 py-0.5 rounded';

  if (leafType === 'deploy') {
    const status = (data.leafConfig as { status?: string })?.status || 'idle';
    switch (status) {
      case 'running':
        return (
          <span className={cn(baseClasses, 'bg-blue-100 text-blue-700')}>
            <Loader2 size={12} className="animate-spin" /> Running
          </span>
        );
      case 'stopped':
        return <span className={cn(baseClasses, 'bg-slate-100 text-slate-600')}>Stopped</span>;
      case 'error':
        return (
          <span className={cn(baseClasses, 'bg-red-100 text-red-700')}>
            <XCircle size={12} /> Error
          </span>
        );
      default:
        return <span className={cn(baseClasses, 'bg-green-100 text-green-700')}>Ready</span>;
    }
  }

  if (leafType === 'eval') {
    const status = (data.leafConfig as { status?: string })?.status || 'pending';
    const config = data.leafConfig as { passedCount?: number; failedCount?: number } | undefined;
    switch (status) {
      case 'running':
        return (
          <span className={cn(baseClasses, 'bg-blue-100 text-blue-700')}>
            <Loader2 size={12} className="animate-spin" /> Running
          </span>
        );
      case 'passed':
        return (
          <span className={cn(baseClasses, 'bg-green-100 text-green-700')}>
            <CheckCircle size={12} /> {config?.passedCount || 0} passed
          </span>
        );
      case 'failed':
        return (
          <span className={cn(baseClasses, 'bg-red-100 text-red-700')}>
            <XCircle size={12} /> {config?.failedCount || 0} failed
          </span>
        );
      default:
        return <span className={cn(baseClasses, 'bg-amber-100 text-amber-700')}>Pending</span>;
    }
  }

  return null;
}

// Leaf Node - Output destination node
function LeafNode(props: Props) {
  const { data, selected } = props;
  const leafTypeInfo = LEAF_TYPES.find((l) => l.type === data.leafType) || LEAF_TYPES[0];
  const Icon = leafTypeInfo.icon;
  const isRunnerLeaf = data.leafType === 'deploy' || data.leafType === 'eval';

  return (
    <>
      <Handle type="target" position={Position.Left} style={targetHandleStyle} />
      <div
        className={cn(
          'w-40 bg-white border border-slate-200 rounded-xl',
          'shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.02)]',
          'transition-all duration-200 ease-out',
          'hover:scale-[1.02] hover:shadow-[0_4px_16px_-4px_rgba(99,102,241,0.2),0_0_0_1px_rgba(99,102,241,0.1)]',
          'hover:border-indigo-300',
          selected && 'border-indigo-400 ring-2 ring-indigo-500/20 ring-offset-2'
        )}
      >
        <div className="flex items-center gap-2.5 px-3 py-3">
          <div
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm',
              isRunnerLeaf
                ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                : 'bg-gradient-to-br from-indigo-500 to-violet-600'
            )}
          >
            <Icon size={16} />
          </div>
          <div className="flex flex-col items-start gap-0.5 min-w-0 flex-1">
            <span
              className={cn(
                'text-[0.6rem] font-semibold uppercase tracking-wider',
                isRunnerLeaf ? 'text-emerald-600' : 'text-indigo-600'
              )}
            >
              {leafTypeInfo.label}
            </span>
            <span className="text-xs font-medium text-slate-700 truncate max-w-full">
              {data.title || 'Untitled'}
            </span>
            {isRunnerLeaf && <LeafStatusIndicator leafType={data.leafType!} data={data} />}
          </div>
        </div>
      </div>
    </>
  );
}

export const canvasNodeTypes = {
  unit: UnitNode,
  leaf: LeafNode,
};
