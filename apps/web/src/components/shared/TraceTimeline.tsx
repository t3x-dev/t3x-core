'use client';

import { motion } from 'framer-motion';
import { FileText, GitCommit, MessageCircle } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { reducedMotion, staggerContainer, staggerItem } from '@/lib/motion';

export interface TraceNode {
  type: 'leaf' | 'commit' | 'conversation';
  title: string;
  subtitle?: string;
  content: string;
  highlight?: { start: number; end: number };
  meta?: string;
}

interface TraceTimelineProps {
  nodes: TraceNode[];
  className?: string;
}

const nodeConfig = {
  leaf: { icon: FileText, color: '#10b981', label: 'Leaf' },
  commit: { icon: GitCommit, color: '#3b82f6', label: 'Commit' },
  conversation: { icon: MessageCircle, color: '#6366f1', label: 'Turn' },
} as const;

function HighlightedText({ text, highlight }: { text: string; highlight?: { start: number; end: number } }) {
  if (!highlight || highlight.start >= text.length) {
    return <span>{text}</span>;
  }
  const before = text.slice(0, highlight.start);
  const marked = text.slice(highlight.start, Math.min(highlight.end, text.length));
  const after = text.slice(Math.min(highlight.end, text.length));

  return (
    <span>
      {before}
      <mark className="rounded-sm bg-yellow-200 px-0.5 dark:bg-yellow-800/50">{marked}</mark>
      {after}
    </span>
  );
}

export function TraceTimeline({ nodes, className }: TraceTimelineProps) {
  const prefersReducedMotion = useReducedMotion();
  const container = prefersReducedMotion ? reducedMotion.fadeIn : staggerContainer;
  const item = prefersReducedMotion ? reducedMotion.fadeIn : staggerItem;

  return (
    <motion.div
      variants={container}
      initial="initial"
      animate="animate"
      className={className}
    >
      {nodes.map((node, i) => {
        const config = nodeConfig[node.type];
        const Icon = config.icon;
        const isLast = i === nodes.length - 1;

        return (
          <motion.div key={`${node.type}-${i}`} variants={item} className="relative flex gap-3">
            {/* Vertical line + icon */}
            <div className="flex flex-col items-center">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{
                  backgroundColor: `${config.color}15`,
                  border: `1.5px solid ${config.color}40`,
                }}
              >
                <Icon className="h-4 w-4" style={{ color: config.color }} />
              </div>
              {!isLast && (
                <div
                  className="w-px flex-1 min-h-[24px]"
                  style={{ backgroundColor: `${config.color}30` }}
                />
              )}
            </div>

            {/* Content card */}
            <div className="flex-1 pb-5">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium" style={{ color: config.color }}>
                  {config.label}
                </span>
                {node.meta && (
                  <span className="text-xs text-[var(--text-tertiary)]">{node.meta}</span>
                )}
              </div>
              <p className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">
                {node.title}
              </p>
              {node.subtitle && (
                <p className="text-xs text-[var(--text-tertiary)]">{node.subtitle}</p>
              )}
              <div className="mt-2 rounded-lg bg-[var(--hover-bg)] px-3 py-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                <HighlightedText text={node.content} highlight={node.highlight} />
              </div>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
