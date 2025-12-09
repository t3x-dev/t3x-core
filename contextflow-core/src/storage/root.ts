/**
 * Storage Root Resolution
 *
 * Resolves the storage root directory for ContextFlow data.
 * Priority: CONTEXTFLOW_ROOT env > discover existing .contextflow/ > create at repo root
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

const CONTEXTFLOW_DIR = '.contextflow';

export interface StorageRoot {
  /** Repository root directory */
  projectRoot: string;
  /** Absolute path to .contextflow directory */
  contextflowDir: string;
  /** How the storage root was determined */
  source: 'env' | 'discovered' | 'created';
}

/**
 * Resolve storage root directory
 *
 * Priority:
 * 1. CONTEXTFLOW_ROOT environment variable
 * 2. Walk up from startDir to find existing .contextflow/
 * 3. Walk up to find repo root (.git or package.json) and create there
 * 4. Fallback to startDir
 *
 * @param startDir Starting directory for search (defaults to cwd)
 * @returns StorageRoot with resolved paths
 */
export function resolveStorageRoot(startDir?: string): StorageRoot {
  // 1. Environment variable takes priority
  const envRoot = process.env.CONTEXTFLOW_ROOT;
  if (envRoot) {
    const resolved = path.resolve(envRoot);
    const contextflowDir = path.join(resolved, CONTEXTFLOW_DIR);
    return { projectRoot: resolved, contextflowDir, source: 'env' };
  }

  const cwd = startDir ?? process.cwd();
  let current = path.resolve(cwd);
  const root = path.parse(current).root;

  // 2. Walk up to find existing .contextflow/
  while (current !== root) {
    const candidate = path.join(current, CONTEXTFLOW_DIR);
    if (existsSync(candidate)) {
      return { projectRoot: current, contextflowDir: candidate, source: 'discovered' };
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // 3. Walk up to find repo root (.git first, then package.json as fallback)
  // Prioritize .git to ensure monorepo root is used instead of sub-packages
  current = path.resolve(cwd);
  while (current !== root) {
    const hasGit = existsSync(path.join(current, '.git'));
    if (hasGit) {
      const contextflowDir = path.join(current, CONTEXTFLOW_DIR);
      return { projectRoot: current, contextflowDir, source: 'created' };
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // 4. Fallback: walk up to find package.json (for non-git projects)
  current = path.resolve(cwd);
  while (current !== root) {
    const hasPkg = existsSync(path.join(current, 'package.json'));
    if (hasPkg) {
      const contextflowDir = path.join(current, CONTEXTFLOW_DIR);
      return { projectRoot: current, contextflowDir, source: 'created' };
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // 5. Fallback to startDir
  const contextflowDir = path.join(cwd, CONTEXTFLOW_DIR);
  return { projectRoot: cwd, contextflowDir, source: 'created' };
}

/**
 * Detect legacy .contextflow directories in subpackages
 *
 * Used to warn users about data fragmentation and suggest migration.
 *
 * @param projectRoot The resolved project root
 * @returns Array of paths to legacy .contextflow directories
 */
export function detectLegacyStorageDirs(projectRoot: string): string[] {
  const legacyDirs: string[] = [];
  const subDirs = ['contextflow-cli', 'contextflow-core', 'contextflow-webui'];

  for (const sub of subDirs) {
    const candidate = path.join(projectRoot, sub, CONTEXTFLOW_DIR);
    if (existsSync(candidate)) {
      legacyDirs.push(candidate);
    }
  }

  return legacyDirs;
}

/**
 * Get subdirectory paths within the storage root
 */
export function getStoragePaths(contextflowDir: string) {
  return {
    db: path.join(contextflowDir, 'project.db'),
    turnsLedger: path.join(contextflowDir, 'turns.jsonl'),
    commitsLedger: path.join(contextflowDir, 'commits.jsonl'),
    draftsLedger: path.join(contextflowDir, 'drafts.jsonl'),
    conversations: path.join(contextflowDir, 'conversations'),
    commits: path.join(contextflowDir, 'commits'),
    vectors: path.join(contextflowDir, 'vectors'),
  };
}
