// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  MaterialReader,
  type MaterialReaderSelection,
  MaterialSourceDetails,
} from '@/components/chat/MaterialReader';
import type { MaterialDetail } from '@/types/api';

const mocks = vi.hoisted(() => ({
  material: null as MaterialDetail | null,
  loading: false,
  error: null as Error | null,
  reload: vi.fn(),
}));

vi.mock('@/hooks/materials/useMaterialDetail', () => ({
  useMaterialDetail: () => ({
    material: mocks.material,
    loading: mocks.loading,
    error: mocks.error,
    reload: mocks.reload,
  }),
}));

const material = {
  id: 'mat_source_doc',
  project_id: 'proj_1',
  source_type: 'document',
  title: 'Launch notes.pdf',
  filename: 'Launch notes.pdf',
  mime_type: 'application/pdf',
  content_hash: 'abc123456789',
  content_excerpt: 'Private beta scope.',
  content_text: 'Private beta scope.\n\nNo full-file prompt injection.',
  page_count: 12,
  segment_count: 2,
  segments: [
    {
      id: 'mat_source_doc:seg_001',
      index: 1,
      label: 'Section 1',
      text: 'Private beta scope.',
      char_start: 0,
      char_end: 19,
      token_estimate: 4,
    },
    {
      id: 'mat_source_doc:seg_002',
      index: 2,
      label: 'Section 2',
      text: 'No full-file prompt injection.',
      char_start: 21,
      char_end: 51,
      token_estimate: 5,
    },
  ],
  parse_quality: {
    status: 'ready',
    score: 0.84,
    message: 'Parsed text is available.',
  },
  token_estimate: 9,
  metadata: {
    source_filename: 'Launch notes.pdf',
  },
  created_at: '2026-05-26T00:00:00.000Z',
  created_by: null,
} satisfies MaterialDetail;

const selection = {
  projectId: 'proj_1',
  materialId: 'mat_source_doc',
  context: {
    title: 'Launch notes.pdf',
    included: true,
    pinId: 'pin_material',
  },
} satisfies MaterialReaderSelection;

describe('MaterialReader', () => {
  it('renders parsed text and removes the material from the current chat', () => {
    const onBack = vi.fn();
    const onRemove = vi.fn();
    mocks.material = material;
    mocks.loading = false;
    mocks.error = null;

    render(<MaterialReader selection={selection} onBack={onBack} onRemoveFromChat={onRemove} />);

    expect(screen.getByRole('heading', { name: 'Launch notes.pdf' })).not.toBeNull();
    expect(screen.getByText('Private beta scope.')).not.toBeNull();
    expect(screen.getByRole('tab', { name: /segments/i })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /remove from chat/i }));

    expect(onRemove).toHaveBeenCalledWith('pin_material');
  });

  it('renders source details in the workspace panel', () => {
    const onBackToChat = vi.fn();
    mocks.material = material;
    mocks.loading = false;
    mocks.error = null;

    render(<MaterialSourceDetails selection={selection} onBackToChat={onBackToChat} />);

    expect(screen.getByText('Source Details')).not.toBeNull();
    expect(screen.getByText('Parse Quality')).not.toBeNull();
    expect(screen.getByText('mat_source_doc')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /back to chat/i }));

    expect(onBackToChat).toHaveBeenCalled();
  });
});
