import { describe, expect, it } from 'vitest';
import {
  attachmentContentBlocks,
  attachmentsFromContentBlocks,
} from '@/domain/conversations/turnAttachments';
import { attachmentMessageParts } from '@/hooks/conversations/useChatHistory';

const attachments = [
  { materialId: 'mat_img', kind: 'image' as const, title: 'shot.png', mimeType: 'image/png' },
  { materialId: 'mat_doc', kind: 'file' as const, title: 'plan.pdf', mimeType: 'application/pdf' },
];

describe('turn attachments', () => {
  it('round-trips material attachments through turn content blocks', () => {
    const blocks = attachmentContentBlocks('proj 1', 'See attached', attachments);
    expect(blocks[0]).toEqual({ type: 'text', text: 'See attached' });
    expect(attachmentsFromContentBlocks('proj 1', blocks)).toEqual(attachments);
  });

  it('ignores blocks that do not name a material in this project', () => {
    const blocks = attachmentContentBlocks('proj_a', 'x', attachments);
    expect(attachmentsFromContentBlocks('proj_b', blocks)).toEqual([]);
    expect(
      attachmentsFromContentBlocks('proj_a', [{ type: 'image', url: 'https://example.com/a.png' }])
    ).toEqual([]);
  });

  it('rebuilds chat images and file chips from a saved turn', () => {
    expect(
      attachmentMessageParts('proj_a', attachmentContentBlocks('proj_a', 'x', attachments))
    ).toEqual({
      images: [{ id: 'mat_img', material: { projectId: 'proj_a', materialId: 'mat_img' } }],
      files: [{ id: 'mat_doc', name: 'plan.pdf', mimeType: 'application/pdf' }],
    });
  });
});
