#!/bin/bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8000}"
API="${API_BASE}/api/v1"
export no_proxy="${no_proxy:-}localhost,127.0.0.1"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; RED='\033[0;31m'; NC='\033[0m'
step() { echo -e "${BLUE}[>] $1${NC}"; }
ok()   { echo -e "${GREEN}[+] $1${NC}"; }
fail() { echo -e "${RED}[x] $1${NC}"; exit 1; }
jx() { echo "$1" | jq -r "$2 // empty" || fail "jq failed: $2"; }
post() { local r; r=$(curl -sf -X POST "$1" -H "Content-Type: application/json" -d "$2") || fail "POST $1 failed"; echo "$r"; }
do_patch() { local r; r=$(curl -sf -X PATCH "$1" -H "Content-Type: application/json" -d "$2") || fail "PATCH $1 failed"; echo "$r"; }

curl -sf "${API_BASE}/health" > /dev/null 2>&1 || fail "API not running"
ok "API healthy"
echo ""
echo "===== T3X E2E UI Test Seed (3-commit DAG) ====="
echo ""

# --- Project ---
step "Creating project"
P=$(post "${API}/projects" '{"name":"Tokyo Travel Planning","metadata":{"description":"2-week Japan trip"}}')
PID=$(jx "$P" '.data.project_id')
ok "Project: ${PID}"

# --- Conversation 1 ---
step "Conversation 1: Trip Planning"
C1=$(post "${API}/conversations" '{"project_id":"'"${PID}"'","title":"Trip Planning — Budget & Itinerary","position_x":100,"position_y":100}')
C1ID=$(jx "$C1" '.data.conversation_id')
T1=$(post "${API}/turns" '{"project_id":"'"${PID}"'","conversation_id":"'"${C1ID}"'","role":"user","content":"Plan a 2-week Tokyo trip. Budget $5000. Vegetarian, shellfish allergy. Love temples and sushi."}')
T1H=$(jx "$T1" '.data.turn_hash')
T2=$(post "${API}/turns" '{"project_id":"'"${PID}"'","conversation_id":"'"${C1ID}"'","role":"assistant","content":"For 2 weeks on $5000: Tokyo 5 days, Kyoto 4 days, Nikko 2 days. Flights $1000, Accommodation $1400 (hostels+ryokans), Food $700 ($50/day vegetarian), Transport $400 (JR Pass), Activities $300, Extras $200."}')
T2H=$(jx "$T2" '.data.turn_hash')
T3=$(post "${API}/turns" '{"project_id":"'"${PID}"'","conversation_id":"'"${C1ID}"'","role":"user","content":"Best temples? Vegetarian restaurants?"}')
T3H=$(jx "$T3" '.data.turn_hash')
T4=$(post "${API}/turns" '{"project_id":"'"${PID}"'","conversation_id":"'"${C1ID}"'","role":"assistant","content":"Temples: Senso-ji, Meiji Shrine (Tokyo), Kinkaku-ji, Fushimi Inari (Kyoto), Toshogu (Nikko). Restaurants: Ain Soph Tokyo (vegan), Shigetsu Kyoto (temple cuisine), Komaki Shokudo (shojin ryori). All shellfish-free."}')
T4H=$(jx "$T4" '.data.turn_hash')
ok "  4 turns"

# --- Conversation 2 ---
step "Conversation 2: Dietary Requirements"
C2=$(post "${API}/conversations" '{"project_id":"'"${PID}"'","title":"Dietary Requirements — Allergies","position_x":100,"position_y":400}')
C2ID=$(jx "$C2" '.data.conversation_id')
T5=$(post "${API}/turns" '{"project_id":"'"${PID}"'","conversation_id":"'"${C2ID}"'","role":"user","content":"Japanese phrases for shellfish allergy?"}')
T5H=$(jx "$T5" '.data.turn_hash')
T6=$(post "${API}/turns" '{"project_id":"'"${PID}"'","conversation_id":"'"${C2ID}"'","role":"assistant","content":"Key phrase: Ebi to kai no arerugi ga arimasu. Carry allergy card. Avoid: dashi, shared tempura oil, cheap miso. Safe: soba, onigiri, convenience store items with English labels."}')
T6H=$(jx "$T6" '.data.turn_hash')
T7=$(post "${API}/turns" '{"project_id":"'"${PID}"'","conversation_id":"'"${C2ID}"'","role":"user","content":"JR Pass 7-day or 14-day?"}')
T7H=$(jx "$T7" '.data.turn_hash')
T8=$(post "${API}/turns" '{"project_id":"'"${PID}"'","conversation_id":"'"${C2ID}"'","role":"assistant","content":"14-day JR Pass at $400 is best. Covers all shinkansen: Tokyo-Kyoto-Nikko. Save $160 vs individual tickets."}')
T8H=$(jx "$T8" '.data.turn_hash')
ok "  4 turns"

# ===========================================================
# 3-commit DAG:
#
#   base_commit (branch "base")
#   ├── commit_main    (parent: base, branch "main")
#   └── commit_feature (parent: base, branch "feature/dietary")
#
# Both diverge from base with DIFFERENT slot values → real conflicts
# ===========================================================

# --- Base Commit (3 trees, 2 relations, branch "base") ---
step "Base commit (3 trees, 2 relations)"

BASE_JSON=$(jq -n \
  --arg pid "$PID" \
  --arg t1h "$T1H" \
  --arg t2h "$T2H" \
  --arg c1id "$C1ID" \
'{
  project_id: $pid,
  content: {
    trees: [
      {key:"travel_plan", slots:{destination:"Tokyo, Japan",duration:"2 weeks",budget:"$5000",cities:["Tokyo","Kyoto"]}, children:[], confidence:0.90, source:$t1h},
      {key:"budget_breakdown", slots:{flights:"$1000",accommodation:"$1300",food:"$600",transport:"$400",activities:"$250",extras:"$150"}, children:[], confidence:0.88, source:$t2h},
      {key:"dietary_restriction", slots:{type:"vegetarian",allergy:"shellfish",severity:"critical"}, children:[], confidence:0.97, source:$t1h}
    ],
    relations: [
      {from:"travel_plan", to:"budget_breakdown", type:"elaborates"},
      {from:"dietary_restriction", to:"travel_plan", type:"conditions"}
    ]
  },
  branch: "base",
  message: "Initial extraction: base travel plan, budget, dietary info",
  author: {type:"human", name:"heliuqi"},
  source_refs: [{type:"conversation", id:$c1id, title:"Trip Planning"}]
}')

BASE_COMMIT=$(curl -sf -X POST "${API}/commits" -H "Content-Type: application/json" -d "$BASE_JSON") || fail "POST base commit failed"
BASE_HASH=$(jx "$BASE_COMMIT" '.data.commit.hash // .data.hash')
ok "Base commit: ${BASE_HASH}"

# --- Main Commit (parent: base, 5 trees, 3 relations, branch "main") ---
step "Main commit (5 trees, 3 relations) — diverges from base"

MAIN_JSON=$(jq -n \
  --arg pid "$PID" \
  --arg t2h "$T2H" \
  --arg t4h "$T4H" \
  --arg c1id "$C1ID" \
  --arg parent "$BASE_HASH" \
'{
  project_id: $pid,
  content: {
    trees: [
      {key:"travel_plan", slots:{destination:"Tokyo, Japan",duration:"2 weeks",budget:"$5000",cities:["Tokyo (5d)","Kyoto (4d)","Nikko (2d)"]}, children:[], confidence:0.95, source:$t2h},
      {key:"budget_breakdown", slots:{flights:"$1000",accommodation:"$1400",food:"$700 ($50/day)",transport:"$400 (JR Pass)",activities:"$300",extras:"$200"}, children:[], confidence:0.92, source:$t2h},
      {key:"dietary_restriction", slots:{type:"vegetarian",allergy:"shellfish",severity:"critical"}, children:[], confidence:0.97, source:$t2h},
      {key:"temple_recommendations", slots:{tokyo:["Senso-ji","Meiji Shrine"],kyoto:["Kinkaku-ji","Fushimi Inari"],nikko:["Toshogu Shrine"]}, children:[], confidence:0.93, source:$t4h},
      {key:"vegetarian_restaurants", slots:{tokyo:"Ain Soph (vegan)",kyoto:"Shigetsu (temple cuisine)",specialty:"Komaki Shokudo"}, children:[], confidence:0.91, source:$t4h}
    ],
    relations: [
      {from:"travel_plan", to:"budget_breakdown", type:"elaborates"},
      {from:"dietary_restriction", to:"vegetarian_restaurants", type:"conditions"},
      {from:"travel_plan", to:"temple_recommendations", type:"elaborates"}
    ]
  },
  branch: "main",
  parents: [$parent],
  message: "Extract travel plan: 2-week Tokyo, budget + dietary constraints",
  author: {type:"human", name:"heliuqi"},
  source_refs: [{type:"conversation", id:$c1id, title:"Trip Planning"}]
}')

MAIN_COMMIT=$(curl -sf -X POST "${API}/commits" -H "Content-Type: application/json" -d "$MAIN_JSON") || fail "POST main commit failed"
MAIN_HASH=$(jx "$MAIN_COMMIT" '.data.commit.hash // .data.hash')
ok "Main commit: ${MAIN_HASH}"

# --- Feature Commit (parent: base, 5 trees, 3 relations, branch "feature/dietary") ---
step "Feature commit (5 trees, 3 relations) — diverges from base"

FEATURE_JSON=$(jq -n \
  --arg pid "$PID" \
  --arg t4h "$T4H" \
  --arg t6h "$T6H" \
  --arg t8h "$T8H" \
  --arg c2id "$C2ID" \
  --arg parent "$BASE_HASH" \
'{
  project_id: $pid,
  content: {
    trees: [
      {key:"travel_plan", slots:{destination:"Tokyo, Japan",duration:"2 weeks",budget:"$5000",cities:["Tokyo (7d)","Kyoto (5d)","Osaka (2d)"]}, children:[], confidence:0.94, source:$t8h},
      {key:"budget_breakdown", slots:{flights:"$1000",accommodation:"$1200 (hostels+capsule)",food:"$800 ($57/day veg premium)",transport:"$400 (14d JR Pass)",activities:"$400",extras:"$200"}, children:[], confidence:0.90, source:$t8h},
      {key:"dietary_restriction", slots:{type:"vegetarian",allergy:"shellfish",severity:"critical"}, children:[], confidence:0.97, source:$t6h},
      {key:"temple_recommendations", slots:{tokyo:["Senso-ji","Meiji Shrine","Gotoku-ji"],kyoto:["Kinkaku-ji","Fushimi Inari","Ryoan-ji"],osaka:["Shitenno-ji"]}, children:[], confidence:0.91, source:$t4h},
      {key:"allergy_safety_guide", slots:{allergy:"shellfish (critical)",key_phrase:"Ebi to kai no arerugi ga arimasu",avoid:["dashi","tempura oil","cheap miso"],safe:["soba","onigiri","conbini items"]}, children:[], confidence:0.96, source:$t6h}
    ],
    relations: [
      {from:"travel_plan", to:"budget_breakdown", type:"elaborates"},
      {from:"allergy_safety_guide", to:"travel_plan", type:"conditions"},
      {from:"travel_plan", to:"temple_recommendations", type:"elaborates"}
    ]
  },
  branch: "feature/dietary",
  parents: [$parent],
  message: "Add allergy safety guide, update itinerary with Osaka",
  author: {type:"human", name:"heliuqi"},
  source_refs: [{type:"conversation", id:$c2id, title:"Dietary Requirements"}]
}')

FEATURE_COMMIT=$(curl -sf -X POST "${API}/commits" -H "Content-Type: application/json" -d "$FEATURE_JSON") || fail "POST feature commit failed"
FEATURE_HASH=$(jx "$FEATURE_COMMIT" '.data.commit.hash // .data.hash')
ok "Feature commit: ${FEATURE_HASH}"

# --- Leaf on main commit ---
step "Creating Leaf: Travel Assistant v1"
LEAF=$(post "${API}/leaves" '{"project_id":"'"${PID}"'","commit_hash":"'"${MAIN_HASH}"'","type":"deploy_agent","title":"Travel Assistant v1","constraints":[{"type":"require","match_mode":"exact","value":"Tokyo"},{"type":"require","match_mode":"exact","value":"2 weeks"},{"type":"require","match_mode":"semantic","value":"vegetarian"},{"type":"exclude","match_mode":"exact","value":"shellfish","reason":"Critical allergy"}],"config":{"prompt_template":"Generate a Japan travel guide focusing on vegetarian options.","model":"claude-sonnet-4-20250514","max_tokens":2048}}')
LEAF_ID=$(jx "$LEAF" '.data.id')
ok "Leaf: ${LEAF_ID}"

step "Writing mock output"
MOCK_JSON=$(jq -n --arg out 'Welcome! Here is your 2 weeks Tokyo travel guide.

Budget: $5000 covers Flights $1000, Accommodation $1400, Food $700 ($50/day vegetarian), Transport $400 (JR Pass), Activities $300, Extras $200.

Week 1 Tokyo (5 days): Senso-ji temple, Meiji Shrine, Ain Soph vegan restaurant, Komaki Shokudo shojin ryori.

Week 2 Kyoto and Nikko: Kinkaku-ji, Fushimi Inari, Shigetsu temple cuisine, Toshogu Shrine.

Dietary note: You are vegetarian with a critical shellfish allergy. All restaurants verified safe. Carry your allergy card at all times.' '{output: $out}')
do_patch "${API}/leaves/${LEAF_ID}" "$MOCK_JSON" > /dev/null
ok "Mock output written"

step "Validating leaf (exact match)"
VALIDATE=$(post "${API}/leaves/${LEAF_ID}/validate" '{"use_semantic": false}')
ok "Leaf validated — assertions created"

# --- Merge Draft ---
step "Creating merge draft: feature/dietary -> main"
MERGE=$(post "${API}/merge/drafts" '{"project_id":"'"${PID}"'","source_hash":"'"${FEATURE_HASH}"'","target_hash":"'"${MAIN_HASH}"'","source_branch":"feature/dietary","target_branch":"main"}')
MERGE_ID=$(jx "$MERGE" '.data.draftId')
ok "Merge draft: ${MERGE_ID}"

echo ""
echo "============================================="
echo -e "  ${GREEN}Seed Complete!${NC}"
echo "============================================="
echo ""
echo "  Project:       ${PID}"
echo "  Conversations: 2 (8 turns)"
echo "  Commits:       3 (base + main + feature, DAG)"
echo "  Leaf:          1 (4 constraints + output + assertions)"
echo "  Merge Draft:   1 (real 3-way conflicts)"
echo ""
echo "  ===== Click these URLs ====="
echo ""
echo "  Chat:    http://localhost:3000/chat/${C1ID}"
echo "  Canvas:  http://localhost:3000/project/${PID}"
echo "  Commit:  http://localhost:3000/project/${PID}/commit/${MAIN_HASH}"
echo "  Diff:    http://localhost:3000/project/${PID}/diff?base=${MAIN_HASH}&target=${FEATURE_HASH}"
echo "  Merge:   http://localhost:3000/project/${PID}/merge/${MERGE_ID}"
echo "  Leaf:    http://localhost:3000/project/${PID}/leaf/${LEAF_ID}"
echo ""
