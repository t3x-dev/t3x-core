/**
 * Paragraph Splitter
 *
 * Splits markdown text into semantic paragraphs, recognizing:
 * - Headings (h1-h6)
 * - Code blocks (fenced)
 * - Lists (ordered/unordered)
 * - Blockquotes
 * - Tables
 * - Regular paragraphs
 */

import type { ParsedParagraph } from './types';

export function splitIntoParagraphs(markdown: string): ParsedParagraph[] {
  const paragraphs: ParsedParagraph[] = [];
  const lines = markdown.split('\n');
  let index = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      i++;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      const fence = trimmed.slice(0, 3);
      const codeLines = [line];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        codeLines.push(lines[i]);
        i++;
      }
      paragraphs.push({ text: codeLines.join('\n'), type: 'code', index: index++ });
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      paragraphs.push({
        text: headingMatch[2].trim(),
        type: 'heading',
        level: headingMatch[1].length,
        index: index++,
      });
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines = [];
      while (
        i < lines.length &&
        (lines[i].trim().startsWith('>') ||
          (lines[i].trim() && quoteLines.length > 0 && !lines[i].trim().startsWith('#')))
      ) {
        const quoteLine = lines[i].trim().replace(/^>\s?/, '');
        if (!lines[i].trim().startsWith('>') && !lines[i].trim()) break;
        quoteLines.push(quoteLine);
        i++;
      }
      paragraphs.push({ text: quoteLines.join('\n'), type: 'blockquote', index: index++ });
      continue;
    }

    // Table (starts with |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      paragraphs.push({ text: tableLines.join('\n'), type: 'table', index: index++ });
      continue;
    }

    // List item (- or * or 1.)
    if (/^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      paragraphs.push({ text: trimmed, type: 'list_item', index: index++ });
      i++;
      continue;
    }

    // Regular paragraph — collect lines until empty line or structural element
    const paraLines = [];
    while (i < lines.length) {
      const currentLine = lines[i].trim();
      if (
        !currentLine ||
        currentLine.startsWith('#') ||
        currentLine.startsWith('```') ||
        currentLine.startsWith('~~~') ||
        currentLine.startsWith('>') ||
        (currentLine.startsWith('|') && currentLine.endsWith('|')) ||
        /^[-*+]\s/.test(currentLine) ||
        /^\d+\.\s/.test(currentLine)
      ) {
        break;
      }
      paraLines.push(currentLine);
      i++;
    }

    if (paraLines.length > 0) {
      paragraphs.push({ text: paraLines.join(' '), type: 'paragraph', index: index++ });
    }
  }

  return paragraphs;
}
