/**
 * Export Utilities for SentenceCommit Data
 *
 * Provides functions to export commit data in various formats:
 * - Copy to clipboard
 * - Export as Markdown
 * - Export as JSON (excludes position data)
 */

import type { SentenceCommit } from './api';
import { copyToClipboard, downloadAsFile, type ExportResult } from './export';

// ============================================================================
// Markdown Export
// ============================================================================

export function formatCommitAsMarkdown(commit: SentenceCommit): string {
  const lines: string[] = [];

  lines.push(`# Commit: ${commit.message || commit.hash.slice(0, 12)}`);
  lines.push('');

  // Metadata
  lines.push(`**Hash:** \`${commit.hash}\``);
  lines.push(`**Branch:** ${commit.branch || 'unknown'}`);
  lines.push(`**Author:** ${commit.author.name || commit.author.type}`);
  lines.push(`**Date:** ${formatDate(commit.committed_at)}`);
  if (commit.parents.length > 0) {
    lines.push(`**Parents:** ${commit.parents.map((p) => `\`${p.slice(0, 12)}\``).join(', ')}`);
  }
  if (commit.message) {
    lines.push(`**Message:** ${commit.message}`);
  }
  lines.push('');

  // Source References
  if (commit.source_refs && commit.source_refs.length > 0) {
    lines.push('## Sources');
    lines.push('');
    for (const ref of commit.source_refs) {
      lines.push(`- **${ref.type}**: ${ref.title || ref.id}`);
      if (ref.assertion_lessons && ref.assertion_lessons.length > 0) {
        for (const lesson of ref.assertion_lessons) {
          lines.push(`  - Lesson: ${lesson}`);
        }
      }
    }
    lines.push('');
  }

  // Merge Summary
  if (commit.merge_summary) {
    const ms = commit.merge_summary;
    lines.push('## Merge Summary');
    lines.push('');
    lines.push(`- Kept identical: ${ms.kept_identical}`);
    lines.push(`- Resolved conflicts: ${ms.resolved_conflicts}`);
    lines.push(`- Kept from source: ${ms.kept_from_source}`);
    lines.push(`- Kept from target: ${ms.kept_from_target}`);
    lines.push(`- Discarded: ${ms.discarded}`);
    lines.push(`- Total sentences: ${ms.total_sentences}`);
    lines.push('');
  }

  // Sentences
  lines.push(`## Sentences (${commit.content.sentences.length})`);
  lines.push('');
  for (const sentence of commit.content.sentences) {
    const confidence =
      sentence.confidence !== undefined ? ` *(${(sentence.confidence * 100).toFixed(0)}%)*` : '';
    lines.push(`- ${sentence.text}${confidence}`);
  }
  lines.push('');

  lines.push('---');
  lines.push(`*Exported from T3X on ${formatDate(new Date().toISOString())}*`);

  return lines.join('\n');
}

// ============================================================================
// JSON Export
// ============================================================================

export function formatCommitAsJSON(commit: SentenceCommit): string {
  const { position_x: _x, position_y: _y, ...exportData } = commit;
  return JSON.stringify(exportData, null, 2);
}

// ============================================================================
// File Download
// ============================================================================

export function downloadCommitAsMarkdown(commit: SentenceCommit): void {
  const content = formatCommitAsMarkdown(commit);
  const filename = getCommitFilename(commit, 'md');
  downloadAsFile(content, filename, 'text/markdown');
}

export function downloadCommitAsJSON(commit: SentenceCommit): void {
  const content = formatCommitAsJSON(commit);
  const filename = getCommitFilename(commit, 'json');
  downloadAsFile(content, filename, 'application/json');
}

function getCommitFilename(commit: SentenceCommit, extension: string): string {
  const label = commit.message || commit.hash.slice(0, 12);
  const sanitized = label.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 50);
  const date = new Date().toISOString().slice(0, 10);
  return `commit_${sanitized}_${date}.${extension}`;
}

// ============================================================================
// Export Actions
// ============================================================================

export type CommitExportFormat = 'clipboard' | 'markdown' | 'json';

export async function exportCommit(
  commit: SentenceCommit,
  format: CommitExportFormat
): Promise<ExportResult> {
  try {
    switch (format) {
      case 'clipboard': {
        const text = commit.content.sentences.map((s) => s.text).join('\n');
        if (!text) {
          return { success: false, message: 'No sentences to copy' };
        }
        const copied = await copyToClipboard(text);
        return copied
          ? { success: true, message: 'Sentences copied to clipboard' }
          : { success: false, message: 'Failed to copy to clipboard' };
      }
      case 'markdown': {
        downloadCommitAsMarkdown(commit);
        return { success: true, message: 'Downloaded as Markdown' };
      }
      case 'json': {
        downloadCommitAsJSON(commit);
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
