#!/usr/bin/env bash
#
# Full-pipeline curl E2E test for the T3X HTTP API.
#
# Walks the documented agent workflow:
#   register → login → create project → create conversation
#     → extract (LLM) → show draft → commit
#     → create branch → switch → second extract → second commit
#     → diff frame → switch back → merge prepare → merge execute
#     → create leaf → generate leaf output
#     → cleanup (permanent delete project)
#
# Usage:
#   ./scripts/full-pipeline-curl-test.sh
#
# Requirements:
#   - API server running at $T3X_API_URL (default http://localhost:8000)
#   - jq + curl on PATH
#   - ANTHROPIC_API_KEY exported in the API server's environment (LLM extract/generate)
#
# Exit codes: 0 = all green, non-zero = first failure (set -e).

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────

T3X_API_URL="${T3X_API_URL:-http://localhost:8000/api}"
# Health endpoint is mounted at root (not under /api), derive root from base.
T3X_API_ROOT="${T3X_API_URL%/api}"
TIMESTAMP="$(date +%s)"
USERNAME="e2e_${TIMESTAMP}"
PASSWORD="e2e-test-password-123"
NAME="E2E Tester ${TIMESTAMP}"

API_KEY=""
PROJECT_ID=""
CONVERSATION_ID=""
DRAFT_ID=""
COMMIT_HASH_MAIN=""
DRAFT_ID_2=""
COMMIT_HASH_FEATURE=""
MERGE_COMMIT_HASH=""
LEAF_ID=""

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

C_RESET="\033[0m"
C_DIM="\033[2m"
C_GREEN="\033[32m"
C_RED="\033[31m"
C_YELLOW="\033[33m"
C_BLUE="\033[34m"
C_BOLD="\033[1m"

step() {
  printf "\n${C_BOLD}${C_BLUE}── %s ──${C_RESET}\n" "$1"
}

ok() {
  printf "  ${C_GREEN}✔${C_RESET} %s\n" "$1"
}

info() {
  printf "  ${C_DIM}%s${C_RESET}\n" "$1"
}

fail() {
  printf "  ${C_RED}✘ %s${C_RESET}\n" "$1" >&2
  exit 1
}

# req METHOD PATH [JSON_BODY]
# Echoes the response body. Exits if HTTP status is not 2xx.
req() {
  local method="$1"
  local path="$2"
  local body="${3:-}"

  local tmp_body
  tmp_body="$(mktemp)"
  local status

  local -a curl_args=(-sS -o "$tmp_body" -w "%{http_code}" -X "$method")
  if [[ -n "$API_KEY" ]]; then
    curl_args+=(-H "Authorization: Bearer $API_KEY")
  fi
  if [[ -n "$body" ]]; then
    curl_args+=(-H "Content-Type: application/json" -d "$body")
  fi
  curl_args+=("$T3X_API_URL$path")

  status="$(curl "${curl_args[@]}")"

  if [[ ! "$status" =~ ^2 ]]; then
    printf "${C_RED}HTTP %s on %s %s${C_RESET}\n" "$status" "$method" "$path" >&2
    cat "$tmp_body" >&2
    printf "\n" >&2
    rm -f "$tmp_body"
    exit 1
  fi

  cat "$tmp_body"
  rm -f "$tmp_body"
}

# Check that .success === true. Echoes .data.
unwrap() {
  local resp="$1"
  local ok_field
  ok_field="$(printf "%s" "$resp" | jq -r '.success // false')"
  if [[ "$ok_field" != "true" ]]; then
    printf "${C_RED}API returned success=false:${C_RESET}\n" >&2
    printf "%s\n" "$resp" | jq . >&2
    exit 1
  fi
  printf "%s" "$resp" | jq -c '.data'
}

cleanup() {
  if [[ -n "$PROJECT_ID" && -n "$API_KEY" ]]; then
    printf "\n${C_YELLOW}Cleaning up project %s…${C_RESET}\n" "$PROJECT_ID"
    curl -sS -X DELETE \
      -H "Authorization: Bearer $API_KEY" \
      "$T3X_API_URL/v1/projects/$PROJECT_ID?permanent=true" > /dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# ─────────────────────────────────────────────────────────────────────────────
# Pre-flight: API health
# ─────────────────────────────────────────────────────────────────────────────

step "0. Pre-flight: API health"
HEALTH="$(curl -sS "$T3X_API_ROOT/health")"
HEALTH_STATUS="$(printf "%s" "$HEALTH" | jq -r '.data.status // empty')"
if [[ "$HEALTH_STATUS" != "ok" ]]; then
  fail "API health check failed: $HEALTH"
fi
ok "API is healthy (root=$T3X_API_ROOT, base=$T3X_API_URL)"

# ─────────────────────────────────────────────────────────────────────────────
# 1. Register
# ─────────────────────────────────────────────────────────────────────────────

step "1. POST /v1/auth/register"
REGISTER_RESP="$(req POST /v1/auth/register "$(jq -nc \
  --arg u "$USERNAME" --arg p "$PASSWORD" --arg n "$NAME" \
  '{username: $u, password: $p, name: $n}')")"
REGISTER_DATA="$(unwrap "$REGISTER_RESP")"
API_KEY="$(printf "%s" "$REGISTER_DATA" | jq -r '.api_key')"
USER_ID="$(printf "%s" "$REGISTER_DATA" | jq -r '.id')"
[[ -n "$API_KEY" && "$API_KEY" != "null" ]] || fail "register: missing api_key"
ok "registered user $USERNAME (id=$USER_ID)"
info "api_key=${API_KEY:0:16}…"

# ─────────────────────────────────────────────────────────────────────────────
# 2. Create project
# ─────────────────────────────────────────────────────────────────────────────

step "2. POST /v1/projects"
PROJECT_RESP="$(req POST /v1/projects "$(jq -nc \
  --arg n "E2E Pipeline $TIMESTAMP" \
  '{name: $n, metadata: {source: "curl-e2e"}}')")"
PROJECT_DATA="$(unwrap "$PROJECT_RESP")"
PROJECT_ID="$(printf "%s" "$PROJECT_DATA" | jq -r '.project_id')"
[[ -n "$PROJECT_ID" && "$PROJECT_ID" != "null" ]] || fail "create project: missing project_id"
ok "created project $PROJECT_ID"

# ─────────────────────────────────────────────────────────────────────────────
# 3. Create conversation
# ─────────────────────────────────────────────────────────────────────────────

step "3. POST /v1/conversations"
CONV_RESP="$(req POST /v1/conversations "$(jq -nc \
  --arg pid "$PROJECT_ID" \
  '{project_id: $pid, title: "E2E pipeline conversation"}')")"
CONV_DATA="$(unwrap "$CONV_RESP")"
CONVERSATION_ID="$(printf "%s" "$CONV_DATA" | jq -r '.conversation_id')"
[[ -n "$CONVERSATION_ID" && "$CONVERSATION_ID" != "null" ]] || fail "create conversation: missing id"
ok "created conversation $CONVERSATION_ID"

# ─────────────────────────────────────────────────────────────────────────────
# 4. Add a turn (so the conversation has visible history)
# ─────────────────────────────────────────────────────────────────────────────

step "4. POST /v1/turns"
TURN_RESP="$(req POST /v1/turns "$(jq -nc \
  --arg pid "$PROJECT_ID" \
  --arg cid "$CONVERSATION_ID" \
  '{project_id: $pid, conversation_id: $cid, role: "user",
    content: "I want to ship a new feature called Green Tea Mode that lets users brew their own focus playlists from ambient soundscapes."}')")"
TURN_DATA="$(unwrap "$TURN_RESP")"
TURN_HASH="$(printf "%s" "$TURN_DATA" | jq -r '.turn_hash // empty')"
ok "created turn ${TURN_HASH:0:16}…"

# ─────────────────────────────────────────────────────────────────────────────
# 5. Extract semantic content (LLM call)
# ─────────────────────────────────────────────────────────────────────────────

step "5. POST /v1/extract  (LLM, may take ~10–30s)"
EXTRACT_BODY="$(jq -nc \
  --arg pid "$PROJECT_ID" \
  --arg cid "$CONVERSATION_ID" \
  '{project_id: $pid, conversation_id: $cid,
    text: "Green Tea Mode is an opt-in focus feature. Users can brew an ambient playlist by selecting one of three soundscapes: forest rain, distant ocean, or hilltop wind. The brew lasts exactly 25 minutes — the length of a pomodoro — and ends with a single chime. While brewing, all desktop notifications are muted. After the chime, a 5-minute cooldown begins; the user is gently prompted to stretch."}')"
EXTRACT_RESP="$(req POST /v1/extract "$EXTRACT_BODY")"
EXTRACT_DATA="$(unwrap "$EXTRACT_RESP")"
DRAFT_ID="$(printf "%s" "$EXTRACT_DATA" | jq -r '.draft_id')"
TREES_COUNT="$(printf "%s" "$EXTRACT_DATA" | jq -r '.trees | length')"
[[ -n "$DRAFT_ID" && "$DRAFT_ID" != "null" ]] || fail "extract: missing draft_id"
ok "extracted draft $DRAFT_ID ($TREES_COUNT trees)"

# ─────────────────────────────────────────────────────────────────────────────
# 6. Show the draft
# ─────────────────────────────────────────────────────────────────────────────

step "6. GET /v1/drafts/$DRAFT_ID"
DRAFT_RESP="$(req GET "/v1/drafts/$DRAFT_ID")"
DRAFT_DATA="$(unwrap "$DRAFT_RESP")"
DRAFT_NODE_COUNT="$(printf "%s" "$DRAFT_DATA" | jq -r '.nodes | length')"
DRAFT_REVISION="$(printf "%s" "$DRAFT_DATA" | jq -r '.revision')"
DRAFT_STATUS="$(printf "%s" "$DRAFT_DATA" | jq -r '.status')"
[[ "$DRAFT_NODE_COUNT" -gt 0 ]] || fail "draft has no nodes"
ok "draft has $DRAFT_NODE_COUNT nodes, revision=$DRAFT_REVISION, status=$DRAFT_STATUS"

# ─────────────────────────────────────────────────────────────────────────────
# 7. Commit the draft
# ─────────────────────────────────────────────────────────────────────────────

step "7. POST /v1/commit  (commit from draft)"
COMMIT_RESP="$(req POST /v1/commit "$(jq -nc \
  --arg pid "$PROJECT_ID" \
  --arg did "$DRAFT_ID" \
  '{project_id: $pid, draft_id: $did, message: "feat: initial Green Tea Mode spec"}')")"
COMMIT_DATA="$(unwrap "$COMMIT_RESP")"
COMMIT_HASH_MAIN="$(printf "%s" "$COMMIT_DATA" | jq -r '.commit_hash')"
COMMIT_TREES="$(printf "%s" "$COMMIT_DATA" | jq -r '.tree_count')"
COMMIT_BRANCH="$(printf "%s" "$COMMIT_DATA" | jq -r '.branch')"
[[ -n "$COMMIT_HASH_MAIN" && "$COMMIT_HASH_MAIN" != "null" ]] || fail "commit: missing commit_hash"
ok "committed ${COMMIT_HASH_MAIN:0:16}… ($COMMIT_TREES trees on $COMMIT_BRANCH)"

# ─────────────────────────────────────────────────────────────────────────────
# 8. Create a feature branch
# ─────────────────────────────────────────────────────────────────────────────

step "8. POST /v1/branches  (feature)"
BRANCH_RESP="$(req POST /v1/branches "$(jq -nc \
  --arg pid "$PROJECT_ID" \
  '{project_id: $pid, name: "feature", parent_branch: "main", description: "E2E feature branch"}')")"
unwrap "$BRANCH_RESP" > /dev/null
ok "created branch 'feature'"

# ─────────────────────────────────────────────────────────────────────────────
# 9. Switch to the feature branch
# ─────────────────────────────────────────────────────────────────────────────

step "9. POST /v1/branches/switch  (→ feature)"
SWITCH_RESP="$(req POST /v1/branches/switch "$(jq -nc \
  --arg pid "$PROJECT_ID" \
  '{project_id: $pid, branch_name: "feature"}')")"
unwrap "$SWITCH_RESP" > /dev/null
ok "switched to feature"

# ─────────────────────────────────────────────────────────────────────────────
# 10. Second extract (different content) on feature branch
# ─────────────────────────────────────────────────────────────────────────────

step "10. POST /v1/extract  (feature branch, second extract)"
EXTRACT_BODY_2="$(jq -nc \
  --arg pid "$PROJECT_ID" \
  --arg cid "$CONVERSATION_ID" \
  '{project_id: $pid, conversation_id: $cid,
    text: "Green Tea Mode pricing tier: free users get the forest rain soundscape only. Pro users ($7/mo) unlock all three soundscapes plus a custom-length brew (15, 25, or 50 minutes). Team users ($15/mo per seat) additionally get shared brew sessions where everyone on a team brews simultaneously and sees a co-presence indicator."}')"
EXTRACT_RESP_2="$(req POST /v1/extract "$EXTRACT_BODY_2")"
EXTRACT_DATA_2="$(unwrap "$EXTRACT_RESP_2")"
DRAFT_ID_2="$(printf "%s" "$EXTRACT_DATA_2" | jq -r '.draft_id')"
TREES_COUNT_2="$(printf "%s" "$EXTRACT_DATA_2" | jq -r '.trees | length')"
[[ -n "$DRAFT_ID_2" && "$DRAFT_ID_2" != "null" ]] || fail "second extract: missing draft_id"
ok "extracted draft $DRAFT_ID_2 ($TREES_COUNT_2 trees)"

# ─────────────────────────────────────────────────────────────────────────────
# 11. Commit second draft (parent = main commit, branch = feature)
# ─────────────────────────────────────────────────────────────────────────────

step "11. POST /v1/commit  (feature commit)"
COMMIT_RESP_2="$(req POST /v1/commit "$(jq -nc \
  --arg pid "$PROJECT_ID" \
  --arg did "$DRAFT_ID_2" \
  '{project_id: $pid, draft_id: $did, message: "feat: pricing tiers for Green Tea Mode", branch: "feature"}')")"
COMMIT_DATA_2="$(unwrap "$COMMIT_RESP_2")"
COMMIT_HASH_FEATURE="$(printf "%s" "$COMMIT_DATA_2" | jq -r '.commit_hash')"
[[ -n "$COMMIT_HASH_FEATURE" && "$COMMIT_HASH_FEATURE" != "null" ]] || fail "feature commit: missing hash"
ok "committed ${COMMIT_HASH_FEATURE:0:16}… on feature"

# ─────────────────────────────────────────────────────────────────────────────
# 12. Diff frame between main and feature commits
# ─────────────────────────────────────────────────────────────────────────────

step "12. POST /v1/diff/frame  (main ↔ feature)"
DIFF_RESP="$(req POST /v1/diff/frame "$(jq -nc \
  --arg base "$COMMIT_HASH_MAIN" \
  --arg target "$COMMIT_HASH_FEATURE" \
  '{base_commit_hash: $base, target_commit_hash: $target}')")"
DIFF_DATA="$(unwrap "$DIFF_RESP")"
DIFF_KEYS="$(printf "%s" "$DIFF_DATA" | jq -r 'keys | join(",")')"
ok "diff returned, top-level keys: $DIFF_KEYS"

# ─────────────────────────────────────────────────────────────────────────────
# 13. Switch back to main
# ─────────────────────────────────────────────────────────────────────────────

step "13. POST /v1/branches/switch  (→ main)"
SWITCH_RESP_2="$(req POST /v1/branches/switch "$(jq -nc \
  --arg pid "$PROJECT_ID" \
  '{project_id: $pid, branch_name: "main"}')")"
unwrap "$SWITCH_RESP_2" > /dev/null
ok "switched to main"

# ─────────────────────────────────────────────────────────────────────────────
# 14. Merge prepare (feature → main)
# ─────────────────────────────────────────────────────────────────────────────

step "14. POST /v1/merge/prepare  (feature → main)"
PREPARE_RESP="$(req POST /v1/merge/prepare "$(jq -nc \
  --arg src "$COMMIT_HASH_FEATURE" \
  --arg tgt "$COMMIT_HASH_MAIN" \
  '{source_hash: $src, target_hash: $tgt}')")"
PREPARED="$(unwrap "$PREPARE_RESP")"
AUTO_KEPT_COUNT="$(printf "%s" "$PREPARED" | jq -r '.autoKept | length')"
CONFLICT_COUNT="$(printf "%s" "$PREPARED" | jq -r '.conflicts | length')"
ONLY_SRC_COUNT="$(printf "%s" "$PREPARED" | jq -r '.onlyInSource | length')"
ONLY_TGT_COUNT="$(printf "%s" "$PREPARED" | jq -r '.onlyInTarget | length')"
ok "merge prepared: autoKept=$AUTO_KEPT_COUNT conflicts=$CONFLICT_COUNT onlyInSource=$ONLY_SRC_COUNT onlyInTarget=$ONLY_TGT_COUNT"

# Build decisions object matching FrameMergeDecisionSchema:
# - Every conflict → resolve to "source" (deterministic for E2E)
# - Keep every onlyInSource / onlyInTarget path (union merge, so merged commit
#   contains the feature description AND the pricing tiers — needed for step 16
#   leaf whose constraint requires "Green Tea Mode")
# - Keep both relation sets
DECISIONS="$(printf "%s" "$PREPARED" | jq -c '{
  conflictResolutions: (.conflicts | map({key: .path, value: "source"}) | from_entries),
  keepFromSource: .onlyInSource,
  keepFromTarget: .onlyInTarget,
  keepRelationsFromSource: true,
  keepRelationsFromTarget: true
}')"

# ─────────────────────────────────────────────────────────────────────────────
# 15. Merge execute
# ─────────────────────────────────────────────────────────────────────────────

step "15. POST /v1/merge/execute"
EXECUTE_BODY="$(jq -nc \
  --arg src "$COMMIT_HASH_FEATURE" \
  --arg tgt "$COMMIT_HASH_MAIN" \
  --argjson prepared "$PREPARED" \
  --argjson decisions "$DECISIONS" \
  '{source_hash: $src, target_hash: $tgt,
    prepared: $prepared, decisions: $decisions,
    message: "merge: pricing tiers into main", branch: "main"}')"
EXECUTE_RESP="$(req POST /v1/merge/execute "$EXECUTE_BODY")"
EXECUTE_DATA="$(unwrap "$EXECUTE_RESP")"
MERGE_COMMIT_HASH="$(printf "%s" "$EXECUTE_DATA" | jq -r '.hash')"
[[ -n "$MERGE_COMMIT_HASH" && "$MERGE_COMMIT_HASH" != "null" ]] || fail "merge execute: missing commit hash"
ok "merge commit ${MERGE_COMMIT_HASH:0:16}…"

# ─────────────────────────────────────────────────────────────────────────────
# 16. Create a leaf on the merge commit
# ─────────────────────────────────────────────────────────────────────────────

step "16. POST /v1/leaves"
LEAF_RESP="$(req POST /v1/leaves "$(jq -nc \
  --arg ch "$MERGE_COMMIT_HASH" \
  --arg pid "$PROJECT_ID" \
  '{commit_hash: $ch, project_id: $pid, type: "tweet",
    title: "Green Tea Mode launch tweet",
    constraints: [
      {type: "require", match_mode: "exact", value: "Green Tea Mode"},
      {type: "exclude", match_mode: "exact", value: "boring", reason: "tone"}
    ],
    config: {model: "claude-haiku-4-5-20251001", max_tokens: 600}}')")"
LEAF_DATA="$(unwrap "$LEAF_RESP")"
LEAF_ID="$(printf "%s" "$LEAF_DATA" | jq -r '.id // .leaf.id // .leaf_id')"
[[ -n "$LEAF_ID" && "$LEAF_ID" != "null" ]] || fail "create leaf: missing id"
ok "created leaf $LEAF_ID"

# ─────────────────────────────────────────────────────────────────────────────
# 17. Generate leaf output (LLM call)
# ─────────────────────────────────────────────────────────────────────────────

step "17. POST /v1/leaves/$LEAF_ID/generate  (LLM)"
GEN_RESP="$(req POST "/v1/leaves/$LEAF_ID/generate" "$(jq -nc \
  '{mode: "fast"}')")"
GEN_DATA="$(unwrap "$GEN_RESP")"
GEN_OUTPUT="$(printf "%s" "$GEN_DATA" | jq -r '.output // empty')"
GEN_LEN="${#GEN_OUTPUT}"
[[ "$GEN_LEN" -gt 0 ]] || fail "generate: empty output"
ok "generated leaf output ($GEN_LEN chars)"
info "preview: ${GEN_OUTPUT:0:100}…"

# ─────────────────────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────────────────────

printf "\n${C_GREEN}${C_BOLD}✔ Full pipeline curl E2E PASSED${C_RESET}\n"
printf "  user:           %s\n" "$USERNAME"
printf "  project:        %s\n" "$PROJECT_ID"
printf "  conversation:   %s\n" "$CONVERSATION_ID"
printf "  draft1:         %s\n" "$DRAFT_ID"
printf "  commit main:    %s\n" "$COMMIT_HASH_MAIN"
printf "  draft2:         %s\n" "$DRAFT_ID_2"
printf "  commit feature: %s\n" "$COMMIT_HASH_FEATURE"
printf "  merge commit:   %s\n" "$MERGE_COMMIT_HASH"
printf "  leaf:           %s\n" "$LEAF_ID"
