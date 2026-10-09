/**
 * Chat attachments are project materials referenced from a user turn's
 * `content_blocks`. The Workspace Assistant reads the same blocks: files
 * become Sources, images become image blocks on that turn.
 */

export interface TurnAttachment {
  materialId: string;
  kind: 'image' | 'file';
  title: string;
  mimeType: string;
}

function materialUri(projectId: string, materialId: string): string {
  return `t3x://projects/${encodeURIComponent(projectId)}/materials/${encodeURIComponent(materialId)}`;
}

export function attachmentContentBlocks(
  projectId: string,
  text: string,
  attachments: readonly TurnAttachment[]
): unknown[] {
  return [
    { type: 'text', text },
    ...attachments.map((attachment) =>
      attachment.kind === 'image'
        ? {
            type: 'image',
            url: materialUri(projectId, attachment.materialId),
            alt: attachment.title,
            mime_type: attachment.mimeType,
          }
        : {
            type: 'file',
            url: materialUri(projectId, attachment.materialId),
            filename: attachment.title,
            mime_type: attachment.mimeType,
          }
    ),
  ];
}

export function attachmentsFromContentBlocks(
  projectId: string,
  blocks: unknown[] | null | undefined
): TurnAttachment[] {
  const prefix = `t3x://projects/${encodeURIComponent(projectId)}/materials/`;
  const attachments: TurnAttachment[] = [];
  for (const block of blocks ?? []) {
    const value = (block ?? {}) as Record<string, unknown>;
    if ((value.type !== 'image' && value.type !== 'file') || typeof value.url !== 'string')
      continue;
    if (!value.url.startsWith(prefix)) continue;
    const materialId = decodeURIComponent(value.url.slice(prefix.length));
    const title =
      typeof value.filename === 'string'
        ? value.filename
        : typeof value.alt === 'string'
          ? value.alt
          : materialId;
    attachments.push({
      materialId,
      kind: value.type,
      title,
      mimeType: typeof value.mime_type === 'string' ? value.mime_type : '',
    });
  }
  return attachments;
}

export function attachedImageFile(image: { base64: string; mediaType: string; id: string }): File {
  const binary = atob(image.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  const extension = image.mediaType.split('/')[1] ?? 'png';
  return new File([bytes], `pasted-image-${image.id.slice(0, 8)}.${extension}`, {
    type: image.mediaType,
  });
}
