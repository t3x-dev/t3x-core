/**
 * Context Formatter
 *
 * Utilities for formatting BuiltContext as JSON or Markdown for export.
 *
 * @see Issue I2: implement context export (JSON/Markdown)
 */

import type { BuiltContext, ContextSource } from '@t3x/core';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface ExportMetadata {
  conversation_id: string;
  exported_at: string;
  format: 'json' | 'markdown';
}

export interface ContextExportJson {
  metadata: ExportMetadata;
  context: BuiltContext;
}

// ═══════════════════════════════════════════════════════════════════════════
// JSON Formatter
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format BuiltContext as JSON string.
 *
 * @param context - The built context to format
 * @param conversationId - The conversation ID for metadata
 * @returns Formatted JSON string
 */
export function formatContextAsJson(
  context: BuiltContext,
  conversationId: string
): string {
  const exportData: ContextExportJson = {
    metadata: {
      conversation_id: conversationId,
      exported_at: new Date().toISOString(),
      format: 'json',
    },
    context,
  };

  return JSON.stringify(exportData, null, 2);
}

// ═══════════════════════════════════════════════════════════════════════════
// Markdown Formatter
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format a single source as markdown list item.
 */
function formatSource(source: ContextSource): string {
  const title = source.title ? ` - ${source.title}` : '';
  return `- [${source.type}] ${source.id}${title}`;
}

/**
 * Format BuiltContext as Markdown string.
 *
 * @param context - The built context to format
 * @param conversationId - The conversation ID for metadata
 * @returns Formatted Markdown string
 */
export function formatContextAsMarkdown(
  context: BuiltContext,
  conversationId: string
): string {
  const exportedAt = new Date().toISOString();

  const lines: string[] = [
    '# Context Export',
    '',
    `**Conversation ID:** ${conversationId}`,
    `**Exported at:** ${exportedAt}`,
    `**Token estimate:** ${context.token_estimate}`,
    '',
    '---',
    '',
    '## Content',
    '',
    context.text,
    '---',
    '',
    '## Sources',
    '',
  ];

  if (context.sources.length > 0) {
    for (const source of context.sources) {
      lines.push(formatSource(source));
    }
  } else {
    lines.push('_No sources_');
  }

  lines.push('');

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Export Function
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format context for export based on requested format.
 *
 * @param context - The built context to format
 * @param conversationId - The conversation ID for metadata
 * @param format - Export format ('json' or 'markdown')
 * @returns Formatted string and content type
 */
export function formatContextForExport(
  context: BuiltContext,
  conversationId: string,
  format: 'json' | 'markdown' = 'json'
): { content: string; contentType: string; fileExtension: string } {
  if (format === 'markdown') {
    return {
      content: formatContextAsMarkdown(context, conversationId),
      contentType: 'text/markdown; charset=utf-8',
      fileExtension: 'md',
    };
  }

  return {
    content: formatContextAsJson(context, conversationId),
    contentType: 'application/json; charset=utf-8',
    fileExtension: 'json',
  };
}
