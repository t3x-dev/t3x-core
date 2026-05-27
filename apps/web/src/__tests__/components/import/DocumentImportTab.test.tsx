// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentImportTab } from '@/components/import/DocumentImportTab';

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  stream: vi.fn(),
  run: vi.fn(),
}));

vi.mock('@/hooks/imports/useDocumentImport', () => ({
  useDocumentImport: () => ({
    preview: mocks.preview,
    stream: mocks.stream,
    run: mocks.run,
  }),
}));

describe('DocumentImportTab', () => {
  it('rejects legacy DOC files before previewing', () => {
    const { container } = render(<DocumentImportTab projectId="proj_1" onImported={vi.fn()} />);
    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();

    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [new File(['legacy'], 'legacy.doc', { type: 'application/msword' })],
      },
    });

    expect(mocks.preview).not.toHaveBeenCalled();
    expect(screen.getByText(/Legacy \.doc files are not supported/i)).not.toBeNull();
    expect(screen.queryByText(/Parsing document/i)).toBeNull();
  });
});
