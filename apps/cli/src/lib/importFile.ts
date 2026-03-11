/**
 * Local file import utilities.
 *
 * Reads files from disk, splits content into paragraphs,
 * and creates conversations + turns via the T3X API.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { T3xClient } from '@t3x-dev/api-client';

export interface ImportResult {
  conversationId: string;
  conversationTitle: string;
  turnCount: number;
  filePath: string;
}

export type FileFormat = 'auto' | 'markdown' | 'text' | 'pdf';

/** Supported file extensions for auto-detection */
const FORMAT_EXTENSIONS: Record<string, FileFormat> = {
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.markdown': 'markdown',
  '.txt': 'text',
  '.text': 'text',
  '.pdf': 'pdf',
  '.html': 'text',
  '.htm': 'text',
  '.rst': 'text',
  '.adoc': 'text',
};

/**
 * Detect file format from extension.
 */
export function detectFormat(filePath: string): FileFormat {
  const ext = path.extname(filePath).toLowerCase();
  return FORMAT_EXTENSIONS[ext] || 'text';
}

/**
 * Split text content into paragraphs.
 *
 * Splits on double-newlines (blank lines). Each non-empty
 * paragraph becomes a separate turn.
 */
export function splitToParagraphs(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Read file content as text.
 *
 * For PDF files, falls back to raw text extraction (basic).
 * For all other formats, reads as UTF-8 text.
 */
export function readFileContent(filePath: string, format: FileFormat): string {
  if (format === 'pdf') {
    // PDF: CLI local import cannot properly extract PDF text.
    // The API-based import (POST /v1/import/file) has real PDF parsing.
    console.warn(
      'Warning: PDF text extraction via CLI is very limited. ' +
        'For better results, use the API-based import: POST /v1/import/file'
    );
    const buffer = fs.readFileSync(filePath);
    const raw = buffer.toString('utf-8');
    const cleaned = raw.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s{3,}/g, '\n\n');
    if (cleaned.trim().length < 50) {
      throw new Error(
        `PDF extraction produced no usable text. Use the API-based import instead: POST /v1/import/file`
      );
    }
    return cleaned;
  }

  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Derive a conversation title from a file path.
 */
export function deriveTitle(filePath: string): string {
  const basename = path.basename(filePath);
  // Remove extension
  const name = basename.replace(/\.[^.]+$/, '');
  // Replace common separators with spaces
  return name.replace(/[-_]/g, ' ');
}

/**
 * Import a single file as a conversation.
 *
 * Each paragraph in the file becomes a Turn with role='user'.
 * Returns the import result with conversation details.
 */
export async function importFile(
  client: T3xClient,
  projectId: string,
  filePath: string,
  options: { conversationName?: string; format?: FileFormat }
): Promise<ImportResult> {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${resolvedPath}`);
  }

  const format =
    options.format === 'auto' || !options.format ? detectFormat(resolvedPath) : options.format;

  const content = readFileContent(resolvedPath, format);
  const paragraphs = splitToParagraphs(content);

  if (paragraphs.length === 0) {
    throw new Error(`No content found in: ${resolvedPath}`);
  }

  const title = options.conversationName || deriveTitle(resolvedPath);

  // Create conversation via API
  const conversation = await client.createConversation({
    project_id: projectId,
    title,
  });

  // Create turns sequentially (each needs the previous turn's hash as parent)
  let parentTurnHash: string | undefined;
  for (const paragraph of paragraphs) {
    const turn = await client.createTurn({
      conversation_id: conversation.conversation_id,
      role: 'user',
      content: paragraph,
      parent_turn_hash: parentTurnHash,
    });
    parentTurnHash = turn.turn_hash;
  }

  return {
    conversationId: conversation.conversation_id,
    conversationTitle: title,
    turnCount: paragraphs.length,
    filePath: resolvedPath,
  };
}

/**
 * Collect files from a directory, optionally recursive.
 */
export function collectFiles(dirPath: string, recursive: boolean): string[] {
  const resolvedDir = path.resolve(dirPath);

  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Directory not found: ${resolvedDir}`);
  }

  const stat = fs.statSync(resolvedDir);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${resolvedDir}`);
  }

  const files: string[] = [];
  const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(resolvedDir, entry.name);

    if (entry.isFile()) {
      // Only include files with recognized extensions
      const ext = path.extname(entry.name).toLowerCase();
      if (ext in FORMAT_EXTENSIONS) {
        files.push(fullPath);
      }
    } else if (entry.isDirectory() && recursive) {
      files.push(...collectFiles(fullPath, recursive));
    }
  }

  // Sort for deterministic order
  return files.sort();
}

/**
 * Import a directory of files as conversations.
 *
 * Each file becomes a separate conversation. Returns results
 * for all successfully imported files.
 */
export async function importDirectory(
  client: T3xClient,
  projectId: string,
  dirPath: string,
  options: { recursive?: boolean; format?: FileFormat }
): Promise<ImportResult[]> {
  const files = collectFiles(dirPath, options.recursive ?? false);

  if (files.length === 0) {
    throw new Error(`No importable files found in: ${path.resolve(dirPath)}`);
  }

  const results: ImportResult[] = [];

  for (const filePath of files) {
    const result = await importFile(client, projectId, filePath, {
      format: options.format,
    });
    results.push(result);
  }

  return results;
}
