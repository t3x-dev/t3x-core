import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export async function writeJsonFile<T>(filePath: string, value: T): Promise<void> {
  const json = JSON.stringify(value, null, 2);
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${json}\n`, 'utf-8');
}
