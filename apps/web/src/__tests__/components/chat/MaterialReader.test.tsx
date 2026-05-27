// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
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
    '# Workbook: Revenue model.xlsx\n\n## Sheet: Revenue\nRows: 3 | Columns: 2\n\n| Month | Revenue |\n| --- | --- |\n| Jan | 12000 |\n| Feb | 14000 |\n\n## Sheet: Costs\nRows: 3 | Columns: 2\n\n| Month | Cost |\n| --- | --- |\n| Jan | 8000 |\n| Feb | 9000 |',
  content_excerpt: 'Sheet: Revenue\n\nMonth | Revenue',
  metadata: {
    source_filename: 'Revenue model.xlsx',
    sheet_count: 2,
    sheet_names: ['Revenue', 'Costs'],
    row_count: 4,
    column_count: 2,
    formula_count: 2,
    truncated_sheet_count: 1,
    content_truncated: true,
  },
  segments: [
    {
      id: 'mat_workbook_source:seg_001',
      index: 1,
      label: 'Section 1',
      text: '## Sheet: Revenue\nRows: 3 | Columns: 2\n\n| Month | Revenue |\n| --- | --- |\n| Jan | 12000 |\n| Feb | 14000 |',
      char_start: 0,
      char_end: 58,
      token_estimate: 10,
    },
    {
      id: 'mat_workbook_source:seg_002',
      index: 2,
      label: 'Section 2',
      text: '## Sheet: Costs\nRows: 3 | Columns: 2\n\n| Month | Cost |\n| --- | --- |\n| Jan | 8000 |\n| Feb | 9000 |',
      char_start: 60,
      char_end: 112,
      token_estimate: 10,
    },
  ],
  segment_count: 2,
  token_estimate: 20,
} satisfies MaterialDetail;

const markdownMaterial = {
  ...documentMaterial,
  id: 'mat_markdown_source',
  title: 'Growth plan.md',
  filename: 'Growth plan.md',
  mime_type: 'application/octet-stream',
  metadata: {
    source_filename: 'Growth plan.md',
  },
} satisfies MaterialDetail;

const repeatedHeadingMaterial = {
  ...documentMaterial,
  id: 'mat_repeated_heading_source',
  title: 'Chinese memo.md',
  filename: 'Chinese memo.md',
  mime_type: 'text/markdown',
  content_text: '# 结论\n\n第一段。\n\n## 结论\n\n第二段。',
  content_excerpt: '# 结论',
  segments: [
    {
      id: 'mat_repeated_heading_source:seg_001',
      index: 1,
      label: 'Section 1',
      text: '# 结论\n\n第一段。\n\n## 结论\n\n第二段。',
      char_start: 0,
      char_end: 28,
      token_estimate: 12,
    },
  ],
  segment_count: 1,
  token_estimate: 12,
} satisfies MaterialDetail;

const longOutlineMaterial = {
  ...documentMaterial,
  id: 'mat_long_outline_source',
  title: 'Long outline.md',
  filename: 'Long outline.md',
  mime_type: 'text/markdown',
  content_text: [
    ...Array.from({ length: 12 }, (_, index) => `## Topic ${index + 1}\n\nBody ${index + 1}.`),
    '## Topic 1\n\nLate duplicate.',
  ].join('\n\n'),
  content_excerpt: '## Topic 1',
  segments: [
    {
      id: 'mat_long_outline_source:seg_001',
      index: 1,
      label: 'Section 1',
      text: '## Topic 1\n\nBody 1.',
      char_start: 0,
      char_end: 21,
      token_estimate: 40,
    },
  ],
  segment_count: 1,
  token_estimate: 40,
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
    expect(screen.getAllByText('PDF extraction limits').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/scanned pages and image-only text require OCR/i).length
    ).toBeGreaterThan(0);

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
    expect(screen.getByText('Extraction Limits')).not.toBeNull();
    expect(screen.getByText(/Original page layout, images, charts/i)).not.toBeNull();
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

    expect(screen.getByRole('tab', { name: /document.*14 tokens/i })).not.toBeNull();
    expect(screen.getAllByText('DOCX extraction limits').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Images, charts, SmartArt, equations/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('navigation', { name: 'Document outline' })).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Strategy memo' })).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Strategy memo' })).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Launch table' })).not.toBeNull();
    expect(screen.getByText('Maya')).not.toBeNull();
    expect(screen.getAllByText('Ready').length).toBeGreaterThan(1);
  });

  it('summarizes markdown uploads without raw MIME noise or duplicate chunk pills', () => {
    mocks.material = markdownMaterial;
    mocks.loading = false;
    mocks.error = null;

    render(<MaterialReader selection={selection} onBack={vi.fn()} />);

    const summaryStats = screen.getByLabelText('Material summary stats');
    expect(within(summaryStats).getByText('Markdown')).not.toBeNull();
    expect(within(summaryStats).getByText('14 tokens')).not.toBeNull();
    expect(within(summaryStats).getByText('1 chunk')).not.toBeNull();
    expect(within(summaryStats).queryByText('application/octet-stream')).toBeNull();
    expect(within(summaryStats).queryAllByText('1 chunk')).toHaveLength(1);
  });

  it('keeps repeated and non-English document outline anchors distinct', () => {
    mocks.material = repeatedHeadingMaterial;
    mocks.loading = false;
    mocks.error = null;

    render(<MaterialReader selection={selection} onBack={vi.fn()} />);

    const outlineLinks = screen.getAllByRole('link', { name: '结论' });
    expect(outlineLinks.map((link) => link.getAttribute('href'))).toEqual(['#结论', '#结论-2']);
    expect(screen.getAllByRole('heading', { name: '结论' }).map((heading) => heading.id)).toEqual([
      '结论',
      '结论-2',
    ]);
  });

  it('caps document outline links without duplicating rendered heading ids', () => {
    mocks.material = longOutlineMaterial;
    mocks.loading = false;
    mocks.error = null;

    render(<MaterialReader selection={selection} onBack={vi.fn()} />);

    const outline = screen.getByRole('navigation', { name: 'Document outline' });
    expect(within(outline).getAllByRole('link')).toHaveLength(12);
    expect(
      screen.getAllByRole('heading', { name: 'Topic 1' }).map((heading) => heading.id)
    ).toEqual(['topic-1', 'topic-1-2']);
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
    expect(screen.getAllByText('Workbook extraction limits').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Formula logic, charts, pivots/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Workbook overview')).not.toBeNull();
    expect(screen.getByText('Formula cells')).not.toBeNull();
    expect(screen.getByText('Truncated sheets')).not.toBeNull();
    expect(screen.getByText(/Formula cells were detected/i)).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Revenue sheet preview' })).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Costs sheet preview' })).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Revenue' }).getAttribute('href')).toBe(
      '#sheet-revenue'
    );
    expect(screen.getAllByText('Revenue').length).toBeGreaterThan(1);
    expect(screen.getByText('14000')).not.toBeNull();
    expect(screen.getByText('9000')).not.toBeNull();
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
