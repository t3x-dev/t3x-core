#!/bin/bash

# ============================================================================
# Phase 6 End-to-End Validation Test Script
# ============================================================================
#
# Usage:
#   ./scripts/test-e2e.sh [prompt_version]
#
# Arguments:
#   prompt_version: v1 (default) or v2
#     - v1: Initial version prompt (room for improvement, expected lower score)
#     - v2: Optimized version prompt (tuned, expected higher score)
#
# Environment Variables:
#   API_URL: Engine API address (default: http://localhost:8000)
#   N8N_WEBHOOK_ID: n8n workflow webhook ID (default: weather-agent)
#
# Examples:
#   ./scripts/test-e2e.sh           # Use v1 prompt
#   ./scripts/test-e2e.sh v2        # Use v2 prompt
#   API_URL=http://api:8000 ./scripts/test-e2e.sh
#
# ============================================================================

set -e

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:8000}"
N8N_WEBHOOK_ID="${N8N_WEBHOOK_ID:-weather-agent}"
PROMPT_VERSION="${1:-v1}"

# ============================================================================
# Prompt Definitions
# ============================================================================

# V1 - Initial version (intentionally has room for improvement)
# Issues:
#   - "as comprehensive as possible" causes Agent to call unnecessary tools
#   - "detailed and professional" causes overly long responses, consuming more tokens
#   - No step limit, Agent may overthink
PROMPT_V1='You are a weather query assistant. Users will ask weather-related questions.

Please answer the user questions as comprehensively as possible. You can use these tools:
- WeatherTool: Query weather
- SearchTool: Web search
- CalculatorTool: Mathematical calculations

Please ensure your answers are detailed and professional.'

# V2 - Optimized version (after tuning)
# Improvements:
#   - "answer concisely" reduces token consumption
#   - "prefer WeatherTool" avoids calling unnecessary tools
#   - "under 100 words" limits response length
PROMPT_V2='You are a weather query assistant.

Please answer user weather questions concisely. Prefer using WeatherTool to query weather, only use other tools when clearly necessary.

Keep responses under 100 words.'

# Select prompt
if [ "$PROMPT_VERSION" = "v2" ]; then
    PROMPT="$PROMPT_V2"
    echo -e "${BLUE}Using V2 Optimized Prompt${NC}"
else
    PROMPT="$PROMPT_V1"
    echo -e "${YELLOW}Using V1 Initial Prompt (room for improvement)${NC}"
fi

# ============================================================================
# Test Input
# ============================================================================

TEST_QUERY="What's the weather like in Beijing today?"

# ============================================================================
# Helper Functions
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================================================
# Step 1: Trigger Run
# ============================================================================

echo ""
echo "============================================================================"
echo " Phase 6.3 End-to-End Validation"
echo "============================================================================"
echo ""
log_info "API URL: $API_URL"
log_info "n8n Webhook ID: $N8N_WEBHOOK_ID"
log_info "Prompt Version: $PROMPT_VERSION"
log_info "Test Input: $TEST_QUERY"
echo ""

log_info "Step 1: Trigger run POST /v1/runs"

# Build request body (use jq to handle JSON escaping)
REQUEST_BODY=$(cat <<EOF
{
  "leaf": {
    "id": "leaf_weather_${PROMPT_VERSION}",
    "type": "eval",
    "content": $(echo "$PROMPT" | jq -Rs .),
    "rules_ref": "weather-agent-eval"
  },
  "inputs": {
    "query": "$TEST_QUERY"
  },
  "workflow": {
    "type": "n8n",
    "webhook_id": "$N8N_WEBHOOK_ID"
  }
}
EOF
)

# Print request body (for debugging)
echo ""
echo -e "${BLUE}Request Body:${NC}"
echo "$REQUEST_BODY" | jq .
echo ""

# Send request
RESPONSE=$(curl -s -X POST "$API_URL/api/v1/runs" \
    -H "Content-Type: application/json" \
    -d "$REQUEST_BODY")

# Check response
if echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
    RUN_ID=$(echo "$RESPONSE" | jq -r '.data.run_id')
    RUNNER_RUN_ID=$(echo "$RESPONSE" | jq -r '.data.runner_run_id')
    STATUS=$(echo "$RESPONSE" | jq -r '.data.status')

    log_success "Run created"
    echo "  run_id: $RUN_ID"
    echo "  runner_run_id: $RUNNER_RUN_ID"
    echo "  status: $STATUS"
else
    log_error "Failed to create run"
    echo "$RESPONSE" | jq .
    exit 1
fi

# ============================================================================
# Step 2: Poll for Completion
# ============================================================================

echo ""
log_info "Step 2: Waiting for run to complete..."

MAX_WAIT=120  # Maximum wait time (seconds)
POLL_INTERVAL=3  # Poll interval (seconds)
ELAPSED=0

while [ $ELAPSED -lt $MAX_WAIT ]; do
    RESPONSE=$(curl -s "$API_URL/api/v1/runs/$RUN_ID")
    STATUS=$(echo "$RESPONSE" | jq -r '.data.status')

    echo -ne "\r  Status: $STATUS (waited ${ELAPSED}s)    "

    if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
        echo ""
        break
    fi

    sleep $POLL_INTERVAL
    ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo ""
    log_error "Wait timeout (${MAX_WAIT}s)"
    exit 1
fi

# ============================================================================
# Step 3: Display Results
# ============================================================================

echo ""
log_info "Step 3: View results"
echo ""

# Get complete run record
RESPONSE=$(curl -s "$API_URL/api/v1/runs/$RUN_ID")

# Basic info
echo -e "${BLUE}=== Basic Info ===${NC}"
echo "  run_id: $(echo "$RESPONSE" | jq -r '.data.runId')"
echo "  status: $(echo "$RESPONSE" | jq -r '.data.status')"
echo ""

# Evaluation result
RESULT_JSON=$(echo "$RESPONSE" | jq -r '.data.resultJson // empty')

if [ -n "$RESULT_JSON" ]; then
    echo -e "${BLUE}=== Evaluation Result ===${NC}"

    # Parse resultJson
    EVAL_RESULT=$(echo "$RESULT_JSON" | jq '.run_report.eval_result // .eval_result // empty')

    if [ -n "$EVAL_RESULT" ] && [ "$EVAL_RESULT" != "null" ]; then
        PASSED=$(echo "$EVAL_RESULT" | jq -r '.passed')
        SCORE=$(echo "$EVAL_RESULT" | jq -r '.score')

        if [ "$PASSED" = "true" ]; then
            echo -e "  passed: ${GREEN}true${NC}"
        else
            echo -e "  passed: ${RED}false${NC}"
        fi

        echo "  score: $SCORE"
        echo ""

        # Dimension scores
        echo -e "${BLUE}=== Dimension Scores ===${NC}"
        echo "$EVAL_RESULT" | jq -r '.dimension_scores // empty' | jq .
        echo ""

        # Violations
        VIOLATIONS=$(echo "$EVAL_RESULT" | jq -r '.violations // empty')
        VIOLATION_COUNT=$(echo "$VIOLATIONS" | jq 'length')

        if [ "$VIOLATION_COUNT" -gt 0 ]; then
            echo -e "${YELLOW}=== Violations ($VIOLATION_COUNT) ===${NC}"
            echo "$VIOLATIONS" | jq -r '.[] | "  - [\(.severity)] \(.rule_id): \(.message)"'
            echo ""
        fi
    else
        echo "  (No evaluation result)"
    fi

    # Assertions
    ASSERTIONS=$(echo "$RESULT_JSON" | jq '.assertions // empty')
    if [ -n "$ASSERTIONS" ] && [ "$ASSERTIONS" != "null" ] && [ "$(echo "$ASSERTIONS" | jq 'length')" -gt 0 ]; then
        echo -e "${BLUE}=== LLM Assertions ===${NC}"
        echo "$ASSERTIONS" | jq .
        echo ""
    fi
else
    log_warn "No resultJson data"
fi

# Trace Summary
TRACE_SUMMARY=$(echo "$RESPONSE" | jq -r '.data.traceSummaryJson // empty')

if [ -n "$TRACE_SUMMARY" ]; then
    echo -e "${BLUE}=== Trace Summary ===${NC}"
    echo "$TRACE_SUMMARY" | jq .
    echo ""
fi

# ============================================================================
# Summary
# ============================================================================

echo "============================================================================"
if [ "$STATUS" = "completed" ]; then
    PASSED=$(echo "$RESULT_JSON" | jq -r '.run_report.eval_result.passed // .eval_result.passed // "unknown"')
    if [ "$PASSED" = "true" ]; then
        log_success "Run completed, evaluation passed!"
    else
        log_warn "Run completed, evaluation failed"
    fi
else
    log_error "Run failed"
fi
echo "============================================================================"
echo ""

# Hint for next step
if [ "$PROMPT_VERSION" = "v1" ]; then
    echo -e "${BLUE}Hint:${NC} You can try the optimized prompt version:"
    echo "  ./scripts/test-e2e.sh v2"
    echo ""
fi
