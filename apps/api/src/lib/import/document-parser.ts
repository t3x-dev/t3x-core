/**
 * Document Parser
 *
 * Parses PDF, DOCX, Markdown, TXT, and HTML files into paragraphs.
 * Uses pdf-parse and mammoth for binary formats.
 */

import { sha256 } from '@t3x/core';
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
  const effectiveMime = mimeType || guessMimeType(ext);

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
      text = buffer.toString('utf-8');
      // Simple HTML to text
      text = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, '\n')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      break;
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

    // Convert HTML to markdown-like text
    let text = result.value;
    text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
    text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
    text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
    text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');
    text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
    text = text.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
    text = text.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<[^>]+>/g, '');
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    return { text };
  } catch (err) {
    throw new Error(
      `Failed to parse DOCX: ${err instanceof Error ? err.message : 'Unknown error'}. Make sure mammoth is installed.`
    );
  }
}

function guessMimeType(ext: string): string {
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    md: 'text/markdown',
    markdown: 'text/markdown',
    txt: 'text/plain',
    html: 'text/html',
    htm: 'text/html',
  };
  return mimeMap[ext] ?? 'text/plain';
}
