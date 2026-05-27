/**
 * Document Parser
 *
 * Parses PDF, DOCX, Markdown, TXT, HTML, XLSX, and CSV files into paragraphs.
 * Uses pdf-parse and mammoth for binary formats.
 */

import { sha256 } from '@t3x-dev/core';
import { strFromU8, unzipSync } from 'fflate';
import { convertHtmlToMarkdown } from './html-converter';
import { splitIntoParagraphs } from './paragraph-splitter';
import type { ImportMetadata, ParseResult } from './types';

/**
 * Parse a document buffer based on its MIME type or filename.
 */
export async function parseDocument(
  buffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<ParseResult> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const guessedMime = guessMimeType(ext);
  const effectiveMime =
    !mimeType || mimeType === 'application/octet-stream' ? guessedMime : mimeType;

  let text: string;
  let metadata: Partial<ImportMetadata> = {};

  switch (effectiveMime) {
    case 'application/pdf': {
      const result = await parsePdf(buffer);
      text = result.text;
      metadata = result.metadata;
      break;
    }
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/msword': {
      const result = await parseDocx(buffer);
      text = result.text;
      break;
    }
    case 'text/markdown':
    case 'text/x-markdown': {
      text = buffer.toString('utf-8');
      break;
    }
    case 'text/html': {
      const rawHtml = buffer.toString('utf-8');
      text = convertHtmlToMarkdown(rawHtml);
      break;
    }
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
      const result = await parseXlsx(buffer, filename);
      text = result.text;
      metadata = result.metadata;
      break;
    }
    case 'text/csv':
    case 'application/csv': {
      const result = parseCsv(buffer, filename);
      text = result.text;
      metadata = result.metadata;
      break;
    }
    case 'application/vnd.ms-excel': {
      if (ext === 'csv') {
        const result = parseCsv(buffer, filename);
        text = result.text;
        metadata = result.metadata;
        break;
      }
      throw new Error(
        'Legacy .xls files are not supported yet. Export the workbook as .xlsx or CSV.'
      );
    }
    default: {
      // Treat as plain text
      text = buffer.toString('utf-8');
    }
  }

  const paragraphs = splitIntoParagraphs(text);
  const contentHash = sha256(buffer.toString('utf-8'));

  const fullMetadata: ImportMetadata = {
    source_type: 'document',
    source_filename: filename,
    content_hash: contentHash,
    content_length: text.length,
    imported_at: new Date().toISOString(),
    ...metadata,
  };

  return {
    paragraphs,
    metadata: fullMetadata,
    raw_text: text,
  };
}

/**
 * Parse PDF using pdf-parse.
 */
async function parsePdf(
  buffer: Buffer
): Promise<{ text: string; metadata: Partial<ImportMetadata> }> {
  try {
    // Dynamic import — pdf-parse is optional
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);

    const pageCount = data.numpages ?? 0;
    const charsPerPage = pageCount > 0 ? data.text.length / pageCount : 0;

    let extractionQuality: 'good' | 'partial' | 'poor';
    if (charsPerPage >= 200) {
      extractionQuality = 'good';
    } else if (charsPerPage >= 50) {
      extractionQuality = 'partial';
    } else {
      extractionQuality = 'poor';
    }

    return {
      text: data.text,
      metadata: {
        title: data.info?.Title,
        author: data.info?.Author,
        page_count: pageCount,
        extraction_quality: extractionQuality,
      },
    };
  } catch (err) {
    throw new Error(
      `Failed to parse PDF: ${err instanceof Error ? err.message : 'Unknown error'}. Make sure pdf-parse is installed.`
    );
  }
}

/**
 * Parse DOCX using mammoth.
 */
async function parseDocx(buffer: Buffer): Promise<{ text: string }> {
  try {
    // Dynamic import — mammoth is optional
    const mammoth = await import('mammoth');
    const result = await mammoth.convertToHtml({ buffer });

    const text = convertHtmlToMarkdown(result.value);
    return { text };
  } catch (err) {
    throw new Error(
      `Failed to parse DOCX: ${err instanceof Error ? err.message : 'Unknown error'}. Make sure mammoth is installed.`
    );
  }
}

async function parseXlsx(
  buffer: Buffer,
  filename: string
): Promise<{ text: string; metadata: Partial<ImportMetadata> }> {
  const zip = unzipSync(new Uint8Array(buffer));
  const workbookXml = readZipText(zip, 'xl/workbook.xml');
  const workbookRelsXml = readZipText(zip, 'xl/_rels/workbook.xml.rels');
  if (!workbookXml || !workbookRelsXml) {
    throw new Error('Invalid XLSX workbook: missing workbook metadata.');
  }

  const sharedStrings = await parseSharedStrings(readZipText(zip, 'xl/sharedStrings.xml') ?? '');
  const sheets = await parseWorkbookSheets(workbookXml, workbookRelsXml);
  const parsedSheets = [];

  for (const sheet of sheets) {
    const sheetXml = readZipText(zip, sheet.path);
    if (!sheetXml) continue;
    parsedSheets.push(await parseWorksheet(sheet.name, sheetXml, sharedStrings));
  }

  const rowCount = parsedSheets.reduce((sum, sheet) => sum + sheet.rowCount, 0);
  const columnCount = parsedSheets.reduce((max, sheet) => Math.max(max, sheet.columnCount), 0);
  const formulaCount = parsedSheets.reduce((sum, sheet) => sum + sheet.formulaCount, 0);
  const truncatedSheetCount = parsedSheets.filter((sheet) => sheet.truncated).length;

  return {
    text: renderWorkbookMarkdown(filename, parsedSheets),
    metadata: {
      title: filename,
      sheet_count: parsedSheets.length,
      sheet_names: parsedSheets.map((sheet) => sheet.name),
      row_count: rowCount,
      column_count: columnCount,
      formula_count: formulaCount,
      truncated_sheet_count: truncatedSheetCount || undefined,
      content_truncated: truncatedSheetCount > 0 ? true : undefined,
      extraction_quality: truncatedSheetCount > 0 ? 'partial' : 'good',
    },
  };
}

function parseCsv(
  buffer: Buffer,
  filename: string
): { text: string; metadata: Partial<ImportMetadata> } {
  const rows = parseCsvRows(buffer.toString('utf-8'));
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const sheet = {
    name: filename,
    rows,
    rowCount: rows.length,
    columnCount,
    formulaCount: 0,
    truncated: false,
  };

  return {
    text: renderWorkbookMarkdown(filename, [sheet]),
    metadata: {
      title: filename,
      sheet_count: 1,
      sheet_names: [filename],
      row_count: rows.length,
      column_count: columnCount,
      formula_count: 0,
      extraction_quality: 'good',
    },
  };
}

interface WorkbookSheet {
  name: string;
  path: string;
}

interface ParsedSheet {
  name: string;
  rows: string[][];
  rowCount: number;
  columnCount: number;
  formulaCount: number;
  truncated: boolean;
}

const MAX_SHEET_ROWS = 200;

async function parseSharedStrings(xml: string): Promise<string[]> {
  if (!xml.trim()) return [];
  const doc = await parseXml(xml);
  return Array.from(doc.getElementsByTagName('si')).map((item) =>
    Array.from(item.getElementsByTagName('t'))
      .map((textNode) => textNode.textContent ?? '')
      .join('')
  );
}

async function parseWorkbookSheets(workbookXml: string, relsXml: string): Promise<WorkbookSheet[]> {
  const workbookDoc = await parseXml(workbookXml);
  const relsDoc = await parseXml(relsXml);
  const relTargets = new Map<string, string>();

  for (const rel of Array.from(relsDoc.getElementsByTagName('Relationship'))) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (id && target) relTargets.set(id, resolveWorkbookTarget(target));
  }

  return Array.from(workbookDoc.getElementsByTagName('sheet')).flatMap((sheet) => {
    const name = sheet.getAttribute('name');
    const relId = sheet.getAttribute('r:id') ?? sheet.getAttribute('id');
    const target = relId ? relTargets.get(relId) : null;
    if (!name || !target) return [];
    return [{ name, path: target }];
  });
}

async function parseWorksheet(
  name: string,
  xml: string,
  sharedStrings: string[]
): Promise<ParsedSheet> {
  const doc = await parseXml(xml);
  const rowElements = Array.from(doc.getElementsByTagName('row'));
  const rows: string[][] = [];
  let columnCount = 0;
  let formulaCount = 0;

  for (const row of rowElements.slice(0, MAX_SHEET_ROWS)) {
    const cells = Array.from(row.getElementsByTagName('c'));
    const values: string[] = [];
    cells.forEach((cell, cellIndex) => {
      const columnIndex = columnIndexFromCellRef(cell.getAttribute('r')) ?? cellIndex;
      const formula = firstElementText(cell, 'f');
      if (formula) formulaCount += 1;
      values[columnIndex] = cellValue(cell, sharedStrings);
    });
    const trimmed = trimTrailingEmpty(values);
    columnCount = Math.max(columnCount, trimmed.length);
    if (trimmed.some(Boolean)) rows.push(trimmed);
  }

  return {
    name,
    rows,
    rowCount: rowElements.length,
    columnCount,
    formulaCount,
    truncated: rowElements.length > MAX_SHEET_ROWS,
  };
}

async function parseXml(xml: string): Promise<Document> {
  const { JSDOM } = await import('jsdom');
  return new JSDOM(xml, { contentType: 'text/xml' }).window.document;
}

function readZipText(zip: Record<string, Uint8Array>, path: string): string | null {
  const entry = zip[path];
  return entry ? strFromU8(entry) : null;
}

function resolveWorkbookTarget(target: string): string {
  const clean = target.replace(/^\/+/, '');
  if (clean.startsWith('xl/')) return clean;
  return `xl/${clean}`;
}

function cellValue(cell: Element, sharedStrings: string[]): string {
  const type = cell.getAttribute('t');
  if (type === 'inlineStr') return firstElementText(cell, 't');

  const rawValue = firstElementText(cell, 'v');
  if (type === 's') {
    const index = Number.parseInt(rawValue, 10);
    return Number.isFinite(index) ? (sharedStrings[index] ?? '') : '';
  }
  if (type === 'b') return rawValue === '1' ? 'true' : 'false';
  return rawValue;
}

function firstElementText(element: Element, tagName: string): string {
  return element.getElementsByTagName(tagName)[0]?.textContent?.trim() ?? '';
}

function columnIndexFromCellRef(cellRef: string | null): number | null {
  if (!cellRef) return null;
  const letters = cellRef.match(/^[A-Z]+/i)?.[0].toUpperCase();
  if (!letters) return null;

  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
}

function trimTrailingEmpty(values: string[]): string[] {
  let end = values.length;
  while (end > 0 && !values[end - 1]) end -= 1;
  return values.slice(0, end).map((value) => value ?? '');
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      row.push(value);
      value = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
      continue;
    }

    value += char;
  }

  if (value || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows.map((csvRow) => trimTrailingEmpty(csvRow.map((cell) => cell.trim()))).filter(Boolean);
}

function renderWorkbookMarkdown(filename: string, sheets: ParsedSheet[]): string {
  const sections = [`# Workbook: ${filename}`];
  for (const sheet of sheets) {
    sections.push(
      [
        `## Sheet: ${sheet.name}`,
        `Rows: ${sheet.rowCount} | Columns: ${sheet.columnCount}`,
        '',
        renderMarkdownTable(sheet.rows),
      ].join('\n')
    );
  }
  return sections.join('\n\n');
}

function renderMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return 'No non-empty cells found.';
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const normalized = rows.map((row) =>
    Array.from({ length: width }, (_, index) => escapeTableCell(row[index] ?? ''))
  );
  const header = normalized[0] ?? [];
  const body = normalized.slice(1);
  const separator = Array.from({ length: width }, () => '---');
  return [header, separator, ...body].map((row) => `| ${row.join(' | ')} |`).join('\n');
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function guessMimeType(ext: string): string {
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    csv: 'text/csv',
    md: 'text/markdown',
    markdown: 'text/markdown',
    txt: 'text/plain',
    html: 'text/html',
    htm: 'text/html',
  };
  return mimeMap[ext] ?? 'text/plain';
}
