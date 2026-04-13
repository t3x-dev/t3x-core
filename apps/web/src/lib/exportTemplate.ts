/**
 * Export Utilities for Template Data
 *
 * Provides functions to export templates in various formats:
 * - Copy prompt text to clipboard
 * - Export as Markdown
 * - Export as JSON
 */

import type { Template } from '@/infrastructure';
import { copyToClipboard, downloadAsFile, type ExportResult } from './export';

// ============================================================================
// Markdown Export
// ============================================================================

export function formatTemplateAsMarkdown(template: Template): string {
  const lines: string[] = [];

  lines.push(`# ${template.title}`);
  lines.push('');

  // Metadata
  lines.push(`**Category:** ${template.category}`);
  lines.push(`**Leaf Type:** ${template.leaf_type}`);
  if (template.is_builtin) {
    lines.push('**Source:** Built-in');
  }
  lines.push(`**Created:** ${formatDate(template.created_at)}`);
  lines.push('');

  // Description
  if (template.description) {
    lines.push('## Description');
    lines.push('');
    lines.push(template.description);
    lines.push('');
  }

  // Tags
  if (template.tags.length > 0) {
    lines.push('## Tags');
    lines.push('');
    lines.push(template.tags.map((t) => `\`${t}\``).join(', '));
    lines.push('');
  }

  // System Prompt
  lines.push('## System Prompt');
  lines.push('');
  lines.push('```');
  lines.push(template.system_prompt);
  lines.push('```');
  lines.push('');

  // User Prompt
  lines.push('## User Prompt');
  lines.push('');
  lines.push('```');
  lines.push(template.user_prompt);
  lines.push('```');
  lines.push('');

  // Variables
  if (template.variables.length > 0) {
    lines.push(`## Variables (${template.variables.length})`);
    lines.push('');
    lines.push('| Variable | Description | Required | Default |');
    lines.push('|----------|-------------|----------|---------|');
    for (const v of template.variables) {
      const req = v.required ? 'Yes' : 'No';
      const def = v.defaultValue !== undefined ? v.defaultValue || '(empty)' : '-';
      lines.push(`| \`{{${v.name}}}\` | ${v.description} | ${req} | ${def} |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Exported from T3X on ${formatDate(new Date().toISOString())}*`);

  return lines.join('\n');
}

// ============================================================================
// JSON Export
// ============================================================================

export function formatTemplateAsJSON(template: Template): string {
  return JSON.stringify(template, null, 2);
}

// ============================================================================
// Prompt Export
// ============================================================================

export function formatTemplateAsPrompt(template: Template): string {
  const lines: string[] = [];

  if (template.system_prompt) {
    lines.push(template.system_prompt);
  }

  if (template.user_prompt) {
    if (lines.length > 0) lines.push('');
    lines.push(template.user_prompt);
  }

  return lines.join('\n');
}

// ============================================================================
// File Download
// ============================================================================

export function downloadTemplateAsMarkdown(template: Template): void {
  const content = formatTemplateAsMarkdown(template);
  const filename = getTemplateFilename(template, 'md');
  downloadAsFile(content, filename, 'text/markdown');
}

export function downloadTemplateAsJSON(template: Template): void {
  const content = formatTemplateAsJSON(template);
  const filename = getTemplateFilename(template, 'json');
  downloadAsFile(content, filename, 'application/json');
}

function getTemplateFilename(template: Template, extension: string): string {
  const sanitized = template.title.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 50);
  const date = new Date().toISOString().slice(0, 10);
  return `template_${sanitized}_${date}.${extension}`;
}

// ============================================================================
// Export Actions
// ============================================================================

export type TemplateExportFormat = 'clipboard' | 'markdown' | 'json';

export async function exportTemplate(
  template: Template,
  format: TemplateExportFormat
): Promise<ExportResult> {
  try {
    switch (format) {
      case 'clipboard': {
        const text = formatTemplateAsPrompt(template);
        if (!text) {
          return { success: false, message: 'No prompt to copy' };
        }
        const copied = await copyToClipboard(text);
        return copied
          ? { success: true, message: 'Prompt copied to clipboard' }
          : { success: false, message: 'Failed to copy to clipboard' };
      }
      case 'markdown': {
        downloadTemplateAsMarkdown(template);
        return { success: true, message: 'Downloaded as Markdown' };
      }
      case 'json': {
        downloadTemplateAsJSON(template);
        return { success: true, message: 'Downloaded as JSON' };
      }
      default:
        return { success: false, message: `Unknown format: ${format}` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Export failed';
    return { success: false, message };
  }
}

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return isoString;
  }
}
