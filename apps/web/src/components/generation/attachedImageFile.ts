import { DOCUMENT_SOURCE_ACCEPTED_TYPES } from '@/components/import/documentAcceptTypes';
import type { AttachedImage } from '@/types/generation';

const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const ACCEPTED_DOCUMENT_TYPES = new Set(DOCUMENT_SOURCE_ACCEPTED_TYPES.split(','));

function clipboardFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const fromItems = Array.from(data.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
  return fromItems.length > 0 ? fromItems : Array.from(data.files);
}

export function clipboardImageFiles(data: DataTransfer | null): File[] {
  return clipboardFiles(data).filter((file) => ACCEPTED_IMAGE_TYPES.has(file.type));
}

export function clipboardDocumentFiles(data: DataTransfer | null): File[] {
  return clipboardFiles(data).filter((file) => {
    const extension = `.${file.name.toLowerCase().split('.').pop() ?? ''}`;
    return ACCEPTED_DOCUMENT_TYPES.has(file.type) || ACCEPTED_DOCUMENT_TYPES.has(extension);
  });
}

export async function fileToAttachedImage(file: File): Promise<AttachedImage> {
  let blob: Blob = file;
  if (file.size > 4 * 1024 * 1024) blob = await resizeImage(file, 2048);
  const bytes = new Uint8Array(await readBlob(blob));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return {
    id: crypto.randomUUID(),
    preview: URL.createObjectURL(file),
    base64: btoa(binary),
    mediaType: file.type,
  };
}

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image'));
    reader.readAsArrayBuffer(blob);
  });
}

function resizeImage(file: File, maxDim: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
        file.type,
        0.85
      );
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = URL.createObjectURL(file);
  });
}
