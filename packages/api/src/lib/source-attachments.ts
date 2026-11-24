import { type CreateMaterialInput, estimateTokens, sha256 } from '@t3x-dev/core';
import { parseDocument } from './import';

const MAX_MATERIAL_TEXT_CHARS = 20_000;
const IMAGE_TOKEN_ESTIMATE = 1600;
export function isMachineIngestedMaterial(material: Pick<CreateMaterialInput, 'created_by'>) {
  return material.created_by?.startsWith('agent:api-key:') ?? false;
}

const IMAGE_SIGNATURES: Array<{ mimeType: string; matches: (bytes: Buffer) => boolean }> = [
  {
    mimeType: 'image/png',
    matches: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { mimeType: 'image/jpeg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mimeType: 'image/gif', matches: (b) => b.subarray(0, 6).toString('latin1').startsWith('GIF8') },
  {
    mimeType: 'image/webp',
    matches: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

export async function parseSourceAttachment(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<Omit<CreateMaterialInput, 'project_id' | 'created_by'>> {
  const imageMimeType = IMAGE_SIGNATURES.find((signature) => signature.matches(buffer))?.mimeType;
  if (imageMimeType) {
    const data = buffer.toString('base64');
    return {
      source_type: 'image',
      title: filename,
      filename: filename,
      mime_type: imageMimeType,
      content_text: data,
      content_hash: sha256(data),
      metadata: { byte_length: buffer.length },
      token_estimate: IMAGE_TOKEN_ESTIMATE,
    };
  }
  if (mimeType.startsWith('image/')) {
    throw new Error('Unsupported image. Use PNG, JPEG, GIF, or WebP.');
  }

  const parsed = await parseDocument(buffer, filename, mimeType);
  const parsedTextLength = parsed.raw_text.trim().length;
  if (parsedTextLength === 0) {
    throw new Error('No readable text was extracted from this file.');
  }
  if (parsedTextLength > MAX_MATERIAL_TEXT_CHARS) {
    throw new Error(
      'Parsed text is too long for chat context. This file produced more than 20,000 characters.'
    );
  }
  return {
    source_type: 'document',
    title: parsed.metadata.title ?? filename,
    filename: filename,
    mime_type: mimeType || undefined,
    content_text: parsed.raw_text,
    content_hash: parsed.metadata.content_hash,
    metadata: parsed.metadata as unknown as Record<string, unknown>,
    token_estimate: estimateTokens(parsed.raw_text),
  };
}
