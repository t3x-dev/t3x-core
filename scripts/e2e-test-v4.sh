#!/usr/bin/env bash
#
# T3X V4 End-to-End Test Script
# Tests the complete V4 flow: Project -> Conversation -> CommitV4 -> Leaf -> Pin
#
set -euo pipefail

# ========================================
# Color Definitions
# ========================================
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ========================================
# Counters
# ========================================
PASSED=0
FAILED=0
SKIPPED=0

# ========================================
# Configuration
# ========================================
BASE_URL="${BASE_URL:-http://localhost:8000/api/v1}"

# Derive root URL for health check (strip /api/v1 suffix)
ROOT_URL="${BASE_URL%/api/v1}"
if [[ "$ROOT_URL" == "$BASE_URL" ]]; then
    # If BASE_URL doesn't end with /api/v1, assume it's the root
    ROOT_URL="${BASE_URL%/}"
fi

# Test data IDs (will be populated during tests)
PROJECT_ID=""
CONVERSATION_ID=""
COMMIT_HASH=""
LEAF_ID=""
PIN_ID=""
HAS_OUTPUT=false

# ========================================
# Helper Functions
# ========================================
pass() {
    echo -e "   ${GREEN}✓${NC} $1"
    ((PASSED++))
}

fail() {
    echo -e "   ${RED}✗${NC} $1"
    ((FAILED++))
    echo -e "${RED}Test failed. Aborting.${NC}"
    cleanup
    exit 1
}

skip() {
    echo -e "   ${YELLOW}○${NC} $1"
    ((SKIPPED++))
}

info() {
    echo -e "${BLUE}$1${NC}"
}

header() {
    echo -e "\n${BOLD}$1${NC}"
}

cleanup() {
    if [[ -n "$PROJECT_ID" ]]; then
        echo -e "\n${YELLOW}Cleaning up...${NC}"
        curl -s -X DELETE "${BASE_URL}/projects/${PROJECT_ID}" > /dev/null 2>&1 || true
        echo -e "${YELLOW}Cleanup complete.${NC}"
    fi
}

# Trap to ensure cleanup on exit
trap cleanup EXIT

# ========================================
# Print Header
# ========================================
echo -e "${BOLD}========================================"
echo -e " T3X V4 End-to-End Test"
echo -e "========================================${NC}"
echo -e "API: ${BLUE}${BASE_URL}${NC}"
echo ""

# ========================================
# Dependency Check
# ========================================
command -v curl >/dev/null 2>&1 || { echo -e "${RED}Error: curl is required but not installed.${NC}"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo -e "${RED}Error: jq is required but not installed.${NC}"; exit 1; }

# ========================================
# Test Cases
# ========================================

# --------------------------------------------------
# 1. Health Check
# --------------------------------------------------
header "1. Health Check"

HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "${ROOT_URL}/health" 2>/dev/null || echo -e "\n000")
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | sed '$d')
HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | tail -n1)

if [[ "$HEALTH_STATUS" == "200" ]]; then
    HEALTH_SUCCESS=$(echo "$HEALTH_BODY" | jq -r '.success // false')
    if [[ "$HEALTH_SUCCESS" == "true" ]]; then
        pass "API is healthy"
    else
        fail "API health check returned success=false"
    fi
else
    fail "API health check failed (HTTP $HEALTH_STATUS)"
fi

# --------------------------------------------------
# 2. Create Project
# --------------------------------------------------
header "2. Create Project"

PROJECT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/projects" \
    -H "Content-Type: application/json" \
    -d '{"name": "E2E Test Project V4"}' 2>/dev/null || echo -e "\n000")
PROJECT_BODY=$(echo "$PROJECT_RESPONSE" | sed '$d')
PROJECT_STATUS=$(echo "$PROJECT_RESPONSE" | tail -n1)

if [[ "$PROJECT_STATUS" == "201" ]]; then
    PROJECT_ID=$(echo "$PROJECT_BODY" | jq -r '.data.project_id // empty')
    if [[ -n "$PROJECT_ID" && "$PROJECT_ID" == proj_* ]]; then
        pass "Created project: $PROJECT_ID"
    else
        fail "Project response missing valid project_id (got: $PROJECT_ID)"
    fi
else
    fail "Create project failed (HTTP $PROJECT_STATUS)"
fi

# --------------------------------------------------
# 3. Create Conversation
# --------------------------------------------------
header "3. Create Conversation"

CONV_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/conversations" \
    -H "Content-Type: application/json" \
    -d "{\"project_id\": \"${PROJECT_ID}\", \"title\": \"E2E Test Conversation\"}" 2>/dev/null || echo -e "\n000")
CONV_BODY=$(echo "$CONV_RESPONSE" | sed '$d')
CONV_STATUS=$(echo "$CONV_RESPONSE" | tail -n1)

if [[ "$CONV_STATUS" == "201" ]]; then
    CONVERSATION_ID=$(echo "$CONV_BODY" | jq -r '.data.conversation_id // empty')
    if [[ -n "$CONVERSATION_ID" && "$CONVERSATION_ID" == conv_* ]]; then
        pass "Created conversation: $CONVERSATION_ID"
    else
        fail "Conversation response missing valid conversation_id (got: $CONVERSATION_ID)"
    fi
else
    fail "Create conversation failed (HTTP $CONV_STATUS)"
fi

# --------------------------------------------------
# 4. Create V4 Commit
# --------------------------------------------------
header "4. Create V4 Commit"

COMMIT_PAYLOAD=$(cat <<EOF
{
  "author": { "type": "human" },
  "sentences": [
    { "id": "s_test_1", "text": "User prefers dark mode interface", "confidence": 0.95 },
    { "id": "s_test_2", "text": "System should support bilingual Chinese and English", "confidence": 0.90 },
    { "id": "s_test_3", "text": "Data needs daily automatic backup", "confidence": 0.85 }
  ],
  "project_id": "${PROJECT_ID}",
  "message": "E2E test commit"
}
EOF
)

COMMIT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/commits-v4" \
    -H "Content-Type: application/json" \
    -d "$COMMIT_PAYLOAD" 2>/dev/null || echo -e "\n000")
COMMIT_BODY=$(echo "$COMMIT_RESPONSE" | sed '$d')
COMMIT_STATUS=$(echo "$COMMIT_RESPONSE" | tail -n1)

if [[ "$COMMIT_STATUS" == "201" ]]; then
    COMMIT_HASH=$(echo "$COMMIT_BODY" | jq -r '.data.hash // empty')
    COMMIT_SCHEMA=$(echo "$COMMIT_BODY" | jq -r '.data.schema // empty')
    SENTENCE_COUNT=$(echo "$COMMIT_BODY" | jq -r '.data.content.sentences | length')

    if [[ -n "$COMMIT_HASH" && "$COMMIT_HASH" == sha256:* ]]; then
        pass "Created commit: ${COMMIT_HASH:0:20}..."
    else
        fail "Commit response missing valid hash (got: $COMMIT_HASH)"
    fi

    if [[ "$COMMIT_SCHEMA" == "t3x/commit/v4" ]]; then
        pass "Commit has correct schema: $COMMIT_SCHEMA"
    else
        fail "Commit has wrong schema (expected: t3x/commit/v4, got: $COMMIT_SCHEMA)"
    fi

    if [[ "$SENTENCE_COUNT" == "3" ]]; then
        pass "Commit has $SENTENCE_COUNT sentences"
    else
        fail "Commit has wrong sentence count (expected: 3, got: $SENTENCE_COUNT)"
    fi
else
    fail "Create commit failed (HTTP $COMMIT_STATUS)"
fi

# --------------------------------------------------
# 5. Create Leaf
# --------------------------------------------------
header "5. Create Leaf"

LEAF_PAYLOAD=$(cat <<EOF
{
  "commit_hash": "${COMMIT_HASH}",
  "type": "tweet",
  "title": "E2E Test Leaf",
  "constraints": [
    {
      "type": "require",
      "match_mode": "exact",
      "value": "dark mode",
      "description": "Must mention dark mode"
    },
    {
      "type": "exclude",
      "match_mode": "exact",
      "value": "light mode",
      "reason": "Should not mention light mode"
    }
  ],
  "project_id": "${PROJECT_ID}"
}
EOF
)

LEAF_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/leaves" \
    -H "Content-Type: application/json" \
    -d "$LEAF_PAYLOAD" 2>/dev/null || echo -e "\n000")
LEAF_BODY=$(echo "$LEAF_RESPONSE" | sed '$d')
LEAF_STATUS=$(echo "$LEAF_RESPONSE" | tail -n1)

if [[ "$LEAF_STATUS" == "201" ]]; then
    LEAF_ID=$(echo "$LEAF_BODY" | jq -r '.data.id // empty')

    if [[ -n "$LEAF_ID" && "$LEAF_ID" == leaf_* ]]; then
        pass "Created leaf: $LEAF_ID"
    else
        fail "Leaf response missing valid id (got: $LEAF_ID)"
    fi

    # Verify all constraint IDs have cst_ prefix
    CONSTRAINT_IDS=$(echo "$LEAF_BODY" | jq -r '.data.constraints[].id // empty')
    ALL_CST_PREFIX=true
    for CID in $CONSTRAINT_IDS; do
        if [[ "$CID" != cst_* ]]; then
            ALL_CST_PREFIX=false
            break
        fi
    done

    if [[ "$ALL_CST_PREFIX" == "true" ]]; then
        pass "Constraint IDs have cst_ prefix"
    else
        fail "Some constraint IDs missing cst_ prefix"
    fi
else
    fail "Create leaf failed (HTTP $LEAF_STATUS)"
fi

# --------------------------------------------------
# 6. Generate Output
# --------------------------------------------------
header "6. Generate Output"

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    skip "Generate (skipped - ANTHROPIC_API_KEY not set)"
else
    GEN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/leaves/${LEAF_ID}/generate" \
        -H "Content-Type: application/json" \
        -d '{}' 2>/dev/null || echo -e "\n000")
    GEN_BODY=$(echo "$GEN_RESPONSE" | sed '$d')
    GEN_STATUS=$(echo "$GEN_RESPONSE" | tail -n1)

    if [[ "$GEN_STATUS" == "200" ]]; then
        GEN_OUTPUT=$(echo "$GEN_BODY" | jq -r '.data.output // empty')
        if [[ -n "$GEN_OUTPUT" ]]; then
            pass "Generated output (${#GEN_OUTPUT} chars)"
            HAS_OUTPUT=true
        else
            fail "Generate response missing output"
        fi
    else
        ERROR_CODE=$(echo "$GEN_BODY" | jq -r '.error.code // empty')
        if [[ "$ERROR_CODE" == "GENERATION_NOT_CONFIGURED" ]]; then
            skip "Generate (skipped - API key not configured on server)"
        else
            fail "Generate failed (HTTP $GEN_STATUS)"
        fi
    fi
fi

# --------------------------------------------------
# 7. Validate Constraints
# --------------------------------------------------
header "7. Validate Constraints"

if [[ "$HAS_OUTPUT" != "true" ]]; then
    skip "Validate (skipped - no output to validate)"
else
    VAL_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/leaves/${LEAF_ID}/validate" \
        -H "Content-Type: application/json" \
        -d '{"use_semantic": false}' 2>/dev/null || echo -e "\n000")
    VAL_BODY=$(echo "$VAL_RESPONSE" | sed '$d')
    VAL_STATUS=$(echo "$VAL_RESPONSE" | tail -n1)

    if [[ "$VAL_STATUS" == "200" ]]; then
        ASSERTIONS=$(echo "$VAL_BODY" | jq -r '.data.leaf.assertions // empty')
        if [[ -n "$ASSERTIONS" && "$ASSERTIONS" != "null" ]]; then
            pass "Validation completed with assertions"

            # Verify all assertion IDs have ast_ prefix
            ASSERTION_IDS=$(echo "$VAL_BODY" | jq -r '.data.leaf.assertions[].id // empty')
            ALL_AST_PREFIX=true
            for AID in $ASSERTION_IDS; do
                if [[ "$AID" != ast_* ]]; then
                    ALL_AST_PREFIX=false
                    break
                fi
            done

            if [[ "$ALL_AST_PREFIX" == "true" ]]; then
                pass "Assertion IDs have ast_ prefix"
            else
                fail "Some assertion IDs missing ast_ prefix"
            fi

            # Show validation summary
            PASSED_COUNT=$(echo "$VAL_BODY" | jq -r '.data.validation.passed_count // 0')
            FAILED_COUNT=$(echo "$VAL_BODY" | jq -r '.data.validation.failed_count // 0')
            pass "Validation results: $PASSED_COUNT passed, $FAILED_COUNT failed"
        else
            fail "Validate response missing assertions"
        fi
    else
        fail "Validate failed (HTTP $VAL_STATUS)"
    fi
fi

# --------------------------------------------------
# 8. Pin Conversation
# --------------------------------------------------
header "8. Pin Conversation"

PIN_PAYLOAD=$(cat <<EOF
{
  "type": "conversation",
  "ref_id": "${CONVERSATION_ID}"
}
EOF
)

PIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/projects/${PROJECT_ID}/pins" \
    -H "Content-Type: application/json" \
    -d "$PIN_PAYLOAD" 2>/dev/null || echo -e "\n000")
PIN_BODY=$(echo "$PIN_RESPONSE" | sed '$d')
PIN_STATUS=$(echo "$PIN_RESPONSE" | tail -n1)

if [[ "$PIN_STATUS" == "201" ]]; then
    PIN_ID=$(echo "$PIN_BODY" | jq -r '.data.id // empty')

    if [[ -n "$PIN_ID" && "$PIN_ID" == pin_* ]]; then
        pass "Pinned conversation: $PIN_ID"
        pass "Pin ID has pin_ prefix"
    else
        fail "Pin response missing valid id (got: $PIN_ID)"
    fi
else
    fail "Pin conversation failed (HTTP $PIN_STATUS)"
fi

# --------------------------------------------------
# 9. Duplicate Pin Handling
# --------------------------------------------------
header "9. Duplicate Pin Handling"

# Try to pin the same conversation again
DUP_PIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/projects/${PROJECT_ID}/pins" \
    -H "Content-Type: application/json" \
    -d "$PIN_PAYLOAD" 2>/dev/null || echo -e "\n000")
DUP_PIN_BODY=$(echo "$DUP_PIN_RESPONSE" | sed '$d')
DUP_PIN_STATUS=$(echo "$DUP_PIN_RESPONSE" | tail -n1)

if [[ "$DUP_PIN_STATUS" == "409" ]]; then
    pass "Duplicate pin returns 409"

    ERROR_CODE=$(echo "$DUP_PIN_BODY" | jq -r '.error.code // empty')
    if [[ "$ERROR_CODE" == "DUPLICATE_PIN" ]]; then
        pass "Error code is DUPLICATE_PIN"
    else
        fail "Wrong error code (expected: DUPLICATE_PIN, got: $ERROR_CODE)"
    fi
else
    fail "Duplicate pin should return 409 (got: HTTP $DUP_PIN_STATUS)"
fi

# --------------------------------------------------
# 10. Get Leaf by ID
# --------------------------------------------------
header "10. Get Leaf by ID"

GET_LEAF_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${BASE_URL}/leaves/${LEAF_ID}" 2>/dev/null || echo -e "\n000")
GET_LEAF_BODY=$(echo "$GET_LEAF_RESPONSE" | sed '$d')
GET_LEAF_STATUS=$(echo "$GET_LEAF_RESPONSE" | tail -n1)

if [[ "$GET_LEAF_STATUS" == "200" ]]; then
    GET_LEAF_ID=$(echo "$GET_LEAF_BODY" | jq -r '.data.id // empty')
    GET_LEAF_COMMIT=$(echo "$GET_LEAF_BODY" | jq -r '.data.commit_hash // empty')

    if [[ "$GET_LEAF_ID" == "$LEAF_ID" ]]; then
        pass "Retrieved leaf: $GET_LEAF_ID"
    else
        fail "Leaf ID mismatch (expected: $LEAF_ID, got: $GET_LEAF_ID)"
    fi

    if [[ "$GET_LEAF_COMMIT" == "$COMMIT_HASH" ]]; then
        pass "Leaf commit_hash matches"
    else
        fail "Leaf commit_hash mismatch"
    fi
else
    fail "Get leaf failed (HTTP $GET_LEAF_STATUS)"
fi

# --------------------------------------------------
# 11. List Leaves by Commit
# --------------------------------------------------
header "11. List Leaves by Commit"

# URL encode the commit hash (replace : with %3A)
ENCODED_HASH="${COMMIT_HASH//:/%3A}"

LIST_LEAVES_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${BASE_URL}/commits/${ENCODED_HASH}/leaves" 2>/dev/null || echo -e "\n000")
LIST_LEAVES_BODY=$(echo "$LIST_LEAVES_RESPONSE" | sed '$d')
LIST_LEAVES_STATUS=$(echo "$LIST_LEAVES_RESPONSE" | tail -n1)

if [[ "$LIST_LEAVES_STATUS" == "200" ]]; then
    LEAVES_COUNT=$(echo "$LIST_LEAVES_BODY" | jq -r '.data | length')

    if [[ "$LEAVES_COUNT" -ge 1 ]]; then
        pass "Listed $LEAVES_COUNT leaf(es) for commit"
    else
        fail "No leaves found for commit"
    fi

    # Check if our LEAF_ID is in the list
    FOUND_LEAF=$(echo "$LIST_LEAVES_BODY" | jq -r ".data[] | select(.id == \"$LEAF_ID\") | .id")
    if [[ "$FOUND_LEAF" == "$LEAF_ID" ]]; then
        pass "Created leaf found in list"
    else
        fail "Created leaf not found in list"
    fi
else
    fail "List leaves failed (HTTP $LIST_LEAVES_STATUS)"
fi

# --------------------------------------------------
# 12. Cleanup (Delete Project)
# --------------------------------------------------
header "12. Cleanup"

DELETE_RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE "${BASE_URL}/projects/${PROJECT_ID}" 2>/dev/null || echo -e "\n000")
DELETE_BODY=$(echo "$DELETE_RESPONSE" | sed '$d')
DELETE_STATUS=$(echo "$DELETE_RESPONSE" | tail -n1)

if [[ "$DELETE_STATUS" == "200" ]]; then
    DELETED=$(echo "$DELETE_BODY" | jq -r '.data.deleted // false')
    if [[ "$DELETED" == "true" ]]; then
        pass "Deleted project: $PROJECT_ID"
        # Clear PROJECT_ID to prevent duplicate cleanup in trap
        PROJECT_ID=""
    else
        fail "Delete response has deleted=false"
    fi
else
    fail "Delete project failed (HTTP $DELETE_STATUS)"
fi

# ========================================
# Summary
# ========================================
echo -e "\n${BOLD}========================================"
TOTAL=$((PASSED + FAILED + SKIPPED))
echo -e " Results: ${GREEN}${PASSED} passed${NC}, ${RED}${FAILED} failed${NC}, ${YELLOW}${SKIPPED} skipped${NC} / ${TOTAL} total"
echo -e "========================================${NC}"

# Exit with appropriate code
if [[ $FAILED -gt 0 ]]; then
    exit 1
fi
exit 0
