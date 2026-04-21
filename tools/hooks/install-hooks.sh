#!/usr/bin/env sh
# Installs repo git hooks into .git/hooks.
# Runs automatically via `pnpm install` (see root package.json `prepare`).
# Safe to re-run; idempotent.

set -e

# Skip in CI and outside git worktrees.
if [ -n "${CI:-}" ]; then
  exit 0
fi

if [ ! -d .git ] && [ ! -f .git ]; then
  exit 0
fi

GIT_DIR=$(git rev-parse --git-path hooks 2>/dev/null || echo ".git/hooks")
mkdir -p "$GIT_DIR"

HOOK_SRC="tools/hooks/pre-push.sh"
HOOK_DST="$GIT_DIR/pre-push"

if [ ! -f "$HOOK_SRC" ]; then
  echo "[install-hooks] $HOOK_SRC not found; skipping"
  exit 0
fi

cat > "$HOOK_DST" <<'EOF'
#!/usr/bin/env sh
exec sh tools/hooks/pre-push.sh "$@"
EOF
chmod +x "$HOOK_DST"

echo "[install-hooks] pre-push hook installed at $HOOK_DST"
