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

install_hook() {
  hook_name="$1"
  hook_src="tools/hooks/${hook_name}.sh"
  hook_dst="$GIT_DIR/$hook_name"

  if [ ! -f "$hook_src" ]; then
    echo "[install-hooks] $hook_src not found; skipping $hook_name"
    return
  fi

  cat > "$hook_dst" <<EOF
#!/usr/bin/env sh
exec sh tools/hooks/${hook_name}.sh "\$@"
EOF
  chmod +x "$hook_dst"

  echo "[install-hooks] $hook_name hook installed at $hook_dst"
}

install_hook pre-commit
install_hook pre-push
