#!/bin/bash
#
# T3X End-to-End Test Script
#
# Tests the full flow: WebUI API → @t3x/storage → PGLite
#
# Usage:
#   ./scripts/e2e-test.sh              # Test against localhost:3000
#   BASE_URL=http://host:port ./scripts/e2e-test.sh
#

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
API="$BASE_URL/api/v1"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo " T3X End-to-End Test"
echo "========================================"
echo "API: $API"
echo ""

# Helper function
check() {
  if [ $? -eq 0 ]; then
    echo -e "   ${GREEN}✓${NC} $1"
  else
    echo -e "   ${RED}✗${NC} $1"
    exit 1
  fi
}

# 1. Health check
echo "1. Health check..."
HEALTH=$(curl -sf "$API/health" 2>/dev/null || echo '{}')
echo "$HEALTH" | jq -e '.status == "ok"' > /dev/null 2>&1
check "API is healthy"

# 2. Create project
echo "2. Creating project..."
PROJECT=$(curl -sf -X POST "$API/projects" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"E2E Test $(date +%s)\"}" 2>/dev/null)
PROJECT_ID=$(echo "$PROJECT" | jq -r '.data.project_id')
[ -n "$PROJECT_ID" ] && [ "$PROJECT_ID" != "null" ]
check "Created project: $PROJECT_ID"

# 3. Create conversation
echo "3. Creating conversation..."
CONV=$(curl -sf -X POST "$API/conversations" \
  -H "Content-Type: application/json" \
  -d "{\"project_id\": \"$PROJECT_ID\", \"title\": \"Test Conversation\"}" 2>/dev/null)
CONV_ID=$(echo "$CONV" | jq -r '.data.conversation_id')
[ -n "$CONV_ID" ] && [ "$CONV_ID" != "null" ]
check "Created conversation: $CONV_ID"

# 4. Add user turn
echo "4. Adding user turn..."
TURN1=$(curl -sf -X POST "$API/turns" \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": \"$PROJECT_ID\",
    \"conversation_id\": \"$CONV_ID\",
    \"role\": \"user\",
    \"content\": \"I want to build a login feature with email and password authentication.\"
  }" 2>/dev/null)
TURN1_HASH=$(echo "$TURN1" | jq -r '.data.turn_hash')
[ -n "$TURN1_HASH" ] && [ "$TURN1_HASH" != "null" ]
check "User turn: ${TURN1_HASH:0:20}..."

# 5. Add assistant turn
echo "5. Adding assistant turn..."
TURN2=$(curl -sf -X POST "$API/turns" \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": \"$PROJECT_ID\",
    \"conversation_id\": \"$CONV_ID\",
    \"role\": \"assistant\",
    \"content\": \"I will implement email login with password validation and remember-me option.\"
  }" 2>/dev/null)
TURN2_HASH=$(echo "$TURN2" | jq -r '.data.turn_hash')
[ -n "$TURN2_HASH" ] && [ "$TURN2_HASH" != "null" ]
check "Assistant turn: ${TURN2_HASH:0:20}..."

# 6. Verify turn chain
echo "6. Verifying turn chain..."
TURN2_DETAIL=$(curl -sf "$API/turns/$TURN2_HASH" 2>/dev/null)
PARENT=$(echo "$TURN2_DETAIL" | jq -r '.data.parent_turn_hash')
[ "$PARENT" = "$TURN1_HASH" ]
check "Turn chain: turn2.parent == turn1"

# 7. Verify turn has rings (semantic extraction)
echo "7. Checking semantic extraction..."
HAS_RINGS=$(echo "$TURN2_DETAIL" | jq -e '.data.rings != null' 2>/dev/null)
check "Rings extracted from turn"

# 8. Create commit
echo "8. Creating commit..."
COMMIT=$(curl -sf -X POST "$API/commits" \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": \"$PROJECT_ID\",
    \"branch\": \"main\",
    \"message\": \"E2E test: login feature discussion\",
    \"turn_window\": {
      \"start_turn_hash\": \"$TURN1_HASH\",
      \"end_turn_hash\": \"$TURN2_HASH\"
    }
  }" 2>/dev/null)
COMMIT_HASH=$(echo "$COMMIT" | jq -r '.data.commit_hash')
[ -n "$COMMIT_HASH" ] && [ "$COMMIT_HASH" != "null" ]
check "Created commit: ${COMMIT_HASH:0:20}..."

# 9. Verify commit has facet snapshot
echo "9. Checking commit facet snapshot..."
FACETS=$(echo "$COMMIT" | jq -r '.data.facet_snapshot')
[ "$FACETS" != "null" ]
check "Commit has facet snapshot"

# 10. Get status summary
echo "10. Checking status..."
STATUS=$(curl -sf "$API/status" 2>/dev/null)
PROJ_COUNT=$(echo "$STATUS" | jq '.data.projects_count')
TURN_COUNT=$(echo "$STATUS" | jq '.data.turns_count')
COMMIT_COUNT=$(echo "$STATUS" | jq '.data.commits_count')
echo -e "    ${YELLOW}Projects: $PROJ_COUNT | Turns: $TURN_COUNT | Commits: $COMMIT_COUNT${NC}"

# 11. Cleanup
echo "11. Cleanup..."
curl -sf -X DELETE "$API/projects/$PROJECT_ID" > /dev/null 2>&1
check "Deleted test project"

echo ""
echo -e "${GREEN}========================================"
echo " All tests passed!"
echo "========================================${NC}"
