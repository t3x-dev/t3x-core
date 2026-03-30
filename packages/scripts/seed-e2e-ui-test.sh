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
echo "===== T3X E2E UI Test Seed ====="
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

# --- Commit 1: main (5 trees, 3 relations) ---
step "Commit 1 on main (5 trees, 3 relations)"

# Build JSON with jq to avoid all escaping issues
COMMIT1_JSON=$(jq -n \
  --arg pid "$PID" \
  --arg t1h "$T1H" \
  --arg t2h "$T2H" \
  --arg t4h "$T4H" \
  --arg c1id "$C1ID" \
'{
  project_id: $pid,
  content: {
    trees: [
      {key:"travel_plan", slots:{destination:"Tokyo, Japan",duration:"2 weeks",budget:"$5000",cities:["Tokyo (5d)","Kyoto (4d)","Nikko (2d)"],transport:"14-day JR Pass"}, children:[], confidence:0.95, source:$t2h},
      {key:"budget_breakdown", slots:{flights:"$1000",accommodation:"$1400 (hostels+ryokans)",food:"$700 ($50/day)",transport:"$400 (JR Pass)",activities:"$300",extras:"$200"}, children:[], confidence:0.92, source:$t2h},
      {key:"temple_recommendations", slots:{tokyo:["Senso-ji","Meiji Shrine"],kyoto:["Kinkaku-ji","Fushimi Inari"],nikko:["Toshogu Shrine"]}, children:[], confidence:0.93, source:$t4h},
      {key:"vegetarian_restaurants", slots:{tokyo:"Ain Soph (vegan)",kyoto:"Shigetsu (temple cuisine)",specialty:"Komaki Shokudo (shojin ryori)",shellfish_safe:true}, children:[], confidence:0.91, source:$t4h},
      {key:"dietary_restriction", slots:{type:"vegetarian",allergy:"shellfish",severity:"critical"}, children:[], confidence:0.97, source:$t1h}
    ],
    relations: [
      {from:"travel_plan", to:"budget_breakdown", type:"elaborates"},
      {from:"dietary_restriction", to:"vegetarian_restaurants", type:"conditions"},
      {from:"travel_plan", to:"temple_recommendations", type:"elaborates"}
    ]
  },
  branch: "main",
  message: "Extract travel plan: 2-week Tokyo, budget + dietary constraints",
  author: {type:"human", name:"heliuqi"},
  source_refs: [{type:"conversation", id:$c1id, title:"Trip Planning"}]
}')

COMMIT1=$(curl -sf -X POST "${API}/commits" -H "Content-Type: application/json" -d "$COMMIT1_JSON") || fail "POST commits failed"
HASH1=$(jx "$COMMIT1" '.data.commit.hash // .data.hash')
ok "Commit 1 (main): ${HASH1}"

# --- Commit 2: feature/dietary (5 trees, 3 relations, slot conflicts) ---
step "Commit 2 on feature/dietary (5 trees, 3 relations)"

COMMIT2_JSON=$(jq -n \
  --arg pid "$PID" \
  --arg t4h "$T4H" \
  --arg t6h "$T6H" \
  --arg t8h "$T8H" \
  --arg c2id "$C2ID" \
  --arg parent "$HASH1" \
'{
  project_id: $pid,
  content: {
    trees: [
      {key:"travel_plan", slots:{destination:"Tokyo, Japan",duration:"2 weeks",budget:"$5000",cities:["Tokyo (7d)","Kyoto (5d)","Osaka (2d)"],transport:"14-day JR Pass"}, children:[], confidence:0.94, source:$t8h},
      {key:"budget_breakdown", slots:{flights:"$1000",accommodation:"$1200 (hostels+capsule)",food:"$800 ($57/day veg premium)",transport:"$400 (14d JR Pass)",activities:"$400",extras:"$200"}, children:[], confidence:0.90, source:$t8h},
      {key:"temple_recommendations", slots:{tokyo:["Senso-ji","Meiji Shrine","Gotoku-ji"],kyoto:["Kinkaku-ji","Fushimi Inari","Ryoan-ji"],osaka:["Shitenno-ji"]}, children:[], confidence:0.91, source:$t4h},
      {key:"vegetarian_restaurants", slots:{tokyo:"Ain Soph (vegan)",kyoto:"Shigetsu (temple cuisine)",osaka:"Green Earth (organic)",specialty:"Komaki Shokudo (shojin ryori)",shellfish_safe:true}, children:[], confidence:0.92, source:$t4h},
      {key:"allergy_safety_guide", slots:{allergy:"shellfish (critical)",key_phrase:"Ebi to kai no arerugi ga arimasu",carry_card:true,avoid:["dashi","tempura oil","cheap miso"],safe:["soba","onigiri","conbini items"]}, children:[], confidence:0.96, source:$t6h}
    ],
    relations: [
      {from:"travel_plan", to:"budget_breakdown", type:"elaborates"},
      {from:"allergy_safety_guide", to:"vegetarian_restaurants", type:"conditions"},
      {from:"travel_plan", to:"temple_recommendations", type:"elaborates"}
    ]
  },
  branch: "feature/dietary",
  parents: [$parent],
  message: "Add allergy safety guide, update itinerary with Osaka",
  author: {type:"human", name:"heliuqi"},
  source_refs: [{type:"conversation", id:$c2id, title:"Dietary Requirements"}]
}')

COMMIT2=$(curl -sf -X POST "${API}/commits" -H "Content-Type: application/json" -d "$COMMIT2_JSON") || fail "POST commits failed"
HASH2=$(jx "$COMMIT2" '.data.commit.hash // .data.hash')
ok "Commit 2 (feature/dietary): ${HASH2}"

# --- Leaf ---
step "Creating Leaf: Travel Assistant v1"
LEAF=$(post "${API}/leaves" '{"project_id":"'"${PID}"'","commit_hash":"'"${HASH1}"'","type":"deploy_agent","title":"Travel Assistant v1","constraints":[{"type":"require","match_mode":"exact","value":"Tokyo"},{"type":"require","match_mode":"exact","value":"2 weeks"},{"type":"require","match_mode":"semantic","value":"vegetarian"},{"type":"exclude","match_mode":"exact","value":"shellfish","reason":"Critical allergy"}],"config":{"prompt_template":"Generate a Japan travel guide focusing on vegetarian options.","model":"claude-sonnet-4-20250514","max_tokens":2048}}')
LEAF_ID=$(jx "$LEAF" '.data.id')
ok "Leaf: ${LEAF_ID}"

step "Writing mock output..."
MOCK_JSON=$(jq -n --arg out 'Welcome! Here is your 2-week Tokyo travel guide.

Your $5000 budget covers: Flights $1000, Accommodation $1400, Food $700 ($50/day vegetarian), Transport $400 (JR Pass), Activities $300, Extras $200.

Week 1 — Tokyo (5 days):
Day 1-2: Senso-ji temple, Asakusa area
Day 3: Meiji Shrine, Harajuku
Day 4: Vegetarian food tour at Ain Soph (fully vegan)
Day 5: Komaki Shokudo for authentic shojin ryori

Week 2 — Kyoto & Nikko:
Day 6-7: Kyoto, Kinkaku-ji Golden Pavilion
Day 8: Fushimi Inari thousand gates walk
Day 9: Temple cuisine lunch at Shigetsu
Day 10-11: Nikko, Toshogu Shrine complex
Day 12-14: Return to Tokyo, free exploration

Dietary Note: You are vegetarian. All restaurant recommendations have been verified as safe for your dietary needs. Carry your allergy card at all times when dining out.' '{output: $out}')
do_patch "${API}/leaves/${LEAF_ID}" "$MOCK_JSON" > /dev/null
ok "Mock output written"

# --- Merge Draft ---
step "Creating merge draft: feature/dietary -> main"
MERGE=$(post "${API}/merge/drafts" '{"project_id":"'"${PID}"'","source_hash":"'"${HASH2}"'","target_hash":"'"${HASH1}"'","source_branch":"feature/dietary","target_branch":"main"}')
MERGE_ID=$(jx "$MERGE" '.data.draftId')
ok "Merge draft: ${MERGE_ID}"

echo ""
echo "============================================="
echo -e "  ${GREEN}Seed Complete!${NC}"
echo "============================================="
echo ""
echo "  Project:       ${PID}"
echo "  Conversations: 2 (8 turns)"
echo "  Commits:       2 (5 trees each, 3 relations each)"
echo "  Leaf:          1 (4 constraints + output)"
echo "  Merge Draft:   1 (with slot conflicts)"
echo ""
echo "  ===== Click these URLs ====="
echo ""
echo "  Chat:    http://localhost:3000/chat/${C1ID}"
echo "  Canvas:  http://localhost:3000/project/${PID}"
echo "  Commit:  http://localhost:3000/project/${PID}/commit/${HASH1}"
echo "  Diff:    http://localhost:3000/project/${PID}/diff?base=${HASH1}&target=${HASH2}"
echo "  Merge:   http://localhost:3000/project/${PID}/merge/${MERGE_ID}"
echo "  Leaf:    http://localhost:3000/project/${PID}/leaf/${LEAF_ID}"
echo ""
