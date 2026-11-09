// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { downloadTextFile } from '@/utils/downloadTextFile';

describe('downloadTextFile', () => {
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
