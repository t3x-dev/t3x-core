#!/usr/bin/env bash
# apps/web/scripts/check-v2-boundaries.sh
#
# Enforce apps/web v2 layer boundaries. Exits non-zero if any counter
# exceeds its max. Intended for both local use
# (`pnpm --filter t3x-webui check:boundaries`) and CI.
#
# Reference: v2 architecture doc (docs/hlq_docs/frontend-architecture-v2-zh.md)
# and the Phase F cleanup plan.
#
# Counted offences (all in apps/web/src, excluding __tests__):
#   - `from '@/queries'` in store/             (store → queries)
#   - `from '@/queries'` in components/        (components → queries)
#   - `from '@/infrastructure'` in components/ (components → infrastructure)
#   - direct `fetch(` in components/           (components fetch())
#   - direct `fetch(` in store/                (store fetch())
#
# All limits are 0 (post-Phase-F). Biome additionally enforces most of
# these at the import-group level; this script is the authoritative
# counter surface the plan tracks.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "${REPO_ROOT}" ]; then
  echo "error: not inside a git repo" >&2
  exit 2
fi
cd "${REPO_ROOT}/apps/web"

count_from()  { grep -rn  "$1" "$2" 2>/dev/null | grep -v __tests__ | wc -l | tr -d ' '; }
count_fetch() { grep -rnE '(^|[^A-Za-z0-9_])fetch\(' "$1" 2>/dev/null | grep -v __tests__ | wc -l | tr -d ' '; }

check() {
  local label="$1"; local actual="$2"; local max="$3"
  if [ "$actual" -gt "$max" ]; then
    printf "FAIL  %-35s  %d / %d\n" "$label" "$actual" "$max"
    return 1
  fi
  printf "OK    %-35s  %d / %d\n" "$label" "$actual" "$max"
  return 0
}

FAIL=0
check "store -> queries"             "$(count_from  "from '@/queries"        src/store)"      0 || FAIL=1
check "components -> queries"        "$(count_from  "from '@/queries"        src/components)" 0 || FAIL=1
check "components -> infrastructure" "$(count_from  "from '@/infrastructure" src/components)" 0 || FAIL=1
check "components direct fetch()"    "$(count_fetch                          src/components)" 0 || FAIL=1
check "store direct fetch()"         "$(count_fetch                          src/store)"      0 || FAIL=1

exit $FAIL
