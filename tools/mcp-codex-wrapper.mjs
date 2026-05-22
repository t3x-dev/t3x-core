import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const logDir = '/tmp/t3x-mcp-debug';
const logPath = path.join(logDir, 'codex-wrapper.log');

mkdirSync(logDir, { recursive: true });

function log(line) {
  appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`);
}

const childEnv = { ...process.env };
const childArgs = ['apps/mcp/dist/index.js'];

log(
  JSON.stringify({
    event: 'wrapper_start',
    pid: process.pid,
    ppid: process.ppid,
    cwd: root,
    argv: process.argv,
    childArgs,
    env: {
      T3X_MCP_BACKEND: childEnv.T3X_MCP_BACKEND ?? null,
      T3X_API_URL: childEnv.T3X_API_URL ?? null,
      T3X_TOOLSETS: childEnv.T3X_TOOLSETS ?? null,
      T3X_API_KEY: childEnv.T3X_API_KEY ? '<set>' : '<unset>',
      HOME: childEnv.HOME ?? null,
      PATH: childEnv.PATH ?? null,
    },
  })
);

const child = spawn(process.execPath, childArgs, {
  cwd: root,
  env: childEnv,
  stdio: 'inherit',
});

child.on('spawn', () => {
  log(JSON.stringify({ event: 'child_spawn', pid: child.pid }));
});

child.on('exit', (code, signal) => {
  log(JSON.stringify({ event: 'child_exit', code, signal }));
});

child.on('error', (error) => {
  log(
    JSON.stringify({
      event: 'child_error',
      name: error.name,
      message: error.message,
      stack: error.stack,
    })
  );
});

process.on('uncaughtException', (error) => {
  log(
    JSON.stringify({
      event: 'wrapper_uncaught_exception',
      name: error.name,
      message: error.message,
      stack: error.stack,
    })
  );
  process.exitCode = 1;
});

process.on('unhandledRejection', (reason) => {
  log(
    JSON.stringify({
      event: 'wrapper_unhandled_rejection',
      reason: String(reason),
    })
  );
  process.exitCode = 1;
});

process.on('SIGINT', () => {
  log(JSON.stringify({ event: 'wrapper_sigint' }));
});

process.on('SIGTERM', () => {
  log(JSON.stringify({ event: 'wrapper_sigterm' }));
});
