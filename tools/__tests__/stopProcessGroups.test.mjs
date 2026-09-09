import assert from 'node:assert/strict';
import test from 'node:test';
import { stopProcessGroups } from '../lib/stopProcessGroups.mjs';

test('waits for descendants even after their launcher exits, including after SIGKILL', async () => {
  const signals = [];
  let exists = true;
  let probesAfterKill = 0;
  await stopProcessGroups([{ pid: 42, exitCode: 0, signalCode: null }], {
    platform: 'darwin',
    graceMs: 0,
    killMs: 100,
    pollMs: 1,
    kill(pid, signal) {
      assert.equal(pid, -42);
      if (signal === 0) {
        if (signals.includes('SIGKILL') && ++probesAfterKill === 3) exists = false;
        if (!exists) throw Object.assign(new Error('gone'), { code: 'ESRCH' });
      } else signals.push(signal);
    },
  });
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(probesAfterKill, 3);
});

test('fails rather than allowing data deletion when descendants remain', async () => {
  await assert.rejects(
    stopProcessGroups([{ pid: 42 }], {
      platform: 'linux',
      graceMs: 0,
      killMs: 0,
      kill() {},
    }),
    /preserving the data directory/
  );
});

test('does not signal a process group that has already disappeared', async () => {
  await stopProcessGroups([{ pid: 42 }], {
    platform: 'linux',
    kill(_pid, signal) {
      assert.equal(signal, 0);
      throw Object.assign(new Error('gone'), { code: 'ESRCH' });
    },
  });
});

test('waits through EPERM while a signalled process group is exiting', async () => {
  let probes = 0;
  await stopProcessGroups([{ pid: 42 }], {
    platform: 'darwin',
    pollMs: 1,
    kill(_pid, signal) {
      if (signal !== 0) return;
      probes += 1;
      if (probes === 1) return;
      throw Object.assign(new Error('exiting'), { code: probes < 4 ? 'EPERM' : 'ESRCH' });
    },
  });
  assert.equal(probes, 4);
});
