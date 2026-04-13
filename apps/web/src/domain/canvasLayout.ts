/**
 * L2 domain — pure layout math for canvas node positions.
 * No React, no store, no I/O.
 *
 * Per docs/frontend-architecture-v2-zh.md §2.3, geometry calculations
 * belong in domain/ so hooks/components can compose them deterministically
 * and tests can verify them without instantiating a store.
 */

interface PositionedNode {
  position: { x: number; y: number };
}

const GRID = 16;
const snap = (n: number) => Math.round(n / GRID) * GRID;

export const snapPosition = (p: { x: number; y: number }) => ({
  x: snap(p.x),
  y: snap(p.y),
});

/**
 * Position for a new merge commit node: midway between source and target
 * on the x-axis, 200px below the lower of the two. Falls back sensibly
 * when only one of the two is known, or defaults to (400, 400).
 */
export const computeMergeNodePosition = (
  source: PositionedNode | undefined,
  target: PositionedNode | undefined
): { x: number; y: number } => {
  if (source && target) {
    return snapPosition({
      x: (source.position.x + target.position.x) / 2,
      y: Math.max(source.position.y, target.position.y) + 200,
    });
  }
  if (source) {
    return snapPosition({ x: source.position.x, y: source.position.y + 200 });
  }
  if (target) {
    return snapPosition({ x: target.position.x, y: target.position.y + 200 });
  }
  return { x: 400, y: 400 };
};
