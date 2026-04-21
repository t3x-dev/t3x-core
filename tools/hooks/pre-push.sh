#!/usr/bin/env sh
# Local safety net before pushing — CI no longer runs on PRs.
# Runs lint/format + typecheck + build. Tests are too slow for every push;
# run `pnpm test` yourself before opening a release PR.
#
# Bypass (use sparingly): git push --no-verify
# Skip via env:            T3X_SKIP_PREPUSH=1 git push

set -e

if [ "${T3X_SKIP_PREPUSH:-0}" = "1" ]; then
  echo "[pre-push] T3X_SKIP_PREPUSH=1 — skipping checks"
  exit 0
fi

echo "[pre-push] pnpm check"
pnpm check

echo "[pre-push] pnpm build"
pnpm build

echo "[pre-push] OK. (Tests not run — use \`pnpm test\` before release PRs.)"
