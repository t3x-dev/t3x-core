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
}

export function buildHistoryCanvasSvg(input: {
  nodes: readonly HistoryCanvasExportNode[];
  edges: readonly HistoryCanvasExportEdge[];
}): string {
  const width = 1040;
  const height = 720;
  const edges = input.edges
    .map(
      (edge) =>
        `<path d="${escapeXml(edge.d)}" fill="none" stroke="${edge.feature ? '#ec4899' : '#6366f1'}" stroke-width="3" />`
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
