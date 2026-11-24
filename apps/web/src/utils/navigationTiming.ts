type NavigationSurface = 'repositories' | 'state' | 'schemas' | 'workspaces';
type NavigationPhase = 'click' | 'shell' | 'ready';
const navigationWindowMs = 15_000;
let active:
  | { id: string; surface: NavigationSurface; startedAt: number; phases: Set<NavigationPhase> }
  | undefined;

function activeNavigation() {
  if (active && performance.now() - active.startedAt >= navigationWindowMs) active = undefined;
  return active;
}

export function beginNavigationTiming(surface: string) {
  active = undefined;
  if (
    typeof window === 'undefined' ||
    !globalThis.crypto?.randomUUID ||
    typeof performance.mark !== 'function' ||
    typeof performance.measure !== 'function'
  )
    return;
  if (
    surface !== 'repositories' &&
    surface !== 'state' &&
    surface !== 'schemas' &&
    surface !== 'workspaces'
  )
    return;
  active = { id: crypto.randomUUID(), surface, startedAt: performance.now(), phases: new Set() };
  markNavigationTiming(surface, 'click');
}

export function markNavigationTiming(surface: NavigationSurface, phase: NavigationPhase) {
  const timing = activeNavigation();
  if (!timing || timing.surface !== surface || timing.phases.has(phase)) return;
  timing.phases.add(phase);
  performance.mark(`t3x:navigation:${surface}:${phase}`, { detail: { interactionId: timing.id } });
  if (phase === 'ready') active = undefined;
}

export function traceNavigationRequest(url: string, method: string, baseHeaders: Headers) {
  const timing = activeNavigation();
  if (!timing || typeof window === 'undefined') return;
  const target = new URL(url, window.location.origin);
  if (target.origin !== window.location.origin) return;
  const path = target.pathname;
  const isPreview =
    method === 'POST' && /^\/api\/v1\/projects\/[^/]+\/schema-studio\/preview\/?$/.test(path);
  const isRead =
    method === 'GET' && /^\/api\/v1\/(projects|repositories|branches|commits|llm)(\/|$)/.test(path);
  if (!isRead && !isPreview) return;
  const requestId = crypto.randomUUID();
  const detail = { interactionId: timing.id, requestId };
  const headers = new Headers(baseHeaders);
  headers.set('x-t3x-interaction-id', timing.id);
  headers.set('x-request-id', requestId);
  const startTime = performance.now();
  performance.mark('t3x:navigation:request-start', { startTime, detail });
  return {
    headers,
    finish(outcome: number | 'cancelled' | 'timeout' | 'network-error') {
      performance.measure('t3x:navigation:request-response', {
        start: startTime,
        end: performance.now(),
        detail: { ...detail, outcome },
      });
    },
  };
}
