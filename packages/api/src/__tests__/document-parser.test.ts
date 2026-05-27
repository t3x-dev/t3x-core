import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '../lib/import/document-parser';

describe('document parser', () => {
  it('parses Markdown files as source text', async () => {
    const result = await parseDocument(
      Buffer.from('# Plan\n\n- Ship source previews', 'utf-8'),
      'plan.md',
      'application/octet-stream'
    );

    expect(result.raw_text).toContain('# Plan');
    expect(result.paragraphs.map((paragraph) => paragraph.text)).toContain(
      '- Ship source previews'
    );
    expect(result.metadata.source_filename).toBe('plan.md');
  });

  it('parses TXT files as plain text', async () => {
    const result = await parseDocument(
      Buffer.from('Plain source note.\n\nSecond paragraph.', 'utf-8'),
      'notes.txt',
      'text/plain'
    );

    expect(result.raw_text).toContain('Plain source note.');
    expect(result.paragraphs.map((paragraph) => paragraph.text)).toContain('Second paragraph.');
  });

  it('parses XLSX workbooks into readable sheet text and metadata', async () => {
    const result = await parseDocument(
      createWorkbookFixture(),
      'revenue-model.xlsx',
      'application/octet-stream'
    );

    expect(result.metadata.sheet_count).toBe(2);
    expect(result.metadata.sheet_names).toEqual(['Revenue', 'Costs']);
    expect(result.metadata.row_count).toBe(4);
    expect(result.metadata.column_count).toBe(2);
    expect(result.raw_text).toContain('# Workbook: revenue-model.xlsx');
    expect(result.raw_text).toContain('## Sheet: Revenue');
    expect(result.raw_text).toContain('| Month | Revenue |');
    expect(result.raw_text).toContain('| Jan | 12000 |');
    expect(result.raw_text).toContain('## Sheet: Costs');
    expect(result.raw_text).toContain('| Jan | 8000 |');
  });

  it('parses CSV files as single-sheet workbooks', async () => {
    const result = await parseDocument(
      Buffer.from('Month,Revenue\nJan,12000\nFeb,14000', 'utf-8'),
      'revenue.csv',
      'text/csv'
    );

    expect(result.metadata.sheet_count).toBe(1);
    expect(result.metadata.sheet_names).toEqual(['revenue.csv']);
    expect(result.metadata.row_count).toBe(3);
    expect(result.metadata.column_count).toBe(2);
    expect(result.raw_text).toContain('# Workbook: revenue.csv');
    expect(result.raw_text).toContain('| Month | Revenue |');
    expect(result.raw_text).toContain('| Feb | 14000 |');
  });

  it('guesses CSV from filename when browsers send octet-stream', async () => {
    const result = await parseDocument(
      Buffer.from('Month,Revenue\nJan,12000', 'utf-8'),
      'revenue.csv',
      'application/octet-stream'
    );

    expect(result.metadata.sheet_count).toBe(1);
    expect(result.raw_text).toContain('# Workbook: revenue.csv');
  });

  it('rejects legacy DOC files with a clear error', async () => {
    await expect(
      parseDocument(Buffer.from('not a docx', 'utf-8'), 'legacy.doc', 'application/msword')
    ).rejects.toThrow('Legacy .doc files are not supported yet');
  });
});

function createWorkbookFixture() {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': xml(`<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
      </Types>`),
    'xl/workbook.xml': xml(`<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets>
          <sheet name="Revenue" sheetId="1" r:id="rId1"/>
          <sheet name="Costs" sheetId="2" r:id="rId2"/>
        </sheets>
      </workbook>`),
    'xl/_rels/workbook.xml.rels': xml(`<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Target="worksheets/sheet1.xml"/>
        <Relationship Id="rId2" Target="worksheets/sheet2.xml"/>
      </Relationships>`),
    'xl/sharedStrings.xml': xml(`<?xml version="1.0" encoding="UTF-8"?>
      <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <si><t>Month</t></si>
        <si><t>Revenue</t></si>
        <si><t>Jan</t></si>
        <si><t>12000</t></si>
        <si><t>Costs</t></si>
        <si><t>8000</t></si>
      </sst>`),
    'xl/worksheets/sheet1.xml': xml(`<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <sheetData>
          <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
          <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>
        </sheetData>
      </worksheet>`),
    'xl/worksheets/sheet2.xml': xml(`<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <sheetData>
          <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>4</v></c></row>
          <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>5</v></c></row>
        </sheetData>
      </worksheet>`),
  };

  return Buffer.from(zipSync(files));
}

function xml(source: string) {
  return strToU8(source.trim());
}
