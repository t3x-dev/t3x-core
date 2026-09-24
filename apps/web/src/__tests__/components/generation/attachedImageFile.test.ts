// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  clipboardImageFiles,
  fileToAttachedImage,
} from '@/components/generation/attachedImageFile';

describe('clipboard images', () => {
  it('keeps png, jpeg, gif, and webp files from a paste', () => {
    const png = new File(['png'], 'shot.png', { type: 'image/png' });
    const text = new File(['note'], 'note.txt', { type: 'text/plain' });
    const files = clipboardImageFiles({
      items: [
        { kind: 'file', getAsFile: () => png },
        { kind: 'file', getAsFile: () => text },
      ],
      files: [],
      getData: () => '',
    } as unknown as DataTransfer);

    expect(files).toEqual([png]);
  });

  it('turns a pasted image into a base64 attachment', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:shot');
    const png = new File([Uint8Array.from([1, 2, 3])], 'shot.png', { type: 'image/png' });
    const image = await fileToAttachedImage(png);
    expect(image.mediaType).toBe('image/png');
    expect(image.preview).toBe('blob:shot');
    expect(image.base64.length).toBeGreaterThan(0);
  });
});
