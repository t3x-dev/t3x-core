/**
 * Minimal renderHook helper for React 19 (no @testing-library dependency).
 * Used by hook test files under __tests__/hooks/.
 */
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

export interface RenderHookResult<T> {
  result: { current: T };
  unmount: () => void;
}

/** All mounted roots – cleaned up automatically via cleanupRoots(). */
const activeRoots: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = [];

/**
 * Render a React hook inside a minimal component and return a live ref to its
 * return value. Call `unmount()` when done (or rely on `cleanupRoots()`).
 */
export function renderHook<T>(hook: () => T): RenderHookResult<T> {
  const result = { current: undefined as unknown as T };

  function TestComponent(): ReactNode {
    result.current = hook();
    return null;
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: ReturnType<typeof createRoot>;

  act(() => {
    root = createRoot(container);
    root.render(createElement(TestComponent));
  });

  activeRoots.push({ root: root!, container });

  return {
    result,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
      // Remove from tracking
      const idx = activeRoots.findIndex((r) => r.container === container);
      if (idx !== -1) activeRoots.splice(idx, 1);
    },
  };
}

/**
 * Flush pending microtasks so Promises and useEffect callbacks settle.
 */
export async function waitForHook(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/**
 * Clean up any roots that were not explicitly unmounted (e.g. after a failed
 * assertion). Call this in `afterEach`.
 */
export function cleanupRoots(): void {
  for (const { root, container } of activeRoots) {
    try {
      act(() => root.unmount());
    } catch {
      /* already unmounted */
    }
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
  activeRoots.length = 0;
}
