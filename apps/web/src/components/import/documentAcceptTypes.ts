export const DOCUMENT_SOURCE_ACCEPTED_TYPES = [
  '.pdf',
  '.docx',
  '.md',
  '.markdown',
  '.txt',
  '.html',
  '.htm',
  '.xlsx',
  '.csv',
  'text/plain',
  'text/markdown',
  'text/html',
  'text/csv',
  'application/csv',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');

export const DOCUMENT_SOURCE_ACCEPT_HINT = 'PDF, DOCX, Markdown, TXT, HTML, XLSX, CSV (max 50MB)';

export const CHAT_MATERIAL_SOURCE_MAX_SIZE_MB = 5;

export const LEGACY_DOC_UNSUPPORTED_MESSAGE =
  'Legacy .doc files are not supported. Please export as DOCX or PDF and upload again.';

export const LEGACY_XLS_UNSUPPORTED_MESSAGE =
  'Legacy .xls files are not supported. Please export as XLSX or CSV and upload again.';

export const CHAT_MATERIAL_SOURCE_TOO_LARGE_MESSAGE = `File is too large. Chat materials support files up to ${CHAT_MATERIAL_SOURCE_MAX_SIZE_MB}MB. Please upload a smaller file or split it into sections.`;

export function unsupportedDocumentSourceMessage(file: Pick<File, 'name' | 'type'>): string | null {
  const extension = file.name.toLowerCase().split('.').pop() ?? '';
  const mimeType = file.type.toLowerCase();

  if (extension === 'doc' || (mimeType === 'application/msword' && extension !== 'docx')) {
    return LEGACY_DOC_UNSUPPORTED_MESSAGE;
  }

  if (extension === 'xls' || (mimeType === 'application/vnd.ms-excel' && extension !== 'csv')) {
    return LEGACY_XLS_UNSUPPORTED_MESSAGE;
  }

  return null;
}

export function unsupportedChatMaterialSourceMessage(
  file: Pick<File, 'name' | 'type'> & Partial<Pick<File, 'size'>>
): string | null {
  if (typeof file.size === 'number' && file.size > CHAT_MATERIAL_SOURCE_MAX_SIZE_MB * 1024 * 1024) {
    return CHAT_MATERIAL_SOURCE_TOO_LARGE_MESSAGE;
  }

  return unsupportedDocumentSourceMessage(file);
}
