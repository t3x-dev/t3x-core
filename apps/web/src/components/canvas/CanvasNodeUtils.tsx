'use client';

import { useStore } from '@xyflow/react';
import {
  AtSign,
  FilePlus,
  FileText,
  Linkedin,
  Mail,
  MessageCircle,
  MessageSquare,
  Rocket,
  Twitter,
  Users,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useRef } from 'react';
import type { LeafType, SourceType } from '@/types/nodes';

// Leaf type definitions with icons and labels
// Must match @t3x-dev/core LeafType
export const LEAF_TYPES: {
  type: LeafType;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}[] = [
  { type: 'tweet', label: 'X / Twitter', icon: Twitter },
  { type: 'linkedin', label: 'LinkedIn', icon: Linkedin },
  { type: 'reddit', label: 'Reddit', icon: MessageCircle },
  { type: 'threads', label: 'Threads', icon: AtSign },
  { type: 'article', label: 'Blog post', icon: FileText },
  { type: 'email', label: 'Email', icon: Mail },
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
        <title>Slack</title>
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
      </svg>
    ),
  },
  { type: 'deploy_agent', label: 'Deploy Agent', icon: Rocket },
];

// Map canvas tone key to accent system key
export function getToneAccentKey(toneKey: string): 'commit' | 'pending' | 'branch' {
  switch (toneKey) {
    case 'main-latest':
    case 'main-history':
    case 'default':
      return 'commit';
    case 'branch-latest':
    case 'branch-history':
      return 'branch';
    case 'staging':
      return 'pending';
    default:
      return 'commit';
  }
}

// Source type icon mapping
export const SOURCE_ICONS: Record<
  SourceType,
  ComponentType<{ size?: number; className?: string }>
> = {
  conversation: MessageSquare,
  meeting: Users,
  file: FileText,
  evidence: FilePlus,
};

// Get icon for leaf type
export function getLeafIcon(type: LeafType) {
  const leafInfo = LEAF_TYPES.find((l) => l.type === type);
  return leafInfo?.icon || FileText;
}

// Semantic zoom — 3-tier with hysteresis
// overview (dots) at very low zoom, default (cards), detail (expanded) at high zoom
export type ZoomTier = 'overview' | 'default' | 'detail';

export const OVERVIEW_ENTER = 0.35;
export const OVERVIEW_EXIT = 0.45;
const DETAIL_ENTER = 1.2;
const DETAIL_EXIT = 1.0;

export const constellationColors: Record<string, string> = {
  committed: 'var(--accent-commit)',
  staging: 'var(--accent-pending)',
  conversation: 'var(--accent-conversation)',
  leaf: 'var(--accent-leaf)',
};

export function useSemanticZoom(): ZoomTier {
  const zoom = useStore((s) => s.transform[2]);
  const tierRef = useRef<ZoomTier>('default');

  if (tierRef.current === 'overview' && zoom > OVERVIEW_EXIT) {
    tierRef.current = zoom > DETAIL_ENTER ? 'detail' : 'default';
  } else if (tierRef.current === 'default') {
    if (zoom < OVERVIEW_ENTER) tierRef.current = 'overview';
    else if (zoom > DETAIL_ENTER) tierRef.current = 'detail';
  } else if (tierRef.current === 'detail' && zoom < DETAIL_EXIT) {
    tierRef.current = zoom < OVERVIEW_ENTER ? 'overview' : 'default';
  }

  return tierRef.current;
}
