/**
 * Shared CSS animation keyframes and utility classes used across detail pages.
 *
 * Usage: inject via `<style dangerouslySetInnerHTML={{ __html: PAGE_ANIMATION_STYLES }} />`
 * Only pages that need animations include this; it is NOT added to globals.css.
 */
export const PAGE_ANIMATION_STYLES = `
  .node-active {
    box-shadow: 0 0 0 1px var(--accent-commit), 0 0 24px rgba(37,99,235,0.12), 0 0 48px rgba(37,99,235,0.05);
  }
  .node-fade-in {
    animation: nodeFadeIn 0.4s ease-out forwards;
  }
  @keyframes nodeFadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .connection-lines-enter {
    animation: linesEnter 0.5s ease-out;
  }
  @keyframes linesEnter {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .connection-line-animated {
    animation: flowLine 1.2s linear infinite;
  }
  @keyframes flowLine {
    from { stroke-dashoffset: 20; }
    to { stroke-dashoffset: 0; }
  }
  .edge-flow-animated {
    animation: edgeFlow 2s linear infinite;
  }
  @keyframes edgeFlow {
    from { stroke-dashoffset: 18; }
    to { stroke-dashoffset: 0; }
  }
  .node-pulse-conversation {
    animation: nodePulseConv 2.5s ease-in-out infinite;
  }
  @keyframes nodePulseConv {
    0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); }
    50% { box-shadow: 0 0 0 4px rgba(99,102,241,0.08); }
  }
  .node-pulse-commit {
    animation: nodePulseCommit 2s ease-in-out infinite;
  }
  @keyframes nodePulseCommit {
    0%, 100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); }
    50% { box-shadow: 0 0 0 6px rgba(37,99,235,0.1); }
  }
  .node-pulse-leaf {
    animation: nodePulseLeaf 3s ease-in-out infinite;
  }
  @keyframes nodePulseLeaf {
    0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
    50% { box-shadow: 0 0 0 3px rgba(34,197,94,0.08); }
  }
  .glass-panel {
    background: color-mix(in srgb, var(--surface-panel) 85%, transparent);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .section-header-glow {
    text-shadow: 0 0 8px rgba(37,99,235,0.2);
  }
  .panel-content-enter {
    animation: panelSlideIn 0.3s ease-out;
  }
  @keyframes panelSlideIn {
    from { opacity: 0; transform: translateX(8px); }
    to { opacity: 1; transform: translateX(0); }
  }
  .source-expand-enter {
    animation: sourceExpand 0.3s ease-out;
  }
  @keyframes sourceExpand {
    from { opacity: 0; transform: scaleY(0.95); transform-origin: top; }
    to { opacity: 1; transform: scaleY(1); }
  }
  .hover-connection-preview:hover {
    box-shadow: 0 0 12px rgba(37,99,235,0.06);
  }
  .bottom-glass {
    background: color-mix(in srgb, var(--surface-panel) 90%, transparent);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }
  .provenance-dot {
    animation: provDot 3s ease-in-out infinite;
  }
  @keyframes provDot {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
  .sidebar-item-active {
    box-shadow: inset 2px 0 0 var(--accent-commit), 0 0 8px rgba(37,99,235,0.06);
  }
`;
