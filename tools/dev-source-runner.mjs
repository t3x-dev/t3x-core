import { spawn } from 'node:child_process';
import { applySourceDevAuthDefault, getDevTargetFilter } from './lib/sourceDevAuthDefaults.mjs';

const target = process.argv[2];
const filter = getDevTargetFilter(target);
const extraArgs = process.argv.slice(3);

const child = spawn('pnpm', ['turbo', 'run', 'dev', `--filter=${filter}`, ...extraArgs], {
  env: applySourceDevAuthDefault(process.env),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('error', (error) => {
  throw error;
});

child.on('close', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
