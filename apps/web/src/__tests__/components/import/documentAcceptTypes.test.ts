import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_SOURCE_ACCEPT_HINT,
  DOCUMENT_SOURCE_ACCEPTED_TYPES,
  LEGACY_DOC_UNSUPPORTED_MESSAGE,
  LEGACY_XLS_UNSUPPORTED_MESSAGE,
  unsupportedDocumentSourceMessage,
} from '@/components/import/documentAcceptTypes';

describe('document source accepted types', () => {
  it('advertises every supported source format and excludes legacy DOC', () => {
    const acceptedTypes = DOCUMENT_SOURCE_ACCEPTED_TYPES.split(',');

    expect(DOCUMENT_SOURCE_ACCEPTED_TYPES).toContain('.pdf');
    expect(DOCUMENT_SOURCE_ACCEPTED_TYPES).toContain('.docx');
    expect(DOCUMENT_SOURCE_ACCEPTED_TYPES).toContain('.md');
    expect(DOCUMENT_SOURCE_ACCEPTED_TYPES).toContain('.markdown');
    expect(DOCUMENT_SOURCE_ACCEPTED_TYPES).toContain('.txt');
    expect(DOCUMENT_SOURCE_ACCEPTED_TYPES).toContain('.xlsx');
    expect(DOCUMENT_SOURCE_ACCEPTED_TYPES).toContain('.csv');
    expect(DOCUMENT_SOURCE_ACCEPTED_TYPES).toContain('text/csv');
    expect(DOCUMENT_SOURCE_ACCEPTED_TYPES).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(acceptedTypes).not.toContain('.doc');
    expect(acceptedTypes).not.toContain('application/msword');
    expect(DOCUMENT_SOURCE_ACCEPT_HINT).toContain('XLSX');
    expect(DOCUMENT_SOURCE_ACCEPT_HINT).toContain('CSV');
    expect(DOCUMENT_SOURCE_ACCEPT_HINT).toContain('50MB');
  });

  it('rejects legacy Office formats before upload', () => {
    expect(
      unsupportedDocumentSourceMessage({ name: 'legacy.doc', type: 'application/msword' })
    ).toBe(LEGACY_DOC_UNSUPPORTED_MESSAGE);
    expect(
      unsupportedDocumentSourceMessage({
        name: 'legacy.xls',
        type: 'application/vnd.ms-excel',
      })
    ).toBe(LEGACY_XLS_UNSUPPORTED_MESSAGE);
    expect(
      unsupportedDocumentSourceMessage({
        name: 'browser-weird.csv',
        type: 'application/vnd.ms-excel',
      })
    ).toBeNull();
    expect(
      unsupportedDocumentSourceMessage({
        name: 'report.docx',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
    ).toBeNull();
  });
});
