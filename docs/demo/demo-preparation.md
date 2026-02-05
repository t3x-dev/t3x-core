# T3X Demo Preparation Guide

> Goal: Present the product to a quantitative trading company executive tomorrow, at minimum run through one complete workflow.

## Current Status

- Sprint 47/48 (98%), all 3 rehearsals passed
- Seed script available, includes mock output fallback
- Quant momentum strategy demo script available (`docs/demo/quant-momentum-demo.md`)

---

## Strategy: Dual-Track (Product Capabilities Primary + Quant Scenario Bonus)

Core idea: **Product capabilities > Scenario packaging**. T3X's semantic extraction, version DAG, Diff, Merge, Leaf constraints are universal capabilities that don't need a quant scenario to prove. Use seed data to fully demonstrate the product, verbally relate the scenario to quantitative as needed.

| Track | Content | Risk | Purpose |
|-------|---------|------|---------|
| Track A (Main) | `seed-demo.sh` pre-loads 3 projects, fully demonstrates core product capabilities | Low | Stable, verified, shows all features |
| Track B (Bonus) | Live operation following quant-momentum-demo.md | Medium | If time and atmosphere allow, run a quant scenario live |

---

## Today's Preparation Steps

### 1. Build Verification
```bash
pnpm clean && pnpm install && pnpm build   # 8/8 tasks success
pnpm test                                   # 365+ tests pass
pnpm check                                  # 0 error
```

### 2. Start Services + Seed
```bash
# Terminal 1
pnpm dev:api          # Wait for "T3X API server running on http://localhost:8000"

# Terminal 2
pnpm dev:webui        # Wait for Next.js ready

# Terminal 3
./scripts/seed-demo.sh
```

### 3. Full Browse Verification (open http://localhost:3000)

- [ ] Project list shows 3 projects + statistics
- [ ] Canvas shows nodes + Next Step buttons
- [ ] Double-click Commit node -> Three-column view
- [ ] Diff entry -> Semantic diff display
- [ ] Leaf node has content (generated or mock)
- [ ] Merge workspace has conflict pairs
- [ ] Insights -> Real data
- [ ] Press `?` -> Keyboard shortcuts popup
- [ ] Light/dark mode both work

### 4. Quant Demo Track B Pre-run

Follow `quant-momentum-demo.md` and manually walk through Steps 0-4:
1. Create new project `Demo - US Equity Momentum`
2. Create new conversation, paste V1 strategy text
3. Commit V1
4. Paste V2 iteration text
5. Commit V2 + View Diff

**Record any issues at each step, this is the last chance to fix them.**

### 5. Backup + Proxy Check
```bash
# Gracefully stop API (Ctrl+C), then backup
cp -r .t3x/database/ .t3x/database-backup/
```

Check `HTTPS_PROXY` setting in `.env` -- Will proxy software be running during tomorrow's demo? If unsure, temporarily comment it out.

---

## Demo Day Tomorrow

### 2 Hours Before
```bash
rm -rf .t3x/database/          # Clear database
pnpm dev:api                   # Terminal 1
pnpm dev:webui                 # Terminal 2
./scripts/seed-demo.sh         # Terminal 3
# Quick verify project list is normal
```

### 30 Minutes Before
- Close DevTools, notifications, unrelated tabs
- Browser zoom 100-110%
- Confirm dark/light mode preference
- If planning Track B, prepare 4 clipboard texts (see below)

### Demo Flow (15-20 minutes)

**Opening (1 minute)**: Project list, explain what T3X is -- "AI conversations produce knowledge that needs version management, T3X does exactly that"

**Act 1 -- Core Product Capabilities Demo (8-10 minutes, Track A, main line)**:
1. Open seed project (e.g., Customer Support Knowledge)
2. **Canvas overview**: Nodes, edges, DAG structure -- "All knowledge changes visible at a glance, like Git's commit graph"
3. **Commit details**: Double-click node -> Three-column view -- "Natural language automatically split into quotable entries, each traceable to original conversation"
4. **Diff**: Click Compare -> Semantic diff display -- "Not text diff, but semantic-level change detection, what changed, added, deleted"
5. **Leaf constraints and output** -- "Set rules for knowledge: require ensures key information is retained, exclude removes content that shouldn't appear"
6. **Merge conflict detection** -- "Knowledge conflicts from multiple people/rounds of conversations, automatically detected, resolved one by one"

> Verbal quant scenario tie-in: "For example, your strategy research notes, backtest parameter iterations, every modification has a semantic version, instantly visible what changed"

**Act 2 -- Quant Scenario Live Operation (5-8 minutes, Track B, optional bonus)**:

> If atmosphere is good and time permits after Act 1, continue Track B; otherwise skip directly to closing.

- Step 0: Create project + conversation (30 seconds)
- Step 1: Paste V1 strategy (10 seconds)
- Step 2: Commit V1 (1 minute) -- Show semantic extraction
- Step 3: Paste V2 iteration (10 seconds)
- Step 4: Commit V2 + Diff (2 minutes) -- **Core highlight**
- Step 5: Create Leaf + constraints (if time permits)

**Closing (2 minutes)**: Canvas overview DAG, one-sentence summary

### Talking Points

| Scenario | What to Say |
|----------|-------------|
| Product positioning | "More and more AI conversations, knowledge scattered everywhere, T3X makes this knowledge traceable, comparable, collaborative" |
| Sentence extraction | "Natural language automatically split into quotable entries, each traces back to original source" |
| Diff | "Not editing documents, but creating new semantic versions, changes visible at a glance" |
| Leaf constraints | "Set hard constraints on knowledge -- require ensures key rules are retained, exclude removes content that shouldn't appear" |
| Merge | "Semantic conflict detection for multi-source knowledge, automatically detected, resolved one by one" |
| Quant tie-in (verbal) | "For example, your strategy iterations, parameter tuning records, every change is traceable" |

---

## Troubleshooting

| Issue | Recovery |
|-------|----------|
| API startup fails | `rm -rf .t3x/database/` -> restart |
| PGLite corrupted | `cp -r .t3x/database-backup/ .t3x/database/` -> restart |
| Leaf Generate fails | Switch to seed project's mock leaf |
| Commit extracts 0 items | Switch to seed project's existing Commit |
| Diff errors | Switch to seed's merge draft |
| Proxy timeout | Comment out HTTPS_PROXY in `.env`, restart API |
| **Everything down** | Use seed data for browse-only demo |

---

## Clipboard (for Track B, save before demo)

**1 - Project name**: `Demo - US Equity Momentum`

**2 - Conversation name**: `Research: Momentum v1`

**3 - V1 Strategy text**:
```
Strategy: US large-cap momentum strategy, weekly rebalancing.
Universe: S&P 500 constituents; exclude stocks with 20-day average daily turnover below $20M.
Signal: Rank by past 60 trading day returns, go long top 10%, short bottom 10% (equal weight).
Risk control: Max single stock weight 2%; target portfolio volatility 12% annualized; if drawdown exceeds 8%, reduce leverage to 0.5.
Transaction costs: 10bp round-trip; 5bp slippage.
Expected: 12-18% annualized returns over 2016-2024, max drawdown < 15%.
Risk factors: Momentum reversal in choppy markets, potential drawdown spike in 2020Q1; need market regime filter.
```

**4 - V2 Iteration text**:
```
Adjustment 1: Add market regime filter: When SPY's 20-day return < 0 and VIX > 25, reduce strategy position to 30%.
Adjustment 2: Change momentum window from 60 days to 120 days, reduce sensitivity to choppy reversals.
Adjustment 3: Change short leg from Bottom 10% to Bottom 5%, reduce short squeeze risk.
Backtest update: 11-16% annualized returns over 2016-2024, max drawdown reduced from 18% to 13%, 2020Q1 drawdown significantly improved.
```

---

## Key Files

- `scripts/seed-demo.sh` -- Fallback data script
- `docs/demo/quant-momentum-demo.md` -- Complete quant demo script + FAQ
- `docs/demo-sprint-v2.md` -- Sprint status + Demo Day checklist
- `.env` -- API keys + proxy configuration

## Verification Method

1. After completing today's preparation steps 1-5, confirm all checklist items pass
2. Track B pre-run (step 4) completes smoothly = demo can run
3. Re-seed + quick verify 2 hours before tomorrow's demo
