/**
 * Storage Root Resolution
 *
 * Resolves the storage root directory for T3X data.
 * Priority: T3X_ROOT env > discover existing .t3x/ > create at repo root
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

const T3X_DIR = '.t3x';

export interface StorageRoot {
  /** Repository root directory */
  projectRoot: string;
  /** Absolute path to .t3x directory */
  t3xDir: string;
  /** How the storage root was determined */
  source: 'env' | 'discovered' | 'created';
}

/**
 * Resolve storage root directory
 *
 * Priority:
 * 1. T3X_ROOT environment variable
 * 2. Walk up from startDir to find existing .t3x/
 * 3. Walk up to find repo root (.git or package.json) and create there
 * 4. Fallback to startDir
 *
 * @param startDir Starting directory for search (defaults to cwd)
 * @returns StorageRoot with resolved paths
 */
export function resolveStorageRoot(startDir?: string): StorageRoot {
  // 1. Environment variable takes priority
  const envRoot = process.env.T3X_ROOT;
  if (envRoot) {
    const resolved = path.resolve(envRoot);
    const t3xDir = path.join(resolved, T3X_DIR);
    return { projectRoot: resolved, t3xDir, source: 'env' };
  }

  const cwd = startDir ?? process.cwd();
  let current = path.resolve(cwd);
  const root = path.parse(current).root;

  // 2. Walk up to find existing .t3x/
  while (current !== root) {
    const candidate = path.join(current, T3X_DIR);
    if (existsSync(candidate)) {
      return { projectRoot: current, t3xDir: candidate, source: 'discovered' };
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
      const t3xDir = path.join(current, T3X_DIR);
      return { projectRoot: current, t3xDir, source: 'created' };
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
      const t3xDir = path.join(current, T3X_DIR);
      return { projectRoot: current, t3xDir, source: 'created' };
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // 5. Fallback to startDir
  const t3xDir = path.join(cwd, T3X_DIR);
  return { projectRoot: cwd, t3xDir, source: 'created' };
}

/**
 * Detect legacy .t3x directories in subpackages
 *
 * Used to warn users about data fragmentation and suggest migration.
 *
 * @param projectRoot The resolved project root
 * @returns Array of paths to legacy .t3x directories
 */
export function detectLegacyStorageDirs(projectRoot: string): string[] {
  const legacyDirs: string[] = [];
  const subDirs = ['t3x-cli', 't3x-core', 't3x-webui'];

  for (const sub of subDirs) {
    const candidate = path.join(projectRoot, sub, T3X_DIR);
    if (existsSync(candidate)) {
      legacyDirs.push(candidate);
    }
  }

  return legacyDirs;
}

/**
 * Get subdirectory paths within the storage root
 */
export function getStoragePaths(t3xDir: string) {
  return {
    db: path.join(t3xDir, 'project.db'),
    turnsLedger: path.join(t3xDir, 'turns.jsonl'),
    commitsLedger: path.join(t3xDir, 'commits.jsonl'),
    draftsLedger: path.join(t3xDir, 'drafts.jsonl'),
    conversations: path.join(t3xDir, 'conversations'),
    commits: path.join(t3xDir, 'commits'),
    vectors: path.join(t3xDir, 'vectors'),
  };
}
