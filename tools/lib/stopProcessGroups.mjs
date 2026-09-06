import { setTimeout as delay } from 'node:timers/promises';

// Children must have been spawned detached on POSIX. The launcher may exit
// before its descendants (notably PostgreSQL) finish writing their data.
export async function stopProcessGroups(
  children,
  {
    graceMs = 5000,
    killMs = 5000,
    pollMs = 100,
    kill = process.kill,
    platform = process.platform,
  } = {}
) {
  const targets = children.filter((child) => child.pid);
  const alive = (child) => {
    if (platform === 'win32') return child.exitCode === null && child.signalCode === null;
    try {
      kill(-child.pid, 0);
      return true;
    } catch (error) {
      if (error.code === 'ESRCH') return false;
      // POSIX EPERM still means the group exists; wait until it disappears.
      if (error.code === 'EPERM') return true;
      throw new Error(`Cannot inspect ${child.label ?? child.pid} process group: ${error.message}`);
    }
  };
  const signal = (child, value) => {
    try {
      if (platform === 'win32') child.kill(value);
      else kill(-child.pid, value);
    } catch (error) {
      if (error.code !== 'ESRCH') {
        throw new Error(`Cannot send ${value} to ${child.label ?? child.pid}: ${error.message}`);
      }
    }
  };
  const wait = async (timeout) => {
    const deadline = Date.now() + timeout;
    while (targets.some(alive)) {
      if (Date.now() >= deadline) return false;
      await delay(pollMs);
    }
    return true;
  };

  for (const child of targets) if (alive(child)) signal(child, 'SIGTERM');
  if (await wait(graceMs)) return;
  for (const child of targets) if (alive(child)) signal(child, 'SIGKILL');
  if (!(await wait(killMs))) {
    throw new Error('E2E process groups did not stop; preserving the data directory.');
  }
}
