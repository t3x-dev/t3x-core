#!/usr/bin/env sh
# Local safety net before pushing.
# Runs lint/format + build by default. Tests are optional locally because
# PR CI runs them with pnpm + Turbo caching.
#
# Bypass (use sparingly): git push --no-verify
# Skip via env:            T3X_SKIP_PREPUSH=1 git push
# Include tests via env:   T3X_RUN_TESTS=1 git push

set -e

if [ "${T3X_SKIP_PREPUSH:-0}" = "1" ]; then
  echo "[pre-push] T3X_SKIP_PREPUSH=1 — skipping checks"
  exit 0
fi

echo "[pre-push] pnpm check"
pnpm check

echo "[pre-push] pnpm build"
pnpm build

if [ "${T3X_RUN_TESTS:-0}" = "1" ]; then
  echo "[pre-push] pnpm test"
  pnpm test
else
  echo "[pre-push] Tests not run. Use T3X_RUN_TESTS=1 git push to include them."
fi

echo "[pre-push] OK."
