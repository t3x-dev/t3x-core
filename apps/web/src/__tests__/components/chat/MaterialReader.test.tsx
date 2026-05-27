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

const documentMaterial = {
  ...material,
  id: 'mat_docx_source',
  title: 'Strategy memo.docx',
  filename: 'Strategy memo.docx',
  mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  content_text:
    '# Strategy memo\n\n## Launch table\n\n| Owner | Status |\n| --- | --- |\n| Maya | Ready |',
  content_excerpt: '# Strategy memo\n\n## Launch table',
  metadata: {
    source_filename: 'Strategy memo.docx',
  },
  segments: [
    {
      id: 'mat_docx_source:seg_001',
      index: 1,
      label: 'Section 1',
      text: '# Strategy memo\n\n## Launch table\n\n| Owner | Status |\n| --- | --- |\n| Maya | Ready |',
      char_start: 0,
      char_end: 88,
      token_estimate: 14,
    },
  ],
  segment_count: 1,
  token_estimate: 14,
} satisfies MaterialDetail;

const spreadsheetMaterial = {
  ...material,
  id: 'mat_workbook_source',
  title: 'Revenue model.xlsx',
  filename: 'Revenue model.xlsx',
  mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  content_text:
    'Sheet: Revenue\n\nMonth | Revenue\nJan | 12000\nFeb | 14000\n\nSheet: Costs\n\nMonth | Cost\nJan | 8000\nFeb | 9000',
  content_excerpt: 'Sheet: Revenue\n\nMonth | Revenue',
  metadata: {
    source_filename: 'Revenue model.xlsx',
    sheet_count: 2,
    sheet_names: ['Revenue', 'Costs'],
    row_count: 4,
    column_count: 2,
  },
  segments: [
    {
      id: 'mat_workbook_source:seg_001',
      index: 1,
      label: 'Section 1',
      text: 'Sheet: Revenue\n\nMonth | Revenue\nJan | 12000\nFeb | 14000',
      char_start: 0,
      char_end: 58,
      token_estimate: 10,
    },
    {
      id: 'mat_workbook_source:seg_002',
      index: 2,
      label: 'Section 2',
      text: 'Sheet: Costs\n\nMonth | Cost\nJan | 8000\nFeb | 9000',
      char_start: 60,
      char_end: 112,
      token_estimate: 10,
    },
  ],
  segment_count: 2,
  token_estimate: 20,
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

const spreadsheetSelection = {
  ...selection,
  materialId: 'mat_workbook_source',
  context: {
    title: 'Revenue model.xlsx',
    included: true,
    pinId: 'pin_workbook',
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
    expect(screen.getByRole('tab', { name: /^Pages/i })).not.toBeNull();

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
    expect(screen.getByText('Added to this chat')).not.toBeNull();
    expect(screen.getByText('Full parsed text · 9 tokens · 2 chunks')).not.toBeNull();
    expect(screen.getByText('All 2 chunks are included in prompt context.')).not.toBeNull();
    const chatSection = screen.getByText('This Chat');
    const parseSection = screen.getByText('Text Parse');
    expect(
      chatSection.compareDocumentPosition(parseSection) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByText('Text parsed')).not.toBeNull();
    expect(screen.getByText('Included Text Preview')).not.toBeNull();
    expect(screen.queryByText('Good extraction')).toBeNull();
    expect(screen.queryByText('84%')).toBeNull();
    expect(screen.getByText('Context pin')).not.toBeNull();
    expect(screen.getByText('mat_source_doc')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /back to chat/i }));

    expect(onBackToChat).toHaveBeenCalled();
  });

  it('renders document sources as a readable document preview', () => {
    mocks.material = documentMaterial;
    mocks.loading = false;
    mocks.error = null;

    render(<MaterialReader selection={selection} onBack={vi.fn()} />);

    expect(screen.getByRole('tab', { name: /document/i })).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Strategy memo' })).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Launch table' })).not.toBeNull();
    expect(screen.getByText('Maya')).not.toBeNull();
    expect(screen.getAllByText('Ready').length).toBeGreaterThan(1);
  });

  it('renders spreadsheet sources as a workbook inspector', () => {
    mocks.material = spreadsheetMaterial;
    mocks.loading = false;
    mocks.error = null;

    render(
      <MaterialReader
        selection={spreadsheetSelection}
        onBack={vi.fn()}
        onRemoveFromChat={vi.fn()}
      />
    );

    expect(screen.getByRole('tab', { name: /workbook/i })).not.toBeNull();
    expect(screen.getByRole('tab', { name: /sheets/i })).not.toBeNull();
    expect(screen.getByText('Workbook overview')).not.toBeNull();
    expect(screen.getByText('Revenue')).not.toBeNull();
    expect(screen.getByText('Costs')).not.toBeNull();
  });

  it('uses spreadsheet-aware chat context copy in source details', () => {
    mocks.material = spreadsheetMaterial;
    mocks.loading = false;
    mocks.error = null;

    render(<MaterialSourceDetails selection={spreadsheetSelection} onBackToChat={vi.fn()} />);

    expect(screen.getByText('Workbook summary included')).not.toBeNull();
    expect(screen.getByText('2 sheets · 20 tokens · 2 chunks')).not.toBeNull();
    expect(screen.getByText(/Workbook text is included in prompt context/)).not.toBeNull();
    expect(screen.getByText('File type')).not.toBeNull();
    expect(screen.getByText('Spreadsheet')).not.toBeNull();
  });
});
