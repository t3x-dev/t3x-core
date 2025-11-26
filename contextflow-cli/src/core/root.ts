import path from 'node:path';
import { ensureDir, pathExists } from '../utils/fs';

const CONTEXTFLOW_DIR_NAME = '.contextflow';
const REQUIRED_SUBDIRS = ['conversations', 'commits', 'vectors'];

export interface ProjectRootInfo {
  projectRoot: string;
  contextflowDir: string;
  created: boolean;
}

export async function discoverProjectRoot(startDir: string): Promise<ProjectRootInfo> {
  let current = path.resolve(startDir);
  const home = path.parse(current).root;

  while (true) {
    const candidate = path.join(current, CONTEXTFLOW_DIR_NAME);
    if (await pathExists(candidate)) {
      await ensureProjectLayout(candidate);
      return {
        projectRoot: current,
        contextflowDir: candidate,
        created: false,
      };
    }

    if (current === home) {
      break;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  const newContextflowDir = path.join(path.resolve(startDir), CONTEXTFLOW_DIR_NAME);
  await ensureProjectLayout(newContextflowDir);

  return {
    projectRoot: path.resolve(startDir),
    contextflowDir: newContextflowDir,
    created: true,
  };
}

export async function ensureProjectLayout(contextflowDir: string): Promise<void> {
  await ensureDir(contextflowDir);
  await Promise.all(
    REQUIRED_SUBDIRS.map(async (subdir) => ensureDir(path.join(contextflowDir, subdir))),
  );
}
