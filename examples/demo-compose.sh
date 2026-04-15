#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/apps/cli/dist/index.js"
INPUT="$ROOT/examples/demo-compose-transcript.yaml"

if [[ ! -f "$CLI" ]]; then
  echo "Building CLI..."
  (cd "$ROOT" && pnpm build:core && pnpm --filter @t3x-dev/cli build)
fi

OUT_DIR="$(mktemp -d -t t3x-compose-demo-XXXX)"
OUT="$OUT_DIR/docker-compose.yml"

echo "==> Input tree ($INPUT):"
cat "$INPUT"
echo

echo "==> Running: t3x compose preview --no-verify"
node "$CLI" compose preview "$INPUT" -o "$OUT" --no-verify
echo

echo "==> Emitted file at $OUT:"
cat "$OUT"
echo

echo "==> To run the stack (Docker required):"
echo "    docker compose -f $OUT up -d"
