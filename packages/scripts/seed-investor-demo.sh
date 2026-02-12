#!/bin/bash
set -euo pipefail

# =============================================================================
# T3X Investor Demo Seed Script
#
# Creates multi-version demo data to showcase "Git for Meaning" capabilities:
# - Version history with diff
# - Branch and merge
# - Constraint validation
#
# Story: E-commerce return policy evolves through 3 versions
#   v1 (main)           : Standard 30-day policy
#   v2 (feature/double11): Promotion 60-day + accidentally mentions competitor
#   v3 (main)           : Back to 30-day, competitor content removed
# =============================================================================

# Dependency checks
command -v curl >/dev/null 2>&1 || { echo "[x] curl is required but not installed"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "[x] jq is required but not installed"; exit 1; }

API_BASE="${API_BASE:-http://localhost:8000}"
API_V1="${API_BASE}/api/v1"

# Bypass proxy for localhost
export no_proxy="${no_proxy:-}localhost,127.0.0.1"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

step() { echo -e "${BLUE}[>] $1${NC}"; }
ok()   { echo -e "${GREEN}[+] $1${NC}"; }
warn() { echo -e "${YELLOW}[!] $1${NC}"; }
fail() { echo -e "${RED}[x] $1${NC}"; exit 1; }
info() { echo -e "${CYAN}    $1${NC}"; }

# Helper: extract a field from JSON, fail if empty
extract() {
  local json="$1" field="$2"
  local val
  val=$(echo "$json" | jq -r "$field // empty")
  [ -n "$val" ] || fail "Failed to extract $field from API response"
  echo "$val"
}

# Helper: POST with JSON
post() {
  local url="$1"
  local data="$2"
  local response
  response=$(curl -sf -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "$data") || fail "POST $url failed"
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
echo "  T3X Investor Demo - Multi-Version Data"
echo "============================================="
echo ""
echo "  Story: E-commerce return policy evolution"
echo "  v1: Standard 30-day policy (main)"
echo "  v2: Promotion 60-day + competitor mention (feature/double11)"
echo "  v3: Back to 30-day, fixed (main)"
echo ""

# =============================================================================
# Create Project
# =============================================================================
step "Creating project: Return Policy Knowledge Base"

PROJECT=$(post "${API_V1}/projects" '{
  "name": "Return Policy Knowledge Base",
  "metadata": {
    "description": "E-commerce return policy knowledge - demonstrates version control, diff, and constraint validation",
    "demo_type": "investor"
  }
}')
PROJECT_ID=$(extract "$PROJECT" '.data.project_id')
ok "Project created: ${PROJECT_ID}"

# =============================================================================
# Conversation 1: Initial Policy Discussion (source for v1)
# =============================================================================
step "Creating Conversation 1: Initial Policy Discussion"

CONV1=$(post "${API_V1}/conversations" "{
  \"project_id\": \"${PROJECT_ID}\",
  \"title\": \"Initial Return Policy Discussion\",
  \"position_x\": 100,
  \"position_y\": 100
}")
CONV1_ID=$(extract "$CONV1" '.data.conversation_id')
ok "Conversation 1 created: ${CONV1_ID}"

step "  Adding turns..."

# Turn 1.1: user asks about return policy
TURN1_1=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT_ID}\",
  \"conversation_id\": \"${CONV1_ID}\",
  \"role\": \"user\",
  \"content\": \"What is our standard return policy for online purchases?\"
}")
TURN1_1_HASH=$(extract "$TURN1_1" '.data.turn_hash')

# Turn 1.2: assistant explains standard policy
TURN1_2=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT_ID}\",
  \"conversation_id\": \"${CONV1_ID}\",
  \"role\": \"assistant\",
  \"content\": \"Our standard return policy allows customers to return items within 30 days of purchase. Items must be in original packaging with all accessories. A receipt or order confirmation is required for processing returns.\"
}")
TURN1_2_HASH=$(extract "$TURN1_2" '.data.turn_hash')

# Turn 1.3: user asks about defects
TURN1_3=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT_ID}\",
  \"conversation_id\": \"${CONV1_ID}\",
  \"role\": \"user\",
  \"content\": \"What about defective items? Is there a different policy?\"
}")
TURN1_3_HASH=$(extract "$TURN1_3" '.data.turn_hash')

# Turn 1.4: assistant explains defect policy
TURN1_4=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT_ID}\",
  \"conversation_id\": \"${CONV1_ID}\",
  \"role\": \"assistant\",
  \"content\": \"For defective items, we extend the return window to 90 days. We also cover return shipping costs for confirmed defects. Customers can choose between a full refund or a replacement product.\"
}")
TURN1_4_HASH=$(extract "$TURN1_4" '.data.turn_hash')

ok "  4 turns added to Conversation 1"

# =============================================================================
# Conversation 2: Double 11 Promotion Discussion (source for v2)
# =============================================================================
step "Creating Conversation 2: Double 11 Promotion Discussion"

CONV2=$(post "${API_V1}/conversations" "{
  \"project_id\": \"${PROJECT_ID}\",
  \"title\": \"Double 11 Promotion Policy Discussion\",
  \"position_x\": 100,
  \"position_y\": 350
}")
CONV2_ID=$(extract "$CONV2" '.data.conversation_id')
ok "Conversation 2 created: ${CONV2_ID}"

step "  Adding turns..."

# Turn 2.1: user asks about promotion
TURN2_1=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT_ID}\",
  \"conversation_id\": \"${CONV2_ID}\",
  \"role\": \"user\",
  \"content\": \"We have Double 11 promotion coming up. Can we extend the return period to attract more customers?\"
}")
TURN2_1_HASH=$(extract "$TURN2_1" '.data.turn_hash')

# Turn 2.2: assistant agrees and mentions 60 days
TURN2_2=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT_ID}\",
  \"conversation_id\": \"${CONV2_ID}\",
  \"role\": \"assistant\",
  \"content\": \"Great idea! For the Double 11 promotion, we can extend the return window to 60 days. This applies only to items purchased during the promotion period from November 1st to November 11th.\"
}")
TURN2_2_HASH=$(extract "$TURN2_2" '.data.turn_hash')

# Turn 2.3: user asks to highlight advantage over competitors
TURN2_3=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT_ID}\",
  \"conversation_id\": \"${CONV2_ID}\",
  \"role\": \"user\",
  \"content\": \"Can you also mention that this is better than our competitors? I want customers to know we offer more value.\"
}")
TURN2_3_HASH=$(extract "$TURN2_3" '.data.turn_hash')

# Turn 2.4: assistant mentions competitors (THIS IS THE PROBLEMATIC CONTENT)
TURN2_4=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT_ID}\",
  \"conversation_id\": \"${CONV2_ID}\",
  \"role\": \"assistant\",
  \"content\": \"Absolutely! Our 60-day return window during Double 11 is significantly better than most competitors who only offer 30 days. This makes us the best choice for holiday shopping. Competitor return policies are typically more restrictive.\"
}")
TURN2_4_HASH=$(extract "$TURN2_4" '.data.turn_hash')

ok "  4 turns added to Conversation 2"
warn "  Note: Turn 2.4 contains 'competitor' - this will trigger validation failure"

# =============================================================================
# Conversation 3: Policy Rollback Discussion (source for v3)
# =============================================================================
step "Creating Conversation 3: Policy Rollback Discussion"

CONV3=$(post "${API_V1}/conversations" "{
  \"project_id\": \"${PROJECT_ID}\",
  \"title\": \"Post-Promotion Policy Review\",
  \"position_x\": 100,
  \"position_y\": 600
}")
CONV3_ID=$(extract "$CONV3" '.data.conversation_id')
ok "Conversation 3 created: ${CONV3_ID}"

step "  Adding turns..."

# Turn 3.1: user says promotion is over
TURN3_1=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT_ID}\",
  \"conversation_id\": \"${CONV3_ID}\",
  \"role\": \"user\",
  \"content\": \"Double 11 is over now. We need to change the return policy back to standard. Also, I noticed the promotion version mentioned competitors - that's not allowed.\"
}")
TURN3_1_HASH=$(extract "$TURN3_1" '.data.turn_hash')

# Turn 3.2: assistant acknowledges and fixes
TURN3_2=$(post "${API_V1}/turns" "{
  \"project_id\": \"${PROJECT_ID}\",
  \"conversation_id\": \"${CONV3_ID}\",
  \"role\": \"assistant\",
  \"content\": \"You are right, I apologize for that oversight. Let me correct it. The standard return policy is 30 days from purchase. For defective items, we still offer the extended 90-day window with covered shipping. I have removed all references to competitors.\"
}")
TURN3_2_HASH=$(extract "$TURN3_2" '.data.turn_hash')

ok "  2 turns added to Conversation 3"

# =============================================================================
# Commit v1: Standard Policy (main branch, root commit)
# =============================================================================
step "Creating Commit v1: Standard 30-day policy (main branch)"

COMMIT_V1=$(post "${API_V1}/commits-v4" "{
  \"author\": {\"type\": \"human\", \"name\": \"policy-admin\"},
  \"sentences\": [
    {
      \"id\": \"s_v1_1\",
      \"text\": \"Our standard return policy allows customers to return items within 30 days of purchase\",
      \"confidence\": 0.95,
      \"source_ref\": {
        \"conversation_id\": \"${CONV1_ID}\",
        \"turn_hash\": \"${TURN1_2_HASH}\",
        \"start_char\": 0,
        \"end_char\": 86
      }
    },
    {
      \"id\": \"s_v1_2\",
      \"text\": \"Items must be in original packaging with all accessories included\",
      \"confidence\": 0.93,
      \"source_ref\": {
        \"conversation_id\": \"${CONV1_ID}\",
        \"turn_hash\": \"${TURN1_2_HASH}\",
        \"start_char\": 88,
        \"end_char\": 153
      }
    },
    {
      \"id\": \"s_v1_3\",
      \"text\": \"For defective items, we extend the return window to 90 days with covered shipping costs\",
      \"confidence\": 0.94,
      \"source_ref\": {
        \"conversation_id\": \"${CONV1_ID}\",
        \"turn_hash\": \"${TURN1_4_HASH}\",
        \"start_char\": 0,
        \"end_char\": 87
      }
    },
    {
      \"id\": \"s_v1_4\",
      \"text\": \"Customers can choose between a full refund or a replacement product\",
      \"confidence\": 0.92,
      \"source_ref\": {
        \"conversation_id\": \"${CONV1_ID}\",
        \"turn_hash\": \"${TURN1_4_HASH}\",
        \"start_char\": 89,
        \"end_char\": 156
      }
    }
  ],
  \"project_id\": \"${PROJECT_ID}\",
  \"message\": \"v1: Standard return policy - 30 days, 90 days for defects\",
  \"branch\": \"main\",
  \"source_refs\": [
    {\"type\": \"conversation\", \"id\": \"${CONV1_ID}\", \"title\": \"Initial Return Policy Discussion\"}
  ],
  \"position_x\": 400,
  \"position_y\": 100
}")
COMMIT_V1_HASH=$(extract "$COMMIT_V1" '.data.hash')
ok "Commit v1 created: ${COMMIT_V1_HASH}"
info "Branch: main (root commit)"
info "Content: 30-day standard, 90-day defects"

# =============================================================================
# Commit v2: Promotion Policy (feature/double11 branch)
# Branched from v1, contains competitor mention (the bug!)
# =============================================================================
step "Creating Commit v2: Double 11 promotion policy (feature/double11 branch)"

COMMIT_V2=$(post "${API_V1}/commits-v4" "{
  \"author\": {\"type\": \"human\", \"name\": \"marketing-team\"},
  \"parents\": [\"${COMMIT_V1_HASH}\"],
  \"sentences\": [
    {
      \"id\": \"s_v2_1\",
      \"text\": \"During Double 11 promotion, customers can return items within 60 days of purchase\",
      \"confidence\": 0.94,
      \"source_ref\": {
        \"conversation_id\": \"${CONV2_ID}\",
        \"turn_hash\": \"${TURN2_2_HASH}\",
        \"start_char\": 0,
        \"end_char\": 81
      }
    },
    {
      \"id\": \"s_v2_2\",
      \"text\": \"This promotion applies to items purchased from November 1st to November 11th\",
      \"confidence\": 0.93,
      \"source_ref\": {
        \"conversation_id\": \"${CONV2_ID}\",
        \"turn_hash\": \"${TURN2_2_HASH}\",
        \"start_char\": 83,
        \"end_char\": 159
      }
    },
    {
      \"id\": \"s_v2_3\",
      \"text\": \"Our 60-day return window is significantly better than most competitors who only offer 30 days\",
      \"confidence\": 0.91,
      \"source_ref\": {
        \"conversation_id\": \"${CONV2_ID}\",
        \"turn_hash\": \"${TURN2_4_HASH}\",
        \"start_char\": 12,
        \"end_char\": 104
      }
    },
    {
      \"id\": \"s_v2_4\",
      \"text\": \"For defective items, we still offer the extended 90-day window with covered shipping\",
      \"confidence\": 0.92,
      \"source_ref\": {
        \"conversation_id\": \"${CONV1_ID}\",
        \"turn_hash\": \"${TURN1_4_HASH}\",
        \"start_char\": 0,
        \"end_char\": 84
      }
    }
  ],
  \"project_id\": \"${PROJECT_ID}\",
  \"message\": \"v2: Double 11 promotion - 60 days return window\",
  \"branch\": \"feature/double11\",
  \"source_refs\": [
    {\"type\": \"conversation\", \"id\": \"${CONV2_ID}\", \"title\": \"Double 11 Promotion Policy Discussion\"}
  ],
  \"position_x\": 700,
  \"position_y\": 350
}")
COMMIT_V2_HASH=$(extract "$COMMIT_V2" '.data.hash')
ok "Commit v2 created: ${COMMIT_V2_HASH}"
info "Branch: feature/double11 (branched from v1)"
info "Content: 60-day promotion, CONTAINS 'competitor' mention!"
warn "  Sentence s_v2_3 mentions 'competitors' - this is the bug to demo!"

# =============================================================================
# Commit v3: Fixed Policy (main branch, after rollback)
# Back to 30 days, competitor content removed
# =============================================================================
step "Creating Commit v3: Fixed policy after rollback (main branch)"

COMMIT_V3=$(post "${API_V1}/commits-v4" "{
  \"author\": {\"type\": \"human\", \"name\": \"policy-admin\"},
  \"parents\": [\"${COMMIT_V1_HASH}\"],
  \"sentences\": [
    {
      \"id\": \"s_v3_1\",
      \"text\": \"Our standard return policy allows customers to return items within 30 days of purchase\",
      \"confidence\": 0.95,
      \"source_ref\": {
        \"conversation_id\": \"${CONV3_ID}\",
        \"turn_hash\": \"${TURN3_2_HASH}\",
        \"start_char\": 63,
        \"end_char\": 110
      }
    },
    {
      \"id\": \"s_v3_2\",
      \"text\": \"Items must be in original packaging with all accessories included\",
      \"confidence\": 0.93,
      \"source_ref\": {
        \"conversation_id\": \"${CONV1_ID}\",
        \"turn_hash\": \"${TURN1_2_HASH}\",
        \"start_char\": 88,
        \"end_char\": 153
      }
    },
    {
      \"id\": \"s_v3_3\",
      \"text\": \"For defective items, we offer an extended 90-day return window with covered shipping costs\",
      \"confidence\": 0.94,
      \"source_ref\": {
        \"conversation_id\": \"${CONV3_ID}\",
        \"turn_hash\": \"${TURN3_2_HASH}\",
        \"start_char\": 112,
        \"end_char\": 201
      }
    },
    {
      \"id\": \"s_v3_4\",
      \"text\": \"All references to competitor policies have been removed from official communications\",
      \"confidence\": 0.96,
      \"source_ref\": {
        \"conversation_id\": \"${CONV3_ID}\",
        \"turn_hash\": \"${TURN3_2_HASH}\",
        \"start_char\": 203,
        \"end_char\": 286
      }
    }
  ],
  \"project_id\": \"${PROJECT_ID}\",
  \"message\": \"v3: Rollback to standard 30-day policy, competitor references removed\",
  \"branch\": \"main\",
  \"source_refs\": [
    {\"type\": \"conversation\", \"id\": \"${CONV3_ID}\", \"title\": \"Post-Promotion Policy Review\"}
  ],
  \"position_x\": 400,
  \"position_y\": 400
}")
COMMIT_V3_HASH=$(extract "$COMMIT_V3" '.data.hash')
ok "Commit v3 created: ${COMMIT_V3_HASH}"
info "Branch: main (child of v1)"
info "Content: Back to 30-day, competitor content removed"

# =============================================================================
# Leaf: Email Template (on v2 - the problematic version)
# Constraints deliberately missing 'competitor' exclusion for demo
# =============================================================================
step "Creating Leaf on v2 (the problematic commit) - without competitor constraint initially"

LEAF_V2=$(post "${API_V1}/leaves" "{
  \"commit_hash\": \"${COMMIT_V2_HASH}\",
  \"type\": \"email\",
  \"title\": \"Double 11 Return Policy Email Template\",
  \"project_id\": \"${PROJECT_ID}\",
  \"constraints\": [
    {
      \"type\": \"require\",
      \"match_mode\": \"exact\",
      \"value\": \"60 days\",
      \"description\": \"Must mention the 60-day promotion return window\",
      \"source_sentence_id\": \"s_v2_1\"
    },
    {
      \"type\": \"require\",
      \"match_mode\": \"semantic\",
      \"value\": \"defective items have extended return period\",
      \"description\": \"Must reference the defective item policy\",
      \"source_sentence_id\": \"s_v2_4\"
    }
  ],
  \"config\": {
    \"prompt_template\": \"Write a promotional email highlighting our Double 11 return policy benefits.\",
    \"model\": \"claude-sonnet-4-20250514\",
    \"max_tokens\": 1024
  }
}")
LEAF_V2_ID=$(extract "$LEAF_V2" '.data.id')
ok "Leaf created on v2: ${LEAF_V2_ID}"
warn "  NOTE: 'competitor' exclusion constraint NOT added - for demo purpose"
info "  During demo, add MUST NOT HAVE 'competitor' and re-validate to show failure"

# Write mock output that contains the problematic content
step "Writing mock output with competitor mention (for demo)"
MOCK_OUTPUT_V2="Dear Valued Customer,

We are excited to announce our Double 11 special promotion! During this period, you can return any item within 60 days of purchase - that's twice the standard return window!

This promotion applies to all items purchased between November 1st and November 11th.

Why shop with us? Our 60-day return policy is significantly better than most competitors who only offer 30 days. This makes us your best choice for holiday shopping!

For defective items, we continue to offer our extended 90-day return window with free return shipping.

Happy Shopping!
Customer Service Team"

curl -sf -X PATCH "${API_V1}/leaves/${LEAF_V2_ID}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg out "$MOCK_OUTPUT_V2" '{output: $out}')" > /dev/null 2>&1
ok "Mock output written (contains 'competitors' - will fail validation when constraint is added)"

# =============================================================================
# Leaf: Fixed Email Template (on v3 - the correct version)
# This one has the competitor exclusion constraint
# =============================================================================
step "Creating Leaf on v3 (the fixed commit) - with competitor constraint"

LEAF_V3=$(post "${API_V1}/leaves" "{
  \"commit_hash\": \"${COMMIT_V3_HASH}\",
  \"type\": \"email\",
  \"title\": \"Standard Return Policy Email Template\",
  \"project_id\": \"${PROJECT_ID}\",
  \"constraints\": [
    {
      \"type\": \"require\",
      \"match_mode\": \"exact\",
      \"value\": \"30 days\",
      \"description\": \"Must mention the standard 30-day return window\",
      \"source_sentence_id\": \"s_v3_1\"
    },
    {
      \"type\": \"require\",
      \"match_mode\": \"semantic\",
      \"value\": \"defective items have extended return period\",
      \"description\": \"Must reference the defective item policy\"
    },
    {
      \"type\": \"exclude\",
      \"match_mode\": \"semantic\",
      \"value\": \"competitor\",
      \"reason\": \"Must not reference competitors in any form\"
    }
  ],
  \"config\": {
    \"prompt_template\": \"Write a professional email summarizing our return policy.\",
    \"model\": \"claude-sonnet-4-20250514\",
    \"max_tokens\": 1024
  }
}")
LEAF_V3_ID=$(extract "$LEAF_V3" '.data.id')
ok "Leaf created on v3: ${LEAF_V3_ID}"
info "  This leaf HAS the 'competitor' exclusion constraint"

# Write mock output that passes validation
MOCK_OUTPUT_V3="Dear Valued Customer,

Thank you for shopping with us! Here is a summary of our return policy:

Standard returns are accepted within 30 days of purchase. Items must be in their original packaging with all accessories included.

For defective items, we offer an extended 90-day return window. We also cover return shipping costs for confirmed defects. You may choose between a full refund or a replacement product.

If you have any questions, please contact our customer service team.

Best regards,
Customer Service Team"

curl -sf -X PATCH "${API_V1}/leaves/${LEAF_V3_ID}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg out "$MOCK_OUTPUT_V3" '{output: $out}')" > /dev/null 2>&1
ok "Mock output written (clean - will pass validation)"

# =============================================================================
# Pin conversations for context
# =============================================================================
step "Pinning conversations"

PIN1=$(post "${API_V1}/projects/${PROJECT_ID}/pins" "{
  \"type\": \"conversation\",
  \"ref_id\": \"${CONV1_ID}\"
}")
PIN1_ID=$(extract "$PIN1" '.data.id')
ok "Pinned Conversation 1: ${PIN1_ID}"

PIN2=$(post "${API_V1}/projects/${PROJECT_ID}/pins" "{
  \"type\": \"conversation\",
  \"ref_id\": \"${CONV2_ID}\"
}")
PIN2_ID=$(extract "$PIN2" '.data.id')
ok "Pinned Conversation 2: ${PIN2_ID}"

# =============================================================================
# Create Merge Draft (feature/double11 -> main)
# =============================================================================
step "Creating merge draft (feature/double11 -> main)"

MERGE_DRAFT=$(post "${API_V1}/merge/drafts" "{
  \"project_id\": \"${PROJECT_ID}\",
  \"source_hash\": \"${COMMIT_V2_HASH}\",
  \"target_hash\": \"${COMMIT_V3_HASH}\",
  \"source_branch\": \"feature/double11\",
  \"target_branch\": \"main\"
}")
DRAFT_ID=$(extract "$MERGE_DRAFT" '.data.draftId')
SIMILAR_PAIRS=$(echo "$MERGE_DRAFT" | jq '.data.prepared.similarPairs | length')
ONLY_SOURCE=$(echo "$MERGE_DRAFT" | jq '.data.prepared.onlyInSource | length')
ONLY_TARGET=$(echo "$MERGE_DRAFT" | jq '.data.prepared.onlyInTarget | length')
ok "Merge draft created: ${DRAFT_ID}"
info "  Similar pairs (conflicts): ${SIMILAR_PAIRS}"
info "  Only in source: ${ONLY_SOURCE}"
info "  Only in target: ${ONLY_TARGET}"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "============================================="
echo "  Investor Demo Data - Setup Complete!"
echo "============================================="
echo ""
echo "  Project:        ${PROJECT_ID}"
echo "  Project Name:   Return Policy Knowledge Base"
echo ""
echo "  Conversations:  3"
echo "    - Conv 1: Initial Policy Discussion"
echo "    - Conv 2: Double 11 Promotion Discussion"
echo "    - Conv 3: Post-Promotion Policy Review"
echo ""
echo "  Commits:        3"
echo "    - v1 (main):            ${COMMIT_V1_HASH:0:12}..."
echo "    - v2 (feature/double11): ${COMMIT_V2_HASH:0:12}..."
echo "    - v3 (main):            ${COMMIT_V3_HASH:0:12}..."
echo ""
echo "  Leaves:         2"
echo "    - On v2: ${LEAF_V2_ID} (NO competitor constraint - for demo)"
echo "    - On v3: ${LEAF_V3_ID} (HAS competitor constraint)"
echo ""
echo "  Merge Draft:    ${DRAFT_ID}"
echo ""
echo "============================================="
echo "  Demo Script Highlights"
echo "============================================="
echo ""
echo "  1. VERSION HISTORY + DIFF"
echo "     - Open project canvas"
echo "     - Click v2 commit node"
echo "     - Click 'View commit history'"
echo "     - Show diff: v1 -> v2 (highlight '60 days' and 'competitor')"
echo ""
echo "  2. CONSTRAINT VALIDATION"
echo "     - Open Leaf on v2: ${LEAF_V2_ID}"
echo "     - Show output contains 'competitors'"
echo "     - Add MUST NOT HAVE 'competitor' constraint"
echo "     - Click Re-validate -> RED WARNING appears"
echo ""
echo "  3. MERGE WORKSPACE"
echo "     - Open merge draft: ${DRAFT_ID}"
echo "     - Show conflicts between v2 and v3"
echo "     - Demo 'Discard' on the competitor sentence"
echo "     - Show clean merge preview"
echo ""
echo "============================================="
echo ""
echo "  Open http://localhost:3000/project/${PROJECT_ID}"
echo ""
