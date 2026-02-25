/**
 * Export Utilities for Leaf Data
 *
 * Provides functions to export leaf data in various formats:
 * - Copy to clipboard
 * - Export as Markdown
 * - Export as JSON (with metadata)
 * - Download as file
 */

import type { Assertion, Constraint, Leaf } from './api';

// ============================================================================
// Types
// ============================================================================

export interface ExportMetadata {
  commit_hash: string;
  project_id: string;
  exported_at: string;
}

export interface LeafExportJSON {
  leaf: Leaf;
  source: {
    commit_hash: string;
    project_id: string;
  };
  exported_at: string;
}

// ============================================================================
// Clipboard
// ============================================================================

/**
 * Copy text to clipboard
 * @param text - Text to copy
 * @returns Promise<boolean> - true if successful, false if failed
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers or when clipboard API is not available
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Markdown Export
// ============================================================================

/**
 * Format a leaf as Markdown
 * @param leaf - Leaf data to format
 * @returns Markdown string
 */
export function formatLeafAsMarkdown(leaf: Leaf): string {
  const lines: string[] = [];

  // Title
  const title = leaf.title || `Leaf: ${leaf.id}`;
  lines.push(`# ${title}`);
  lines.push('');

  // Metadata
  lines.push(`**Type:** ${leaf.type}`);
  lines.push(`**Created:** ${formatDate(leaf.created_at)}`);
  lines.push(`**Commit:** \`${leaf.commit_hash}\``);
  if (leaf.generated_at) {
    lines.push(`**Generated:** ${formatDate(leaf.generated_at)}`);
  }
  lines.push('');

  // Constraints
  if (leaf.constraints.length > 0) {
    lines.push('## Constraints');
    lines.push('');

    const requireConstraints = leaf.constraints.filter((c) => c.type === 'require');
    const excludeConstraints = leaf.constraints.filter((c) => c.type === 'exclude');

    if (requireConstraints.length > 0) {
      lines.push(`### Must Have (${requireConstraints.length})`);
      lines.push('');
      for (const c of requireConstraints) {
        const icon = getConstraintIcon(c, leaf.assertions);
        lines.push(`- ${icon} ${c.value} *(${c.match_mode})*`);
        if (c.description) {
          lines.push(`  - ${c.description}`);
        }
      }
      lines.push('');
    }

    if (excludeConstraints.length > 0) {
      lines.push(`### Must Not Have (${excludeConstraints.length})`);
      lines.push('');
      for (const c of excludeConstraints) {
        const icon = getConstraintIcon(c, leaf.assertions);
        lines.push(`- ${icon} ${c.value} *(${c.match_mode})*`);
        if (c.type === 'exclude' && c.reason) {
          lines.push(`  - Reason: ${c.reason}`);
        }
      }
      lines.push('');
    }
  }

  // Output
  lines.push('## Output');
  lines.push('');
  if (leaf.output) {
    lines.push('```');
    lines.push(leaf.output);
    lines.push('```');
  } else {
    lines.push('*No output generated yet.*');
  }
  lines.push('');

  // Validation Results
  if (leaf.assertions && leaf.assertions.length > 0) {
    lines.push('## Validation Results');
    lines.push('');

    const passedCount = leaf.assertions.filter((a) => a.passed).length;
    const totalCount = leaf.assertions.length;
    const allPassed = passedCount === totalCount;

    lines.push(
      allPassed
        ? `**Status:** ✅ All Passed (${passedCount}/${totalCount})`
        : `**Status:** ❌ ${totalCount - passedCount} Failed (${passedCount}/${totalCount} passed)`
    );
    lines.push('');

    // Create constraint map for lookup
    const constraintMap = new Map(leaf.constraints.map((c) => [c.id, c]));

    for (const assertion of leaf.assertions) {
      const constraint = constraintMap.get(assertion.constraint_id);
      const icon = assertion.passed ? '✅' : '❌';
      const value = constraint?.value || assertion.constraint_id;
      lines.push(`- ${icon} **${value}**: ${assertion.details}`);
      if (assertion.lesson) {
        lines.push(`  - *Lesson: ${assertion.lesson}*`);
      }
    }
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push(`*Exported from T3X on ${formatDate(new Date().toISOString())}*`);

  return lines.join('\n');
}

/**
 * Get icon for constraint based on assertion result
 */
function getConstraintIcon(constraint: Constraint, assertions: Assertion[] | null): string {
  if (!assertions) return '○';
  const assertion = assertions.find((a) => a.constraint_id === constraint.id);
  if (!assertion) return '○';
  return assertion.passed ? '✅' : '❌';
}

/**
 * Format ISO date string to readable format
 */
function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return isoString;
  }
}

// ============================================================================
// JSON Export
// ============================================================================

/**
 * Format a leaf as JSON with metadata
 * @param leaf - Leaf data to format
 * @returns JSON export object
 */
export function formatLeafAsJSON(leaf: Leaf): LeafExportJSON {
  return {
    leaf: {
      ...leaf,
    },
    source: {
      commit_hash: leaf.commit_hash,
      project_id: leaf.project_id,
    },
    exported_at: new Date().toISOString(),
  };
}

/**
 * Convert leaf to JSON string with pretty formatting
 * @param leaf - Leaf data to format
 * @returns Formatted JSON string
 */
export function formatLeafAsJSONString(leaf: Leaf): string {
  const exportData = formatLeafAsJSON(leaf);
  return JSON.stringify(exportData, null, 2);
}

// ============================================================================
// File Download
// ============================================================================

/**
 * Download content as a file
 * @param content - File content
 * @param filename - Name of the file
 * @param mimeType - MIME type of the file
 */
export function downloadAsFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Download leaf as Markdown file
 * @param leaf - Leaf data to download
 */
export function downloadLeafAsMarkdown(leaf: Leaf): void {
  const content = formatLeafAsMarkdown(leaf);
  const filename = getExportFilename(leaf, 'md');
  downloadAsFile(content, filename, 'text/markdown');
}

/**
 * Download leaf as JSON file
 * @param leaf - Leaf data to download
 */
export function downloadLeafAsJSON(leaf: Leaf): void {
  const content = formatLeafAsJSONString(leaf);
  const filename = getExportFilename(leaf, 'json');
  downloadAsFile(content, filename, 'application/json');
}

/**
 * Generate export filename
 * @param leaf - Leaf data
 * @param extension - File extension
 * @returns Filename string
 */
function getExportFilename(leaf: Leaf, extension: string): string {
  const title = leaf.title || leaf.type;
  const sanitized = title.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 50);
  const date = new Date().toISOString().slice(0, 10);
  return `${sanitized}_${date}.${extension}`;
}

// ============================================================================
// Export Actions (convenience functions)
// ============================================================================

export type ExportFormat = 'clipboard' | 'markdown' | 'json' | 'prompt';

export interface ExportResult {
  success: boolean;
  message: string;
}

/**
 * Format a leaf as prompt text (system + user prompt from config)
 */
export function formatLeafAsPrompt(leaf: Leaf): string {
  const lines: string[] = [];

  const promptTemplate = leaf.config?.prompt_template;
  if (promptTemplate) {
    lines.push(promptTemplate);
  } else if (leaf.output) {
    lines.push(leaf.output);
  }

  return lines.join('\n');
}

/**
 * Export leaf in specified format
 * @param leaf - Leaf data to export
 * @param format - Export format
 * @returns Export result with success status and message
 */
export async function exportLeaf(leaf: Leaf, format: ExportFormat): Promise<ExportResult> {
  try {
    switch (format) {
      case 'clipboard': {
        const text = leaf.output || '';
        if (!text) {
          return { success: false, message: 'No output to copy' };
        }
        const copied = await copyToClipboard(text);
        return copied
          ? { success: true, message: 'Output copied to clipboard' }
          : { success: false, message: 'Failed to copy to clipboard' };
      }

      case 'prompt': {
        const prompt = formatLeafAsPrompt(leaf);
        if (!prompt) {
          return { success: false, message: 'No prompt to copy' };
        }
        const copied = await copyToClipboard(prompt);
        return copied
          ? { success: true, message: 'Prompt copied to clipboard' }
          : { success: false, message: 'Failed to copy to clipboard' };
      }

      case 'markdown': {
        downloadLeafAsMarkdown(leaf);
        return { success: true, message: 'Downloaded as Markdown' };
      }

      case 'json': {
        downloadLeafAsJSON(leaf);
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
