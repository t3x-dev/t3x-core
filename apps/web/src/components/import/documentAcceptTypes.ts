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

export const LEGACY_DOC_UNSUPPORTED_MESSAGE =
  'Legacy .doc files are not supported. Please export as DOCX or PDF and upload again.';

export const LEGACY_XLS_UNSUPPORTED_MESSAGE =
  'Legacy .xls files are not supported. Please export as XLSX or CSV and upload again.';

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
