import { spawn } from 'node:child_process';
import { applySourceDevDefaults } from './lib/sourceDevAuthDefaults.mjs';

const [target, command, ...args] = process.argv.slice(2);

if (!target || !command) {
  throw new Error('Usage: node tools/dev-package-runner.mjs <target> <command> [...args]');
}

const child = spawn(command, args, {
  env: applySourceDevDefaults(target, process.env),
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
