type Surface = 'draft' | 'review' | 'invitations';
type Phase = 'click' | 'route' | 'mount' | 'request-start' | 'ready';

const interactions = new Map<Surface, { id: number; startedAt: number; phases: Set<Phase> }>();
let lastId = 0;

export function markInteraction(surface: Surface, phase: Phase) {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
  if (phase === 'click') {
    interactions.set(surface, { id: ++lastId, startedAt: performance.now(), phases: new Set() });
  }
  const interaction = interactions.get(surface);
  if (
    !interaction ||
    performance.now() - interaction.startedAt > 30_000 ||
    interaction.phases.has(phase) ||
    (phase === 'request-start' && interaction.phases.has('ready'))
  )
    return;

  interaction.phases.add(phase);
  performance.mark(`t3x:interaction:${surface}:${phase}`, {
    detail: { interaction: interaction.id },
  });
}
