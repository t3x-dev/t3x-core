#!/usr/bin/env node

import { startT3xShell } from '../src/runtime/t3xShell';

async function main(): Promise<void> {
  await startT3xShell();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
