#!/bin/bash
set -euo pipefail

# =============================================================================
# T3X Demo Seed Script
# Seeds the database with demo data for presentation/testing
# =============================================================================

API_BASE="${API_BASE:-http://localhost:8000}"
API_V1="${API_BASE}/api/v1"

# Bypass proxy for localhost
export no_proxy="${no_proxy:-}localhost,127.0.0.1"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "${BLUE}[>] $1${NC}"; }
ok()   { echo -e "${GREEN}[+] $1${NC}"; }
warn() { echo -e "${YELLOW}[!] $1${NC}"; }
fail() { echo -e "${RED}[x] $1${NC}"; exit 1; }

# Helper: POST with JSON and extract field via jq
post() {
  local url="$1"
  local data="$2"
  local response
  response=$(curl -sf -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "$data") || fail "POST $url failed"
  echo "$response"
}

patch() {
  local url="$1"
  local data="$2"
  local response
  response=$(curl -sf -X PATCH "$url" \
    -H "Content-Type: application/json" \
    -d "$data") || fail "PATCH $url failed"
  echo "$response"
}

# =============================================================================
# Health Check
# =============================================================================
step "Checking API health at ${API_BASE}..."
curl -sf "${API_BASE}/health" > /dev/null 2>&1 || fail "API is not running at ${API_BASE}. Start it with: pnpm dev:api"
ok "API is healthy"

echo ""
echo "============================================="
echo "  T3X Demo Seed — Creating Demo Data"
echo "============================================="
echo ""

# =============================================================================
# Project 1: Customer Support Knowledge (main demo project)
# =============================================================================
step "Creating Project 1: Customer Support Knowledge"

PROJECT1=$(post "${API_V1}/projects" '{"name": "Customer Support Knowledge", "metadata": {"description": "Consolidated knowledge from support team conversations — return policies, defective item handling, and shipping coverage"}}')
PROJECT1_ID=$(echo "$PROJECT1" | jq -r '.data.project_id')
ok "Project 1 created: ${PROJECT1_ID}"

# --- Conversation A: Return Policy Discussion ---
step "Creating Conversation A: Return Policy Discussion"

CONV_A=$(post "${API_V1}/conversations" "{
  \"project_id\": \"${PROJECT1_ID}\",
  \"title\": \"Return Policy Discussion\",
  \"position_x\": 100,
  \"position_y\": 100
}")
CONV_A_ID=$(echo "$CONV_A" | jq -r '.data.conversation_id')
ok "Conversation A created: ${CONV_A_ID}"

# Turn A1: user
step "  Adding turns to Conversation A..."
TURN_A1=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT1_ID}\",
  \"conversation_id\": \"${CONV_A_ID}\",
  \"role\": \"user\",
  \"content\": \"What is your return policy for electronics purchased online?\"
}")
TURN_A1_HASH=$(echo "$TURN_A1" | jq -r '.data.turn_hash')

# Turn A2: assistant
TURN_A2=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT1_ID}\",
  \"conversation_id\": \"${CONV_A_ID}\",
  \"role\": \"assistant\",
  \"content\": \"Our standard return policy allows returns within 30 days of purchase. Electronics must be in original packaging with all accessories. A receipt or order confirmation is required for processing.\"
}")
TURN_A2_HASH=$(echo "$TURN_A2" | jq -r '.data.turn_hash')

# Turn A3: user
TURN_A3=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT1_ID}\",
  \"conversation_id\": \"${CONV_A_ID}\",
  \"role\": \"user\",
  \"content\": \"What if the item is defective? Is the policy different?\"
}")
TURN_A3_HASH=$(echo "$TURN_A3" | jq -r '.data.turn_hash')

# Turn A4: assistant
TURN_A4=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT1_ID}\",
  \"conversation_id\": \"${CONV_A_ID}\",
  \"role\": \"assistant\",
  \"content\": \"For defective items, we extend the return window to 90 days. We also cover return shipping costs for confirmed defects. You can choose between a full refund or replacement.\"
}")
TURN_A4_HASH=$(echo "$TURN_A4" | jq -r '.data.turn_hash')
ok "  4 turns added to Conversation A"

# --- Conversation B: Warranty Terms Discussion ---
step "Creating Conversation B: Warranty Terms Discussion"

CONV_B=$(post "${API_V1}/conversations" "{
  \"project_id\": \"${PROJECT1_ID}\",
  \"title\": \"Warranty Terms Discussion\",
  \"position_x\": 100,
  \"position_y\": 400
}")
CONV_B_ID=$(echo "$CONV_B" | jq -r '.data.conversation_id')
ok "Conversation B created: ${CONV_B_ID}"

# Turn B1: user
step "  Adding turns to Conversation B..."
TURN_B1=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT1_ID}\",
  \"conversation_id\": \"${CONV_B_ID}\",
  \"role\": \"user\",
  \"content\": \"Can you explain the warranty coverage for premium electronics?\"
}")
TURN_B1_HASH=$(echo "$TURN_B1" | jq -r '.data.turn_hash')

# Turn B2: assistant
TURN_B2=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT1_ID}\",
  \"conversation_id\": \"${CONV_B_ID}\",
  \"role\": \"assistant\",
  \"content\": \"Premium electronics come with a 2-year manufacturer warranty. This covers hardware defects and manufacturing issues. Software issues are covered for the first 6 months only.\"
}")
TURN_B2_HASH=$(echo "$TURN_B2" | jq -r '.data.turn_hash')

# Turn B3: user + assistant combined (the spec shows 3 turns total, 2 user + 1 assistant response)
TURN_B3=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT1_ID}\",
  \"conversation_id\": \"${CONV_B_ID}\",
  \"role\": \"user\",
  \"content\": \"What about the return window for warranty claims?\"
}")
TURN_B3_HASH=$(echo "$TURN_B3" | jq -r '.data.turn_hash')

TURN_B4=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT1_ID}\",
  \"conversation_id\": \"${CONV_B_ID}\",
  \"role\": \"assistant\",
  \"content\": \"Warranty claims have a 60-day return window, different from standard returns. For warranty items, we always provide a replacement rather than a refund. Return shipping is covered under warranty.\"
}")
TURN_B4_HASH=$(echo "$TURN_B4" | jq -r '.data.turn_hash')
ok "  4 turns added to Conversation B"

# --- CommitV4 on main branch (from Conversation A) ---
# Sentences are designed with enough word overlap for merge conflict detection (Jaccard >= 0.3)
step "Creating commit on main branch from Conversation A"

COMMIT_MAIN=$(post "${API_V1}/commits-v4" "{
  \"author\": {\"type\": \"human\", \"name\": \"demo-user\"},
  \"sentences\": [
    {
      \"id\": \"s_main_1\",
      \"text\": \"The standard return policy allows customers to return items within 30 days of purchase\",
      \"confidence\": 0.95,
      \"source_ref\": {
        \"conversation_id\": \"${CONV_A_ID}\",
        \"turn_hash\": \"${TURN_A2_HASH}\",
        \"start_char\": 4,
        \"end_char\": 68
      }
    },
    {
      \"id\": \"s_main_2\",
      \"text\": \"Defective items have an extended return window of 90 days with full coverage\",
      \"confidence\": 0.92,
      \"source_ref\": {
        \"conversation_id\": \"${CONV_A_ID}\",
        \"turn_hash\": \"${TURN_A4_HASH}\",
        \"start_char\": 0,
        \"end_char\": 59
      }
    },
    {
      \"id\": \"s_main_3\",
      \"text\": \"Return shipping costs are covered for confirmed defects with refund or replacement options\",
      \"confidence\": 0.90,
      \"source_ref\": {
        \"conversation_id\": \"${CONV_A_ID}\",
        \"turn_hash\": \"${TURN_A4_HASH}\",
        \"start_char\": 61,
        \"end_char\": 145
      }
    }
  ],
  \"project_id\": \"${PROJECT1_ID}\",
  \"message\": \"Capture return policy: 30-day standard, 90-day for defects\",
  \"branch\": \"main\",
  \"source_refs\": [
    {\"type\": \"conversation\", \"id\": \"${CONV_A_ID}\", \"title\": \"Return Policy Discussion\"}
  ],
  \"position_x\": 400,
  \"position_y\": 100
}")
COMMIT_MAIN_HASH=$(echo "$COMMIT_MAIN" | jq -r '.data.hash')
ok "Main commit created: ${COMMIT_MAIN_HASH}"

# --- CommitV4 on feature/warranty branch (from Conversation B) ---
step "Creating commit on feature/warranty branch from Conversation B"

COMMIT_BRANCH=$(post "${API_V1}/commits-v4" "{
  \"author\": {\"type\": \"human\", \"name\": \"demo-user\"},
  \"sentences\": [
    {
      \"id\": \"s_branch_1\",
      \"text\": \"Premium electronics include a 2-year manufacturer warranty covering hardware defects\",
      \"confidence\": 0.93,
      \"source_ref\": {
        \"conversation_id\": \"${CONV_B_ID}\",
        \"turn_hash\": \"${TURN_B2_HASH}\",
        \"start_char\": 0,
        \"end_char\": 58
      }
    },
    {
      \"id\": \"s_branch_2\",
      \"text\": \"The warranty return policy allows customers to return items within 60 days of purchase\",
      \"confidence\": 0.91,
      \"source_ref\": {
        \"conversation_id\": \"${CONV_B_ID}\",
        \"turn_hash\": \"${TURN_B4_HASH}\",
        \"start_char\": 0,
        \"end_char\": 67
      }
    },
    {
      \"id\": \"s_branch_3\",
      \"text\": \"Return shipping costs are covered for warranty claims with replacement only, no refund\",
      \"confidence\": 0.89,
      \"source_ref\": {
        \"conversation_id\": \"${CONV_B_ID}\",
        \"turn_hash\": \"${TURN_B4_HASH}\",
        \"start_char\": 68,
        \"end_char\": 139
      }
    }
  ],
  \"project_id\": \"${PROJECT1_ID}\",
  \"message\": \"Document warranty terms: 2-year coverage, 60-day return window\",
  \"branch\": \"feature/warranty\",
  \"source_refs\": [
    {\"type\": \"conversation\", \"id\": \"${CONV_B_ID}\", \"title\": \"Warranty Terms Discussion\"}
  ],
  \"position_x\": 400,
  \"position_y\": 400
}")
COMMIT_BRANCH_HASH=$(echo "$COMMIT_BRANCH" | jq -r '.data.hash')
ok "Branch commit created: ${COMMIT_BRANCH_HASH}"

# --- Leaf on main commit ---
step "Creating leaf (email output) on main commit"

LEAF=$(post "${API_V1}/leaves" "{
  \"commit_hash\": \"${COMMIT_MAIN_HASH}\",
  \"type\": \"email\",
  \"title\": \"Customer Return Policy Summary\",
  \"project_id\": \"${PROJECT1_ID}\",
  \"constraints\": [
    {
      \"type\": \"require\",
      \"match_mode\": \"exact\",
      \"value\": \"30 days\",
      \"description\": \"Must mention the standard 30-day return window\",
      \"source_sentence_id\": \"s_main_1\"
    },
    {
      \"type\": \"require\",
      \"match_mode\": \"exact\",
      \"value\": \"defective\",
      \"description\": \"Must reference the defective item policy\",
      \"source_sentence_id\": \"s_main_2\"
    },
    {
      \"type\": \"exclude\",
      \"match_mode\": \"exact\",
      \"value\": \"competitor\",
      \"reason\": \"Must not reference competitors\"
    }
  ],
  \"config\": {
    \"prompt_template\": \"Write a professional email summarizing the return policy based on the following knowledge.\",
    \"model\": \"claude-sonnet-4-20250514\",
    \"max_tokens\": 1024
  }
}")
LEAF_ID=$(echo "$LEAF" | jq -r '.data.id')
ok "Leaf created: ${LEAF_ID}"

# Try to generate output if API key is available
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  step "Generating leaf output (ANTHROPIC_API_KEY found)..."
  GENERATE_RESULT=$(curl -sf -X POST "${API_V1}/leaves/${LEAF_ID}/generate" \
    -H "Content-Type: application/json" \
    -d '{}' 2>/dev/null) && {
    ok "Leaf output generated and validated"
  } || {
    warn "Generation failed - leaf created without output (generate manually)"
  }
else
  step "ANTHROPIC_API_KEY not set - writing mock output via PATCH..."
  MOCK_OUTPUT="Our return policy allows standard returns within 30 days of purchase. All items must be in original packaging with all accessories included. For defective items, we offer an extended 90-day return window with covered return shipping costs. You may choose between a full refund or a replacement for any confirmed defect."
  curl -sf -X PATCH "${API_V1}/leaves/${LEAF_ID}" \
    -H "Content-Type: application/json" \
    -d "{\"output\": \"${MOCK_OUTPUT}\"}" > /dev/null 2>&1 && {
    ok "Mock output written to leaf (fallback for demo without API key)"
  } || {
    warn "Failed to write mock output - leaf created without output (generate manually from UI)"
  }
fi

# --- Pin Conversation A ---
step "Pinning Conversation A to project"

PIN=$(post "${API_V1}/projects/${PROJECT1_ID}/pins" "{
  \"type\": \"conversation\",
  \"ref_id\": \"${CONV_A_ID}\"
}")
PIN_ID=$(echo "$PIN" | jq -r '.data.id')
ok "Pin created: ${PIN_ID}"

# --- Merge Draft ---
step "Creating merge draft (feature/warranty -> main)"

MERGE_DRAFT=$(post "${API_V1}/merge/drafts" "{
  \"project_id\": \"${PROJECT1_ID}\",
  \"source_hash\": \"${COMMIT_BRANCH_HASH}\",
  \"target_hash\": \"${COMMIT_MAIN_HASH}\",
  \"source_branch\": \"feature/warranty\",
  \"target_branch\": \"main\"
}")
DRAFT_ID=$(echo "$MERGE_DRAFT" | jq -r '.data.draftId')
SIMILAR_PAIRS=$(echo "$MERGE_DRAFT" | jq '.data.prepared.similarPairs | length')
ONLY_SOURCE=$(echo "$MERGE_DRAFT" | jq '.data.prepared.onlyInSource | length')
ONLY_TARGET=$(echo "$MERGE_DRAFT" | jq '.data.prepared.onlyInTarget | length')
ok "Merge draft created: ${DRAFT_ID}"
ok "  Similar pairs (conflicts): ${SIMILAR_PAIRS}"
ok "  Only in source: ${ONLY_SOURCE}"
ok "  Only in target: ${ONLY_TARGET}"

echo ""
ok "Project 1 complete!"
echo ""

# =============================================================================
# Project 2: Product FAQ Draft
# =============================================================================
step "Creating Project 2: Product FAQ Draft"

PROJECT2=$(post "${API_V1}/projects" '{"name": "Product FAQ Draft", "metadata": {"description": "Customer-facing FAQ content covering shipping, delivery, and order policies"}}')
PROJECT2_ID=$(echo "$PROJECT2" | jq -r '.data.project_id')
ok "Project 2 created: ${PROJECT2_ID}"

# Conversation: FAQ Review
CONV_FAQ=$(post "${API_V1}/conversations" "{
  \"project_id\": \"${PROJECT2_ID}\",
  \"title\": \"FAQ Review — Shipping\",
  \"position_x\": 100,
  \"position_y\": 100
}")
CONV_FAQ_ID=$(echo "$CONV_FAQ" | jq -r '.data.conversation_id')

step "  Adding turns to FAQ conversation..."
TURN_FAQ1=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT2_ID}\",
  \"conversation_id\": \"${CONV_FAQ_ID}\",
  \"role\": \"user\",
  \"content\": \"What are the standard shipping times for domestic orders?\"
}")
TURN_FAQ1_HASH=$(echo "$TURN_FAQ1" | jq -r '.data.turn_hash')

TURN_FAQ2=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT2_ID}\",
  \"conversation_id\": \"${CONV_FAQ_ID}\",
  \"role\": \"assistant\",
  \"content\": \"Standard domestic shipping takes 5 to 7 business days. Express shipping is available for 2-day delivery at an additional cost. Free shipping is offered on orders over 50 dollars.\"
}")
TURN_FAQ2_HASH=$(echo "$TURN_FAQ2" | jq -r '.data.turn_hash')
ok "  2 turns added"

# Commit on main: 2 sentences about shipping
step "Creating commit on main for FAQ project"

COMMIT_FAQ=$(post "${API_V1}/commits-v4" "{
  \"author\": {\"type\": \"human\", \"name\": \"demo-user\"},
  \"sentences\": [
    {
      \"id\": \"s_faq_1\",
      \"text\": \"Standard domestic shipping takes 5 to 7 business days\",
      \"confidence\": 0.94,
      \"source_ref\": {
        \"conversation_id\": \"${CONV_FAQ_ID}\",
        \"turn_hash\": \"${TURN_FAQ2_HASH}\",
        \"start_char\": 0,
        \"end_char\": 52
      }
    },
    {
      \"id\": \"s_faq_2\",
      \"text\": \"Free shipping is available on orders over 50 dollars\",
      \"confidence\": 0.91,
      \"source_ref\": {
        \"conversation_id\": \"${CONV_FAQ_ID}\",
        \"turn_hash\": \"${TURN_FAQ2_HASH}\",
        \"start_char\": 106,
        \"end_char\": 168
      }
    }
  ],
  \"project_id\": \"${PROJECT2_ID}\",
  \"message\": \"Shipping policy: 5-7 day standard delivery, free over \$50\",
  \"branch\": \"main\",
  \"source_refs\": [
    {\"type\": \"conversation\", \"id\": \"${CONV_FAQ_ID}\", \"title\": \"FAQ Review — Shipping\"}
  ],
  \"position_x\": 400,
  \"position_y\": 100
}")
COMMIT_FAQ_HASH=$(echo "$COMMIT_FAQ" | jq -r '.data.hash')
ok "FAQ commit created: ${COMMIT_FAQ_HASH}"

echo ""
ok "Project 2 complete!"
echo ""

# =============================================================================
# Project 3: Marketing Tone Guide
# =============================================================================
step "Creating Project 3: Marketing Tone Guide"

PROJECT3=$(post "${API_V1}/projects" '{"name": "Marketing Tone Guide", "metadata": {"description": "Internal style guide for customer-facing communications — voice, tone, and language standards"}}')
PROJECT3_ID=$(echo "$PROJECT3" | jq -r '.data.project_id')
ok "Project 3 created: ${PROJECT3_ID}"

# Conversation: Brand Voice Discussion
CONV_BRAND=$(post "${API_V1}/conversations" "{
  \"project_id\": \"${PROJECT3_ID}\",
  \"title\": \"Brand Voice Discussion\",
  \"position_x\": 100,
  \"position_y\": 100
}")
CONV_BRAND_ID=$(echo "$CONV_BRAND" | jq -r '.data.conversation_id')

step "  Adding turns to Brand Voice conversation..."
TURN_BRAND1=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT3_ID}\",
  \"conversation_id\": \"${CONV_BRAND_ID}\",
  \"role\": \"user\",
  \"content\": \"What tone should we use for our customer-facing communications?\"
}")
TURN_BRAND1_HASH=$(echo "$TURN_BRAND1" | jq -r '.data.turn_hash')

TURN_BRAND2=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT3_ID}\",
  \"conversation_id\": \"${CONV_BRAND_ID}\",
  \"role\": \"assistant\",
  \"content\": \"Our brand voice should be professional yet approachable. We aim for clarity over complexity, using plain language that any customer can understand. Avoid jargon and technical terms unless absolutely necessary.\"
}")
TURN_BRAND2_HASH=$(echo "$TURN_BRAND2" | jq -r '.data.turn_hash')
ok "  2 turns added"

# Commit on main: 2 sentences about brand guidelines
step "Creating commit on main for Tone Guide project"

COMMIT_BRAND=$(post "${API_V1}/commits-v4" "{
  \"author\": {\"type\": \"human\", \"name\": \"demo-user\"},
  \"sentences\": [
    {
      \"id\": \"s_brand_1\",
      \"text\": \"Brand voice should be professional yet approachable with clarity over complexity\",
      \"confidence\": 0.93,
      \"source_ref\": {
        \"conversation_id\": \"${CONV_BRAND_ID}\",
        \"turn_hash\": \"${TURN_BRAND2_HASH}\",
        \"start_char\": 4,
        \"end_char\": 62
      }
    },
    {
      \"id\": \"s_brand_2\",
      \"text\": \"Use plain language and avoid jargon unless absolutely necessary\",
      \"confidence\": 0.91,
      \"source_ref\": {
        \"conversation_id\": \"${CONV_BRAND_ID}\",
        \"turn_hash\": \"${TURN_BRAND2_HASH}\",
        \"start_char\": 97,
        \"end_char\": 177
      }
    }
  ],
  \"project_id\": \"${PROJECT3_ID}\",
  \"message\": \"Brand voice: professional, approachable, plain language first\",
  \"branch\": \"main\",
  \"source_refs\": [
    {\"type\": \"conversation\", \"id\": \"${CONV_BRAND_ID}\", \"title\": \"Brand Voice Discussion\"}
  ],
  \"position_x\": 400,
  \"position_y\": 100
}")
COMMIT_BRAND_HASH=$(echo "$COMMIT_BRAND" | jq -r '.data.hash')
ok "Brand commit created: ${COMMIT_BRAND_HASH}"

echo ""
ok "Project 3 complete!"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "============================================="
echo "  Seed Complete!"
echo "============================================="
echo ""
echo "  Projects:      3"
echo "  Conversations:  4"
echo "  Turns:          12"
echo "  Commits:        4 (3 on main, 1 on feature/warranty)"
echo "  Leaves:         1 (email output on main commit)"
echo "  Pins:           1 (Conversation A pinned)"
echo "  Merge Drafts:   1 (feature/warranty -> main)"
echo ""
echo "  Main demo project: ${PROJECT1_ID}"
echo "  Merge draft:       ${DRAFT_ID}"
echo ""
echo "  Open http://localhost:3000 to explore the demo data."
echo ""
