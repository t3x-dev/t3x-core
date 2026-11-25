import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function diagnostic(event, fields = {}) {
  console.error(
    JSON.stringify({ component: 'mcp', timestamp: new Date().toISOString(), event, ...fields })
  );
}

const child = spawn(process.execPath, ['apps/mcp/dist/index.js'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  stdio: 'inherit',
});

child.once('error', () => diagnostic('process.launch_failed'));
child.once('close', (code, signal) => {
  diagnostic('process.exited', { exit_code: code, signal });
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
