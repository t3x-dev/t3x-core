#!/usr/bin/env node

import { startContextflowShell } from '../src/runtime/contextflowShell';

async function main(): Promise<void> {
  await startContextflowShell();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
