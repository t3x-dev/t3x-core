// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildHistoryCanvasSvg, downloadTextFile } from '@/domain/history/historyCanvasExport';

describe('historyCanvasExport', () => {
  it('embeds commit cards and connectors in a downloadable SVG', () => {
    const svg = buildHistoryCanvasSvg({
      edges: [{ d: 'M 10 10 L 40 40', feature: false }],
      nodes: [
        {
          hash: 'sha256:abcd1234',
          message: 'Pin <schema>',
          branch: 'de-v',
          left: 60,
          top: 80,
          width: 220,
          height: 120,
        },
      ],
    });

    expect(svg).toContain('M 10 10 L 40 40');
    expect(svg).toContain('Pin &lt;schema&gt;');
    expect(svg).toContain('abcd123 · de-v');
  });

  it('starts a browser download for the exported file', () => {
    const click = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:history');
    const revokeObjectURL = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      click,
      href: '',
      download: '',
    } as unknown as HTMLAnchorElement);
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    downloadTextFile('history-de-v.svg', '<svg />', 'image/svg+xml');

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:history');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
