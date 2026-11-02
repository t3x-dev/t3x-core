import type { CanvasNodeData } from '@/types/nodes';

export interface BranchVisual {
  accent: string;
  border: string;
  divider: string;
  glow: string;
  key: string;
  soft: string;
  strong: string;
  surface: string;
  text: string;
}

const MAIN_VISUAL: BranchVisual = {
  accent: '#6366f1',
  border: '#6366f1',
  divider: 'rgba(199, 210, 254, 0.78)',
  glow: 'rgba(99, 102, 241, 0.34)',
  key: 'main',
  soft: 'rgba(255, 255, 255, 0.58)',
  strong: '#4f46e5',
  surface: 'rgba(238, 242, 255, 0.9)',
  text: '#4338ca',
};

const DEV_VISUAL: BranchVisual = {
  accent: '#ec4899',
  border: '#ec4899',
  divider: 'rgba(249, 168, 212, 0.78)',
  glow: 'rgba(236, 72, 153, 0.32)',
  key: 'dev',
  soft: 'rgba(255, 255, 255, 0.6)',
  strong: '#db2777',
  surface: 'rgba(253, 242, 248, 0.92)',
  text: '#be185d',
};

function normalizeBranchName(branchName?: string): string {
  const normalized = branchName
    ?.trim()
    .toLowerCase()
    .replace(/^branch\s+/, '');
  return normalized || 'main';
}

function hashBranchName(branchName: string): number {
  let hash = 2166136261;
  for (let index = 0; index < branchName.length; index += 1) {
    hash ^= branchName.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Return a stable, name-derived color family so a branch keeps its color across reloads. */
export function getBranchVisual(branchName?: string): BranchVisual {
  const key = normalizeBranchName(branchName);
  if (key === 'main' || key === 'master') return MAIN_VISUAL;
  if (key === 'dev' || key === 'develop' || key === 'development') return DEV_VISUAL;

  const hue = hashBranchName(key) % 360;
  return {
    accent: `hsl(${hue} 78% 54%)`,
    border: `hsl(${hue} 78% 54%)`,
    divider: `hsl(${hue} 78% 82% / 0.78)`,
    glow: `hsl(${hue} 78% 54% / 0.32)`,
    key,
    soft: `hsl(${hue} 90% 100% / 0.6)`,
    strong: `hsl(${hue} 72% 44%)`,
    surface: `hsl(${hue} 90% 97% / 0.92)`,
    text: `hsl(${hue} 68% 38%)`,
  };
}

export function getCanvasNodeBranch(data: CanvasNodeData): string {
  if (data.commitStatus === 'staging') {
    return data.pendingBranch === 'branch'
      ? data.pendingBranchName?.trim() || data.branchName?.trim() || 'branch'
      : 'main';
  }
  return (
    data.commit?.branch?.trim() ||
    (data.branchType === 'branch' ? data.branchName?.trim() || 'branch' : 'main')
  );
}

export function getBranchCssVariables(branchName?: string): Record<string, string> {
  const visual = getBranchVisual(branchName);
  return {
    '--branch-accent': visual.accent,
    '--branch-border': visual.border,
    '--branch-divider': visual.divider,
    '--branch-glow': visual.glow,
    '--branch-soft': visual.soft,
    '--branch-strong': visual.strong,
    '--branch-surface': visual.surface,
    '--branch-text': visual.text,
  };
}
