import type { Edge, Node } from '@xyflow/react';
import type { CanvasNodeData } from '@/types/nodes';

const FALLBACK_WIDTH = 288;
const FALLBACK_HEIGHT = 168;
const PADDING = 48;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function branchLabel(node: Node<CanvasNodeData>): string {
  return node.data.branchType === 'branch' ? node.data.branchName?.trim() || 'branch' : 'main';
}

/** Export the current filtered free-layout State canvas without introducing lanes. */
export function buildStateCanvasSvg(nodes: Node<CanvasNodeData>[], edges: Edge[]): string {
  if (nodes.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" />';
  }

  const minX = Math.min(...nodes.map((node) => node.position.x));
  const minY = Math.min(...nodes.map((node) => node.position.y));
  const maxX = Math.max(
    ...nodes.map((node) => node.position.x + (node.measured?.width ?? node.width ?? FALLBACK_WIDTH))
  );
  const maxY = Math.max(
    ...nodes.map(
      (node) => node.position.y + (node.measured?.height ?? node.height ?? FALLBACK_HEIGHT)
    )
  );
  const width = Math.max(640, maxX - minX + PADDING * 2);
  const height = Math.max(360, maxY - minY + PADDING * 2);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const offsetX = PADDING - minX;
  const offsetY = PADDING - minY;

  const edgeMarkup = edges
    .map((edge) => {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) return '';
      const sourceWidth = source.measured?.width ?? source.width ?? FALLBACK_WIDTH;
      const sourceHeight = source.measured?.height ?? source.height ?? FALLBACK_HEIGHT;
      const targetHeight = target.measured?.height ?? target.height ?? FALLBACK_HEIGHT;
      const x1 = source.position.x + sourceWidth + offsetX;
      const y1 = source.position.y + sourceHeight / 2 + offsetY;
      const x2 = target.position.x + offsetX;
      const y2 = target.position.y + targetHeight / 2 + offsetY;
      const bend = Math.max(36, Math.abs(x2 - x1) / 2);
      const merge = edge.data?.edgeType === 'merge';
      const stroke = merge ? '#f59e0b' : '#6366f1';
      return `<path d="M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="2.5"${merge ? ' stroke-dasharray="8 5"' : ''} marker-end="url(#arrow-${merge ? 'branch' : 'commit'})" />`;
    })
    .join('');

  const nodeMarkup = nodes
    .map((node) => {
      const x = node.position.x + offsetX;
      const y = node.position.y + offsetY;
      const nodeWidth = node.measured?.width ?? node.width ?? FALLBACK_WIDTH;
      const nodeHeight = node.measured?.height ?? node.height ?? FALLBACK_HEIGHT;
      const pending = node.data.commitStatus !== 'committed';
      const title = escapeXml(node.data.title || 'Untitled commit');
      const hash = escapeXml((node.data.commitHash ?? node.data.entryId ?? '').slice(0, 12));
      const branch = escapeXml(branchLabel(node));
      return `<g transform="translate(${x} ${y})">
        <rect width="${nodeWidth}" height="${nodeHeight}" rx="18" fill="#ffffff" stroke="${pending ? '#f59e0b' : '#6366f1'}" stroke-width="2"${pending ? ' stroke-dasharray="7 5"' : ''} />
        <rect x="20" y="22" width="42" height="42" rx="12" fill="#4f46e5" />
        <text x="78" y="39" fill="#111827" font-family="Inter, sans-serif" font-size="15" font-weight="700">${title}</text>
        <text x="78" y="59" fill="#6366f1" font-family="Inter, sans-serif" font-size="12">${pending ? 'Pending on' : 'Committed to'} ${branch}</text>
        <rect x="20" y="${nodeHeight - 46}" width="94" height="28" rx="7" fill="#eef2ff" />
        <text x="31" y="${nodeHeight - 27}" fill="#4338ca" font-family="ui-monospace, monospace" font-size="12" font-weight="700">${hash}</text>
        <circle cx="${nodeWidth - 72}" cy="${nodeHeight - 32}" r="4" fill="${pending ? '#f59e0b' : '#6366f1'}" />
        <text x="${nodeWidth - 60}" y="${nodeHeight - 28}" fill="#6366f1" font-family="Inter, sans-serif" font-size="10" font-weight="700">${branch.toUpperCase()}</text>
      </g>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#d9deea" /></pattern>
      <marker id="arrow-commit" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#6366f1" /></marker>
      <marker id="arrow-branch" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" /></marker>
    </defs>
    <rect width="100%" height="100%" fill="#fafbff" /><rect width="100%" height="100%" fill="url(#grid)" />
    ${edgeMarkup}${nodeMarkup}
  </svg>`;
}
