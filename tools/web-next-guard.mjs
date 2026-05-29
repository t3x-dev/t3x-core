import { execFileSync, spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];

if (mode !== 'dev' && mode !== 'build') {
  throw new Error('Usage: node tools/web-next-guard.mjs <dev|build>');
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDir = path.join(repoRoot, 'apps', 'web');
const nextDir = path.join(webDir, '.next');
const lockPath = path.join(webDir, '.next.t3x.lock');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLock() {
  if (!existsSync(lockPath)) return null;
  try {
    return JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

function removeLock() {
  rmSync(lockPath, { force: true });
}

function processRows() {
  if (process.platform === 'win32') return [];
  try {
    return execFileSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .flatMap((line) => {
        const match = line.trim().match(/^(\d+)\s+(\d+)$/);
        return match ? [{ pid: Number(match[1]), ppid: Number(match[2]) }] : [];
      });
  } catch {
    return [];
  }
}

function processCommand(pid) {
  if (process.platform === 'win32') return '';
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function descendantsOf(rootPid) {
  const children = new Map();
  for (const row of processRows()) {
    const list = children.get(row.ppid) ?? [];
    list.push(row.pid);
    children.set(row.ppid, list);
  }

  const result = [];
  const visit = (pid) => {
    for (const child of children.get(pid) ?? []) {
      result.push(child);
      visit(child);
    }
  };
  visit(rootPid);
  return result;
}

async function terminateProcessTree(rootPid, reason) {
  if (!pidAlive(rootPid) || rootPid === process.pid) return;
  const pids = [rootPid, ...descendantsOf(rootPid)]
    .filter((pid) => pid !== process.pid)
    .filter((pid, index, all) => all.indexOf(pid) === index)
    .reverse();

  if (pids.length === 0) return;
  console.log(
    `[web-next-guard] stopping existing WebUI process tree (${reason}): ${pids.join(', ')}`
  );
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Already exited.
    }
  }
  await delay(900);
  for (const pid of pids) {
    if (!pidAlive(pid)) continue;
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already exited.
    }
  }
}

function portPids(port) {
  if (process.platform === 'win32') return [];
  try {
    return execFileSync('lsof', ['-ti', `:${port}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(Number)
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

function isNextDevCommand(command) {
  return command.includes('next') && command.includes(' dev');
}

async function handleExistingLockForDev() {
  const lock = readLock();
  if (!lock?.pid) {
    removeLock();
    return;
  }
  if (!pidAlive(lock.pid)) {
    removeLock();
    return;
  }
  await terminateProcessTree(lock.pid, 'stale WebUI dev lock');
  removeLock();
}

function assertNoWebDevForBuild() {
  const lock = readLock();
  if (lock?.pid && pidAlive(lock.pid)) {
    throw new Error(
      `Refusing to run next build while WebUI dev is running (pid ${lock.pid}). Stop it first with pnpm stop:webui.`
    );
  }
  if (lock) removeLock();

  const nextDevPids = portPids(3000).filter((pid) => isNextDevCommand(processCommand(pid)));
  if (nextDevPids.length > 0) {
    throw new Error(
      `Refusing to run next build while next dev is listening on :3000 (pid ${nextDevPids.join(', ')}). Stop it first with pnpm stop:webui.`
    );
  }
}

async function stopExistingPortForDev() {
  const pids = portPids(3000).filter((pid) => pid !== process.pid);
  for (const pid of pids) {
    await terminateProcessTree(pid, 'port 3000 is already in use');
  }
}

function acquireLock() {
  mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    const fd = openSync(lockPath, 'wx');
    writeFileSync(
      fd,
      JSON.stringify(
        {
          pid: process.pid,
          mode,
          cwd: webDir,
          createdAt: new Date().toISOString(),
        },
        null,
        2
      )
    );
    closeSync(fd);
  } catch {
    const lock = readLock();
    if (lock?.pid && pidAlive(lock.pid)) {
      throw new Error(
        `WebUI ${lock.mode ?? 'Next'} process already owns ${lockPath} (pid ${lock.pid}).`
      );
    }
    removeLock();
    return acquireLock();
  }
}

function spawnNext(args) {
  const child = spawn('pnpm', ['exec', 'next', ...args], {
    cwd: webDir,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  const cleanup = () => {
    removeLock();
  };

  const forwardSignal = (signal) => {
    if (child.exitCode === null) child.kill(signal);
    cleanup();
  };

  process.once('SIGINT', () => forwardSignal('SIGINT'));
  process.once('SIGTERM', () => forwardSignal('SIGTERM'));

  child.on('error', (error) => {
    cleanup();
    throw error;
  });

  child.on('close', (code, signal) => {
    cleanup();
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

if (mode === 'dev') {
  await handleExistingLockForDev();
  await stopExistingPortForDev();
  acquireLock();
  rmSync(nextDir, { recursive: true, force: true });
  spawnNext(['dev']);
} else {
  assertNoWebDevForBuild();
  acquireLock();
  spawnNext(['build']);
}
