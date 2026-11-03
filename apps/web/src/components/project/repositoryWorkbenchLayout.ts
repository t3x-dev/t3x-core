import type { CSSProperties } from 'react';

// Both rails are measured against the whole work area. The primary pane takes the rest.
const rails = {
  navigation: { min: 180, percent: 15, max: 240 },
  inspector: { min: 320, percent: 30, max: 480 },
};
type Rail = keyof typeof rails;

function track(rail: Rail, unit: '%' | 'cqi') {
  const { min, percent, max } = rails[rail];
  return `clamp(${min}px, ${percent}${unit}, ${max}px)`;
}

export const repositoryWorkbenchTracks = {
  '--repo-navigation-track': track('navigation', '%'),
  // Schema nests its source rail inside another track; keep it relative to the editor.
  '--repo-nested-navigation-track': track('navigation', 'cqi'),
  '--repo-inspector-track': track('inspector', '%'),
} as CSSProperties;

export function balancedRailWidth(rail: Rail, available: number) {
  const { min, percent, max } = rails[rail];
  return Math.max(min, Math.min(max, Math.round((available * percent) / 100)));
}
