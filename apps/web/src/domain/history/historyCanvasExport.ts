import { shortHash } from '@/domain/format/formatters';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export interface HistoryCanvasExportNode {
  hash: string;
  message: string;
  branch: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface HistoryCanvasExportEdge {
  d: string;
  feature: boolean;
  color?: string;
}

export interface HistoryCanvasExportLane {
  branch: string;
  color: string;
  y: number;
  height: number;
}

export function buildHistoryCanvasSvg(input: {
  nodes: readonly HistoryCanvasExportNode[];
  edges: readonly HistoryCanvasExportEdge[];
  lanes?: readonly HistoryCanvasExportLane[];
  width?: number;
  height?: number;
}): string {
  const width = input.width ?? 1040;
  const height = input.height ?? 720;
  const lanes = (input.lanes ?? [])
    .map(
      (lane) =>
        `<rect x="0" y="${lane.y}" width="${width}" height="${lane.height}" fill="${lane.color}" fill-opacity="0.04" />
  <text x="24" y="${lane.y + 28}" fill="${lane.color}" font-family="Inter, sans-serif" font-size="12" font-weight="700">${escapeXml(lane.branch)}</text>`
    )
    .join('');
  const edges = input.edges
    .map(
      (edge) =>
        `<path d="${escapeXml(edge.d)}" fill="none" stroke="${edge.color ?? (edge.feature ? '#ec4899' : '#6366f1')}" stroke-width="3"${edge.feature ? ' stroke-dasharray="6 4"' : ''} />`
    )
    .join('');
  const nodes = input.nodes
    .map((node) => {
      const title = escapeXml(node.message || 'Untitled commit');
      const meta = escapeXml(`${shortHash(node.hash)} · ${node.branch || 'main'}`);
      return `<g>
  <rect x="${node.left}" y="${node.top}" width="${node.width}" height="${node.height}" rx="12" fill="#ffffff" stroke="#e2e8f0" />
  <text x="${node.left + 16}" y="${node.top + 36}" fill="#1e293b" font-family="Inter, sans-serif" font-size="14" font-weight="600">${title}</text>
  <text x="${node.left + 16}" y="${node.top + 60}" fill="#475569" font-family="JetBrains Mono, monospace" font-size="12">${meta}</text>
</g>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff" />
  ${lanes}
  ${edges}
  ${nodes}
</svg>
`;
}

export function downloadTextFile(filename: string, contents: string, mimeType: string): void {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
