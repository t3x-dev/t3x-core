#!/usr/bin/env sh
# Local safety net before committing.
# Fast by default: formatting/lint check + proposal-flow regression tests.
# Runs the WebUI build only when staged files can affect the WebUI build.
#
# Bypass (use sparingly): git commit --no-verify
# Skip via env:            T3X_SKIP_PRECOMMIT=1 git commit
# Force WebUI build:       T3X_PRECOMMIT_BUILD=1 git commit
# Skip WebUI build:        T3X_PRECOMMIT_BUILD=0 git commit

set -eu

if [ "${T3X_SKIP_PRECOMMIT:-0}" = "1" ]; then
  echo "[pre-commit] T3X_SKIP_PRECOMMIT=1 - skipping checks"
  exit 0
fi

STAGED_FILE_LIST=$(mktemp "${TMPDIR:-/tmp}/t3x-precommit-staged.XXXXXX")
trap 'rm -f "$STAGED_FILE_LIST"' EXIT

git diff --cached --name-only --diff-filter=ACMR -z > "$STAGED_FILE_LIST"

if [ ! -s "$STAGED_FILE_LIST" ]; then
  echo "[pre-commit] No staged files; skipping checks."
  exit 0
fi

echo "[pre-commit] Checking staged files for merge conflict markers"
xargs -0 sh tools/hooks/pre-commit-check-merge-conflict.sh < "$STAGED_FILE_LIST"

echo "[pre-commit] pnpm check"
pnpm check

echo "[pre-commit] Focused WebUI proposal/apply tests"
pnpm --filter t3x-webui exec vitest run \
  src/__tests__/stores/workspaceStore-proposal-boundary.test.ts \
  src/__tests__/stores/workspaceStore.test.ts \
  src/__tests__/hooks/useExtraction.test.ts \
  src/__tests__/hooks/useScriptExecution.test.ts

needs_webui_build() {
  tr '\0' '\n' < "$STAGED_FILE_LIST" | grep -E \
    '^(apps/web/|packages/core/|packages/storage/|packages/api-client/|package\.json$|pnpm-lock\.yaml$|turbo\.json$|biome\.json$)' \
    >/dev/null 2>&1
}

if [ "${T3X_PRECOMMIT_BUILD:-auto}" = "1" ]; then
  echo "[pre-commit] T3X_PRECOMMIT_BUILD=1 - running WebUI build"
  pnpm build:webui
elif [ "${T3X_PRECOMMIT_BUILD:-auto}" = "0" ]; then
  echo "[pre-commit] T3X_PRECOMMIT_BUILD=0 - skipping WebUI build"
elif needs_webui_build; then
  echo "[pre-commit] WebUI-impacting staged files detected - running pnpm build:webui"
  pnpm build:webui
else
  echo "[pre-commit] No WebUI-impacting staged files; skipping WebUI build"
fi

echo "[pre-commit] OK."
