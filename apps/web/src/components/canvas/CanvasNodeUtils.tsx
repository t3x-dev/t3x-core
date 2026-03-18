import { useStore } from '@xyflow/react';
import {
  FilePlus,
  FileText,
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
  { type: 'tweet', label: 'Twitter', icon: Twitter },
  {
    type: 'weibo',
    label: '\u5FAE\u535A',
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
  },
  { type: 'wechat', label: '\u670B\u53CB\u5708', icon: MessageCircle },
  { type: 'article', label: '\u6587\u7AE0', icon: FileText },
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
  committed: '#3b82f6',
  staging: '#f97316',
  conversation: '#818cf8',
  leaf: '#10b981',
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
