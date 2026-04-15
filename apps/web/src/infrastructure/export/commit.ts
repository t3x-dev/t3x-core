/**
 * Export Utilities for ApiCommit Data
 *
 * Provides functions to export commit data in various formats:
 * - Copy to clipboard
 * - Export as Markdown
 * - Export as JSON (excludes position data)
 */

import type { ApiCommit } from '@/infrastructure';
import { getSemanticContent, treeSummaryText } from '@/infrastructure/commits';
import { copyToClipboard, downloadAsFile, type ExportResult } from './core';

// ============================================================================
// Markdown Export
// ============================================================================

export function formatCommitAsMarkdown(commit: ApiCommit): string {
  const lines: string[] = [];
  const nodes = getSemanticContent(commit).trees;

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
  if (commit.sources && commit.sources.length > 0) {
    lines.push('## Sources');
    lines.push('');
    for (const ref of commit.sources) {
      lines.push(`- **${ref.type}**: ${ref.title || ref.id}`);
    }
    lines.push('');
  }

  // Frames
  lines.push(`## Frames (${nodes.length})`);
  lines.push('');
  for (const node of nodes) {
    const slots = Object.entries(node.slots ?? {})
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(', ');
    lines.push(`- ${node.key}: ${slots}`);
  }
  lines.push('');

  lines.push('---');
  lines.push(`*Exported from T3X on ${formatDate(new Date().toISOString())}*`);

  return lines.join('\n');
}

// ============================================================================
// JSON Export
// ============================================================================

export function formatCommitAsJSON(commit: ApiCommit): string {
  const { position_x: _x, position_y: _y, ...exportData } = commit;
  return JSON.stringify(exportData, null, 2);
}

// ============================================================================
// File Download
// ============================================================================

export function downloadCommitAsMarkdown(commit: ApiCommit): void {
  const content = formatCommitAsMarkdown(commit);
  const filename = getCommitFilename(commit, 'md');
  downloadAsFile(content, filename, 'text/markdown');
}

export function downloadCommitAsJSON(commit: ApiCommit): void {
  const content = formatCommitAsJSON(commit);
  const filename = getCommitFilename(commit, 'json');
  downloadAsFile(content, filename, 'application/json');
}

function getCommitFilename(commit: ApiCommit, extension: string): string {
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
  commit: ApiCommit,
  format: CommitExportFormat
): Promise<ExportResult> {
  try {
    switch (format) {
      case 'clipboard': {
        const text = treeSummaryText(commit);
        if (!text) {
          return { success: false, message: 'No trees to copy' };
        }
        const copied = await copyToClipboard(text);
        return copied
          ? { success: true, message: 'Frames copied to clipboard' }
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
