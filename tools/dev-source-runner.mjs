import { spawnSync } from 'node:child_process';
import { applySourceDevAuthDefault, getDevTargetFilter } from './lib/sourceDevAuthDefaults.mjs';

const target = process.argv[2];
const filter = getDevTargetFilter(target);

const result = spawnSync('pnpm', ['turbo', 'run', 'dev', `--filter=${filter}`], {
  env: applySourceDevAuthDefault(process.env),
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
