#!/usr/bin/env node
/**
 * Extraction Quality Test Suite — 5 diverse conversations × 3 modes.
 *
 * Tests structure-aware extraction across different domains and reasoning patterns.
 * Run `pnpm build:core` first if core source has changed.
 *
 * Usage:
 *   node scripts/extraction-quality-suite.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ── Load .env ──
function loadEnv() {
  const root = path.resolve(import.meta.dirname, '..');
  for (const name of ['.env.local', '.env']) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const i = trimmed.indexOf('=');
      if (i === -1) continue;
      const key = trimmed.slice(0, i).trim();
      let val = trimmed.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      process.env[key] = process.env[key] || val;
    }
  }
}
loadEnv();

if (!process.env.ANTHROPIC_API_KEY) { console.error('ERROR: ANTHROPIC_API_KEY not set'); process.exit(1); }

const corePath = path.resolve(import.meta.dirname, '../packages/core/dist/index.js');
const { buildYOpsPrompt, createClaudeProvider } = await import(pathToFileURL(corePath).href);

const MODEL = process.env.T3X_DEBUG_MODEL || 'claude-sonnet-4-20250514';
const provider = createClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY, model: MODEL });

// ══════════════════════════════════════════════════════════════════════════════
// 5 TEST CONVERSATIONS
// ══════════════════════════════════════════════════════════════════════════════

const CONVERSATIONS = [
  // 1. MEDICAL: Diagnosis + treatment decision (cause-effect, conditional logic)
  {
    name: '1. Medical: persistent headaches diagnosis',
    turns: [
      { role: 'user', content: "I've been having headaches almost every day for the past 3 weeks. They're mostly on one side of my head, throbbing, and get worse when I look at screens. I've been taking ibuprofen but it only helps for a few hours. Should I be worried?", turn_hash: 'sha256:d0001' },
      { role: 'assistant', content: `Based on your description, this sounds most like **tension-type headaches** or **migraines without aura**, but there are a few things to sort out.

**What points toward migraines:**
- Unilateral (one side) — classic migraine pattern
- Throbbing quality — migraines pulse, tension headaches feel like pressure
- Screen sensitivity — light sensitivity (photophobia) is a migraine hallmark
- Duration and frequency match chronic migraine criteria (15+ days/month)

**What to rule out first:**
1. **Medication overuse headache (MOH)**: If you're taking ibuprofen more than 10-15 days per month, the medication itself starts CAUSING headaches. This creates a vicious cycle — more pain, more pills, more rebound pain. This is the #1 thing to check because the treatment is counterintuitive: you need to STOP the painkillers.
2. **Vision issues**: Uncorrected or worsening vision can cause daily headaches, especially with screen work. When was your last eye exam?
3. **Sleep and hydration**: These are boring but account for ~30% of chronic headache cases. Are you sleeping 7-8 hours? Drinking enough water?

**Red flags that need immediate attention** (go to ER):
- Sudden "thunderclap" headache (worst of your life)
- Headache with fever and stiff neck
- Vision changes, weakness, or confusion
- Headache after head injury

**My recommendation:**
1. First: Track your headaches for 2 weeks — time of day, what you ate, sleep quality, screen time, stress level. This data is more valuable than any single test.
2. Second: See your primary care doctor. They'll likely do a neurological exam and may refer you to a neurologist if the pattern looks like chronic migraine.
3. Meanwhile: Try the "2-2-2 rule" — no more than 2 doses of painkillers, on 2 days, in any 2-week period. This prevents medication overuse headache.`, turn_hash: 'sha256:d0002' },
      { role: 'user', content: "That's really helpful. I think you might be right about the medication overuse — I've been taking ibuprofen almost every day. And my last eye exam was 3 years ago. I'll book one. But what about the screen issue specifically? I work 10 hours a day on a computer and can't really reduce that.", turn_hash: 'sha256:d0003' },
      { role: 'assistant', content: `The screen issue is very manageable without reducing hours. Here's what actually works based on research:

**Immediate changes (today):**
1. **20-20-20 rule**: Every 20 minutes, look at something 20 feet away for 20 seconds. This relaxes the ciliary muscle that focuses your lens. Set a timer — you won't remember otherwise.
2. **Monitor position**: Top of screen at eye level, 20-26 inches away. If you look DOWN at the screen, your neck muscles strain, which triggers cervicogenic headaches (headaches that originate from the neck, not the brain).
3. **Brightness matching**: Your screen brightness should match the room. If the screen is a glowing rectangle in a dim room, your pupils are constantly adjusting. That's exhausting for your visual system.

**Medium-term (this week):**
- Blue light glasses: The evidence for blue light causing headaches is weak, BUT many people find them helpful. The reason might be that the slight tint reduces contrast, which reduces eye strain. Worth trying — they're cheap.
- Dark mode: Reduces total light output. Especially important in the evening when your pupils are dilated.
- Font size: Increase it 20%. You're probably squinting without realizing it. Squinting = sustained muscle tension = headache.

**The key insight about screen headaches**: The screen itself isn't usually the problem — it's the POSTURE and FOCUS PATTERN. You sit in one position, focus at one distance, for hours. Your eyes and neck weren't designed for that. The 20-20-20 rule breaks this pattern.

**If symptoms persist after 2 weeks of these changes + stopping daily ibuprofen**: See the doctor. You may need a preventive medication (like a low-dose beta blocker or amitriptyline) rather than treating each headache individually.`, turn_hash: 'sha256:d0004' },
    ],
  },

  // 2. STARTUP: Market entry strategy (decision tree, trade-offs, conditional paths)
  {
    name: '2. Startup: B2B SaaS market entry strategy',
    turns: [
      { role: 'user', content: "We've built an AI-powered contract review tool. It can analyze legal contracts and flag risky clauses, missing terms, and non-standard language. We've tested with 5 law firms and they love it. Now we need a go-to-market strategy. We have $500K in funding and 4 team members. What's our best path?", turn_hash: 'sha256:e0001' },
      { role: 'assistant', content: `With $500K and 4 people, you need a focused strategy. Let me break down your options.

**The fundamental question: Who is your customer?**

You've validated with law firms, but there are actually three distinct markets:
1. **Law firms** (AmLaw 100-500): High willingness to pay ($2K-10K/month), long sales cycles (3-6 months), need enterprise features (SSO, audit logs, custom models)
2. **In-house legal teams** (mid-size companies): Moderate willingness to pay ($500-2K/month), shorter sales cycles (1-2 months), need integrations (Salesforce, DocuSign)
3. **SMBs/startups**: Low willingness to pay ($50-200/month), self-serve, need simple UI and templates

**My recommendation: Start with in-house legal teams.**

Here's why:
- Law firms are the highest revenue but require enterprise sales (expensive, slow). With 4 people and $500K, you can't afford a 6-month sales cycle with no revenue.
- SMBs are the fastest to acquire but the revenue per customer is too low. You'd need thousands of customers to sustain the business, which requires marketing spend you don't have.
- In-house legal teams are the sweet spot: meaningful revenue ($500-2K), manageable sales cycle (1-2 months), and they have an urgent problem (they're drowning in vendor contracts with no dedicated review process).

**The wedge strategy:**
1. Focus on ONE contract type first. Vendor/supplier agreements are ideal — every company has them, they're relatively standardized, and the risk of missing something is real.
2. Price at $999/month for up to 50 contracts. This is cheap enough to not need CFO approval at most companies, but expensive enough to sustain your business.
3. Offer a 14-day free trial with white-glove onboarding. You personally review their first 5 contracts alongside the AI. This builds trust AND gives you training data.

**Warning**: Don't try to serve all three markets simultaneously. Each requires different product features, different pricing, different sales motions. Pick one, dominate it, then expand.`, turn_hash: 'sha256:e0002' },
      { role: 'user', content: "Makes sense. We'll focus on in-house legal teams. But how do we actually reach them? We don't have a sales team or marketing budget.", turn_hash: 'sha256:e0003' },
      { role: 'assistant', content: `With no sales team and minimal budget, you need a founder-led sales motion. Here's the playbook:

**Months 1-2: Build the pipeline (outbound)**
1. **LinkedIn prospecting**: Search for "General Counsel", "VP Legal", "Head of Legal" at companies with 200-2000 employees. These people are senior enough to buy but not at massive enterprises with procurement nightmares.
2. **The cold outreach formula**: Don't pitch the product. Instead, offer a free contract risk audit. "I'll review your top 5 vendor contracts and show you what you're missing." This is valuable even if they don't buy — and it generates your case studies.
3. **Volume**: Aim for 50 outreach messages per week. Expect 5-10% reply rate, 2-3% conversion to meeting. That's 4-6 meetings per month.

**Months 2-3: Content engine (inbound)**
1. **"Contracts Gone Wrong" blog series**: Write about real contract disasters (anonymized). "How a missing limitation of liability clause cost Company X $2M." Legal people love horror stories — they live in fear of being the one who missed something.
2. **LinkedIn posts**: Share contract review tips 3x/week. The algorithm favors the legal niche because engagement rates are high — lawyers comment on everything.
3. **Webinar**: Host a monthly "Contract Review Masterclass" with a guest GC. They bring their network, you provide the content. Cost: $0.

**Month 3+: Referral flywheel**
- After your first 5-10 customers, ask each for 2 introductions. In-house lawyers know each other — they attend the same conferences, same local bar events. A warm intro from a peer converts at 40%+ vs 3% for cold outreach.

**Budget allocation ($500K over 12 months):**
- Salaries: $300K (lean team, founder salary included)
- Tools: $50K (CRM, LinkedIn Sales Navigator, hosting)
- Content/events: $20K (webinars, blog design)
- Reserve: $130K (6 months runway buffer)

**The key metric to track**: Time to first meeting. If you can't get a meeting within 2 weeks of outreach, your messaging is wrong, not your channel.`, turn_hash: 'sha256:e0004' },
      { role: 'user', content: "Great plan. One more question — should we build integrations now (DocuSign, Google Docs, etc.) or wait? Some prospects are asking for them.", turn_hash: 'sha256:e0005' },
      { role: 'assistant', content: `**Don't build integrations yet.** Here's why and what to do instead:

**The trap**: Integrations feel like product improvements but they're actually distribution plays. They only matter when you have enough customers that the integration unlocks a new acquisition channel (like being listed in the DocuSign marketplace). With 5-10 customers, that's not where your bottleneck is.

**What to do instead:**
1. **Manual bridge**: For the first 20 customers, offer to manually import their contracts. Yes, it's ugly. But you'll learn exactly which formats they use, which fields matter, and where the integration needs to be robust. Building a DocuSign integration before you know these details means you'll build it wrong.
2. **CSV upload**: Build a simple CSV/PDF bulk upload. This covers 80% of use cases with 10% of the engineering effort.
3. **Track requests**: Keep a spreadsheet of which integrations are requested and by how many prospects. When 3+ paying customers ask for the same one, build it.

**When to build integrations:**
- You have 20+ paying customers
- A specific integration is blocking 3+ deals
- You have engineering capacity beyond core product work

**The one exception**: If a large customer (>$2K/month) makes an integration a deal-breaker, build it for them. But charge for it — either higher pricing or a setup fee. This validates demand and funds the development.

**Priority order when you do build:**
1. Google Drive/Docs (most in-house teams use Google Workspace)
2. DocuSign (contracts flow through here)
3. Slack (notifications for flagged clauses)
4. Everything else: wait for data`, turn_hash: 'sha256:e0006' },
    ],
  },

  // 3. DATA SCIENCE: ML pipeline debugging (step-by-step diagnosis, metrics)
  {
    name: '3. Data Science: ML model accuracy dropping',
    turns: [
      { role: 'user', content: "Our production ML model for fraud detection has been dropping in accuracy over the past month. It was 96% precision and 92% recall when we deployed it 6 months ago. Now it's at 89% precision and 78% recall. We retrained on recent data but it didn't help much. What's going on?", turn_hash: 'sha256:f0001' },
      { role: 'assistant', content: `This is a classic case of **model drift**, and the fact that retraining didn't help tells us something important. Let me walk through the systematic diagnosis.

**There are three types of drift — you need to figure out which one:**

1. **Data drift (covariate shift)**: The input distribution has changed. Maybe your users' behavior changed, or you're getting traffic from a new geography/demographic. The model's features look different from training.
   - How to check: Compare feature distributions between your training set and recent production data. Use KL divergence or PSI (Population Stability Index). If any feature's PSI > 0.25, it has drifted significantly.

2. **Concept drift**: The relationship between features and the target has changed. Maybe fraudsters changed their tactics — what used to be a fraud signal (e.g., high transaction velocity) is now normal behavior, or vice versa.
   - How to check: Look at your false positives and false negatives. Are the FPs all from a NEW pattern? Are the FNs things that USED to be caught?
   - This is the scariest type because retraining on drifted labels just teaches the model the wrong patterns.

3. **Label drift**: Your labeling process changed. Maybe a new analyst joined the fraud review team with different criteria, or an upstream system changed how it flags fraud.
   - How to check: Look at the label rate over time. If it jumped or dropped, your labels changed, not reality.

**Why retraining didn't help**: If you retrained on recent data and accuracy didn't improve, it's likely **concept drift + label contamination**. Your recent labels reflect the new fraud patterns (which the model misses), but they also include false negatives that the model created — it's a feedback loop. The model misses fraud, so the fraud isn't labeled, so the retrained model also misses it.

**Immediate action plan:**
1. Pull 500 recent transactions that the model classified as non-fraud and have a human expert manually review them. This breaks the feedback loop — you're checking the model's blind spots.
2. Run feature importance analysis on the old model vs the retrained model. If the top features changed dramatically, you have data drift. If they're similar but accuracy dropped, it's concept drift.
3. Check your monitoring dashboard for any upstream data pipeline changes in the past month — schema changes, new data sources, backfills that corrupted historical data.`, turn_hash: 'sha256:f0002' },
      { role: 'user', content: "We checked the feature distributions and found that transaction_velocity and geo_mismatch have shifted significantly (PSI > 0.3). Also, our fraud team lead left a month ago and the new person seems to be labeling differently. So it might be both data drift and label drift?", turn_hash: 'sha256:f0003' },
      { role: 'assistant', content: `Yes, you have a compound problem — data drift AND label drift simultaneously. This is actually good news because it means the fix is clear.

**Fix the label drift first** (most urgent):
1. **Calibration session**: Get 100 borderline cases and have both the new analyst and a senior team member label them independently. Calculate inter-annotator agreement (Cohen's kappa). If kappa < 0.7, there's a real labeling discrepancy.
2. **Create a labeling rubric**: Document the exact criteria for fraud vs non-fraud. Include edge cases. This should have existed before but many teams skip it.
3. **Re-label recent data**: Take the last month of labels from the new analyst and have them re-reviewed against the rubric. This gives you clean training data.

**Then address data drift:**
1. **Feature engineering**: transaction_velocity drifted because user behavior changed. Instead of raw velocity, use relative velocity (compared to each user's historical baseline). This is drift-resistant because it adapts to the new normal.
2. **geo_mismatch**: If this drifted because of VPN adoption or remote work, consider downweighting it or adding a "known VPN" feature. A feature that's noisy isn't useful.
3. **Sliding window retraining**: Instead of retraining on all historical data, use only the last 3 months. Old patterns don't apply anymore.

**The retraining strategy:**
1. Clean labels (from step 1) + recent data (3-month window) + drift-resistant features (from step 2)
2. Train a new model and evaluate on a HELD-OUT set of manually verified labels — not the automated labels
3. Deploy with shadow mode first: run both old and new model in parallel for 1 week, compare results on the manually reviewed set

**Long-term prevention:**
- Set up automated drift monitoring: alert when any feature's PSI exceeds 0.2
- Monthly label quality audit: randomly sample 50 labels, have a second reviewer check
- Quarterly model retraining with sliding window`, turn_hash: 'sha256:f0004' },
    ],
  },

  // 4. PERSONAL FINANCE: Investment strategy (risk assessment, trade-offs, math)
  {
    name: '4. Personal Finance: early retirement planning',
    turns: [
      { role: 'user', content: "I'm 35, earning $180K/year, saving about $4K/month. I have $350K in a mix of index funds and individual stocks. I want to retire early — ideally by 50. Is that realistic? What should I change?", turn_hash: 'sha256:g0001' },
      { role: 'assistant', content: `Let's do the math first, then strategy.

**Current trajectory (doing nothing different):**
- Current savings: $350K
- Monthly savings: $4K ($48K/year)
- Assumed return: 7% annual (inflation-adjusted, historical S&P 500 average)
- Years to 50: 15 years
- Projected portfolio at 50: ~$1.65M

**How much do you need?**
Using the 4% rule (withdraw 4% per year, portfolio survives 30+ years):
- $1.65M × 4% = $66K/year in retirement income
- After tax, that's roughly $55K-60K depending on your state

**Is $60K/year enough?** That depends on your lifestyle, but for most people it's tight — especially if you have healthcare costs (you won't have employer insurance until Medicare at 65). Budget $15K-20K/year for private health insurance alone.

**To retire comfortably at 50, you probably need $2.2M-2.5M:**
- $2.5M × 4% = $100K/year, which covers living expenses + healthcare + a buffer for market downturns

**The gap: You're on track for $1.65M but need $2.2-2.5M.**

**Three levers to close the gap:**

1. **Increase savings rate** (highest impact): Going from $4K to $6K/month gets you to ~$2.2M. That's an extra $24K/year. With $180K income, that means living on $108K pre-tax instead of $132K. Aggressive but doable if you optimize housing and transportation.

2. **Increase returns** (risky): Shifting from broad index funds to more aggressive growth allocation (small cap, international, some alternatives) might add 1-2% return. But it also adds volatility — a major crash at age 48 could delay retirement by years. I wouldn't rely on this.

3. **Reduce retirement expenses** (underrated): If you retire somewhere with lower cost of living (rural US, Portugal, Mexico, Thailand), $60K/year is very comfortable. Geographic arbitrage is the most powerful lever that people underuse.

**My recommendation**: Focus on lever 1 (increase savings) and lever 3 (plan for geographic flexibility). Don't gamble on higher returns.`, turn_hash: 'sha256:g0002' },
      { role: 'user', content: "The math is eye-opening. I think I can push to $5.5K/month savings if I downsize my apartment. But what about my investment allocation? Right now I'm 60% S&P 500 index, 20% individual tech stocks, and 20% bonds. Is that right for early retirement?", turn_hash: 'sha256:g0003' },
      { role: 'assistant', content: `Your allocation needs work. Here's why and what to change:

**Problem 1: Too much in individual stocks (20%)**
Individual stocks add unsystematic risk — risk you're NOT compensated for. If one of your tech stocks drops 50% (it happens), that's 10% of your portfolio gone. An index fund spreads the same sector exposure across hundreds of companies.
- **Action**: Sell individual stocks over the next 6 months (to spread tax events) and move to a total market index or tech sector ETF if you want tech exposure.

**Problem 2: Too much in bonds for your timeline (20%)**
At 35 with a 15-year horizon, 20% bonds is too conservative. Bonds return 2-3% real. Over 15 years, that 20% allocation costs you roughly $100K in missed growth compared to equities.
- **Action**: Drop bonds to 5-10%. You'll add more bonds as you approach retirement (the "bond tent" strategy).

**Problem 3: No international diversification**
100% US equity is a concentration bet. The US market has outperformed for 15 years, but that's not guaranteed to continue. International stocks (developed + emerging) provide diversification AND exposure to faster-growing economies.
- **Action**: Add 20-25% international via VXUS or IXUS.

**Recommended allocation for your situation:**
- 50% US total market (VTI or FXAIX)
- 25% International developed + emerging (VXUS)
- 15% Small cap value (VBR) — historically higher returns, compensates for higher volatility
- 10% Bonds (BND) — just enough for rebalancing during crashes

**The "bond tent" strategy for early retirement:**
- Age 35-45: 10% bonds (maximize growth)
- Age 45-50: Gradually increase to 30% bonds (protect against sequence-of-returns risk)
- Age 50-55: 30-40% bonds (you can't afford a crash right after retiring)
- Age 55+: Gradually reduce back to 20% bonds (longer horizon again)

**Tax optimization:**
- Max your 401K ($23K/year) — you get tax deduction NOW when your rate is high
- Max Roth IRA ($7K/year) — tax-free withdrawals in retirement
- Everything else goes in taxable brokerage — you'll need this for the gap between 50 and 59.5 (when you can access retirement accounts penalty-free)
- In the taxable account, use tax-loss harvesting: sell losers to offset gains, buy similar (not identical) funds immediately`, turn_hash: 'sha256:g0004' },
    ],
  },

  // 5. COOKING: Recipe troubleshooting (cause-effect, process, sensory)
  {
    name: '5. Cooking: why my sourdough keeps failing',
    turns: [
      { role: 'user', content: "I've been trying to make sourdough bread for 2 months and it keeps coming out dense and flat. I follow the recipe exactly — 500g flour, 350g water, 100g starter, 10g salt. I bulk ferment for 4 hours, shape, then cold proof overnight. The starter doubles in 6 hours. What am I doing wrong?", turn_hash: 'sha256:h0001' },
      { role: 'assistant', content: `Your recipe ratios are fine, so the issue is almost certainly in your process. Let me diagnose.

**Most likely cause: Underfermentation.**

Your starter doubles in 6 hours — that's on the slow side. A healthy, active starter should double in 3-4 hours at room temperature (75°F/24°C). A slow starter means:
- Less gas production during bulk ferment
- Less acid production (which gives structure)
- Your 4-hour bulk ferment isn't long enough for a slow starter

**How to confirm**: After your 4-hour bulk ferment, does the dough feel:
- Jiggly and domed? → Properly fermented
- Dense and tight? → Underfermented (most likely your issue)
- Slack and sticky with large bubbles? → Overfermented

**Fix #1: Strengthen your starter**
1. Feed it twice daily for a week (1:1:1 ratio — equal parts starter, flour, water by weight)
2. Use whole wheat or rye flour for one of the daily feeds — more food for the yeast
3. Keep it at 76-78°F. Every 5°F below that roughly doubles fermentation time.
4. Test: it should double in 3-4 hours consistently before you bake with it

**Fix #2: Extend your bulk ferment**
With your current starter speed, you likely need 6-8 hours, not 4. But don't go by time — go by these signs:
- Dough has increased 50-75% in volume (not doubled — that's overproofed)
- Surface has small bubbles
- When you pull a corner with wet fingers, it feels airy and extensible, not tight
- The "poke test": poke the dough with a floured finger. It should spring back slowly, not snap back.

**Fix #3: Check your water temperature**
This is the #1 mistake home bakers make. The recipe says "water" but the temperature matters enormously:
- Cold water (60°F): fermentation takes 8-10 hours
- Room temp water (72°F): fermentation takes 5-7 hours
- Warm water (80°F): fermentation takes 3-4 hours
Use 80-85°F water to compensate for your slower starter. Aim for a final dough temperature of 78°F.

**Fix #4: Your shaping might be too gentle**
A dense, flat loaf that had enough fermentation = weak shaping. You need enough surface tension that the dough holds its shape. Practice the "letter fold + tension pull" technique — pull the dough toward you on an unfloured surface to create tension on the skin.`, turn_hash: 'sha256:h0002' },
      { role: 'user', content: "I think you're right about underfermentation. My kitchen is pretty cold — around 68°F. And I've been using cold tap water. I'll try warmer water and longer ferment. But how do I know when the bulk ferment is actually done? I'm bad at judging the 50-75% volume increase by eye.", turn_hash: 'sha256:h0003' },
      { role: 'assistant', content: `68°F kitchen + cold water is absolutely your problem. That combination means your dough is probably fermenting at 65°F, which is VERY slow. At that temperature, a 4-hour bulk ferment gives you maybe 30% of the fermentation you need.

**How to measure bulk ferment precisely:**
1. **The container method**: Use a clear, straight-sided container (like a Cambro or tall Tupperware). Mark the starting level with a rubber band or tape. When the dough reaches 75% above the band, it's done. This removes all guesswork.
2. **The aliquot jar method** (most precise): When you mix your dough, take a small ball (30g) and put it in a tiny jar with a flat bottom. Mark the starting level. This jar sits next to your dough and rises at the same rate — but because it's transparent and small, you can see the volume change precisely.

**Temperature fixes for a cold kitchen:**
1. **Oven with light on**: Most oven lights generate 80-85°F with the door closed. Perfect proofing environment. Cost: $0.
2. **Microwave method**: Boil a cup of water, put it in the microwave, put your dough container next to it, close the door. This creates a warm, humid chamber. Replace the water every 2 hours.
3. **Warm water mix**: Use 90-95°F water in your dough. By the time you mix and do folds, the dough will settle to 78-80°F. This is the easiest fix.

**Revised timeline for your conditions:**
- Use 90°F water → target dough temp 78°F
- Bulk ferment in oven-with-light: 5-6 hours (check at 4 hours with aliquot jar)
- Shape when dough is 60-75% larger (not by time!)
- Cold proof overnight (12-16 hours in fridge)

**The single most important thing**: Stop following time-based recipes. Every kitchen is different. The DOUGH tells you when it's ready — you just need a way to measure (aliquot jar). Professional bakers never set timers for bulk ferment; they watch the dough.`, turn_hash: 'sha256:h0004' },
      { role: 'user', content: "The aliquot jar is genius, I'll try that this weekend. One more thing — when I score the bread before baking, the cuts seem to seal up and the bread doesn't get that nice ear. Is that related to the fermentation issue too?", turn_hash: 'sha256:h0005' },
      { role: 'assistant', content: `Yes and no. Scoring issues have two causes, and underfermentation is one of them.

**Cause 1: Underproofed dough (connected to your fermentation problem)**
When dough is underfermented, it's dense and tight. When you score it, there's not enough gas expansion to push the cut open. The cut just... closes. Fix the fermentation, and this partially fixes itself.

**Cause 2: Scoring technique (independent problem)**
Even with perfectly proofed dough, bad scoring = no ear. Here's what matters:
1. **Blade angle**: Hold the lame (razor) at 30° angle to the surface, not perpendicular. You're creating a flap that lifts during oven spring, not a vertical trench.
2. **Depth**: Cut 1/4 inch deep. Too shallow = seals shut. Too deep = collapses.
3. **Speed and confidence**: One swift motion. If you hesitate or saw back and forth, you tear the surface instead of cutting it, and torn edges seal.
4. **Cold dough is easier to score**: Score immediately out of the fridge, when the dough is firm. Warm dough is sticky and the blade drags.

**Cause 3: Steam (the forgotten factor)**
The ear forms because steam keeps the crust soft during the first 15 minutes of baking. Without steam, the crust sets hard before the dough can expand.
- Dutch oven: Preheat to 500°F, bake covered for 20 min, then uncovered at 450°F for 20-25 min. The lid traps steam perfectly.
- If no Dutch oven: Put a tray of boiling water on the bottom rack. Add 2-3 ice cubes when you load the bread. But honestly, a Dutch oven is worth the $40 — it's the single biggest upgrade for home sourdough.

**Priority order for your next bake:**
1. Fix water temperature (use 90°F) — solves underfermentation
2. Use aliquot jar — know when bulk is actually done
3. Score cold from fridge at 30° angle
4. Bake in Dutch oven if you have one

Get the fermentation right first. Everything else is polish.`, turn_hash: 'sha256:h0006' },
    ],
  },
];

// ══════════════════════════════════════════════════════════════════════════════
// Runner
// ══════════════════════════════════════════════════════════════════════════════

const STYLES = {
  concise: { granularity: 'concise', quote_length: 'representative', update_stance: 'conservative', tier3: 'extract' },
  balanced: { granularity: 'balanced', quote_length: 'representative', update_stance: 'balanced', tier3: 'extract' },
  detailed: { granularity: 'detailed', quote_length: 'representative', update_stance: 'aggressive', tier3: 'extract' },
};

const allResults = [];

for (const conv of CONVERSATIONS) {
  console.log('\n\n' + '▓'.repeat(80));
  console.log(`  ${conv.name} (${conv.turns.length} turns)`);
  console.log('▓'.repeat(80));

  const convResults = {};

  for (const mode of ['concise', 'balanced', 'detailed']) {
    const { systemPrompt, userPrompt } = buildYOpsPrompt(
      { turns: conv.turns, snapshot: undefined, processedTurnCount: 0 },
      STYLES[mode]
    );
    const combined = `${systemPrompt}\n\n---\n\n${userPrompt}`;

    const t0 = Date.now();
    let result;
    try {
      result = await provider.generate(combined, { temperature: 0.1, maxTokens: 8192 });
    } catch (err) {
      console.log(`\n█ ${mode.toUpperCase()} █  FAILED: ${err.message}`);
      convResults[mode] = { lines: 0, nodes: 0, slots: 0, tokens: 0 };
      continue;
    }
    const dt = Date.now() - t0;

    const yamlPart = result.text.split('---')[0];
    const lines = yamlPart.split('\n').filter(l => l.trim());
    const nodeCount = lines.filter(l => l.trim().endsWith(':')).length;
    const slotCount = lines.filter(l => l.includes(':') && !l.trim().endsWith(':')).length;

    convResults[mode] = { lines: lines.length, nodes: nodeCount, slots: slotCount, tokens: result.usage.outputTokens, dt };

    console.log(`\n█ ${mode.toUpperCase()} █  ${dt}ms | out=${result.usage.outputTokens} | lines=${lines.length} | nodes=${nodeCount} | slots=${slotCount}`);
    console.log(yamlPart.trimEnd());
  }

  allResults.push({ name: conv.name, ...convResults });
}

// ══════════════════════════════════════════════════════════════════════════════
// Summary Table
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n\n' + '═'.repeat(100));
console.log('  SUMMARY TABLE');
console.log('═'.repeat(100));
console.log('  Conversation                                  │ Concise        │ Balanced       │ Detailed');
console.log('  ' + '─'.repeat(96));

for (const r of allResults) {
  const c = r.concise || {};
  const b = r.balanced || {};
  const d = r.detailed || {};
  const name = r.name.padEnd(48);
  const concise = `${String(c.lines||0).padStart(3)}L ${String(c.slots||0).padStart(2)}S`;
  const balanced = `${String(b.lines||0).padStart(3)}L ${String(b.slots||0).padStart(2)}S`;
  const detailed = `${String(d.lines||0).padStart(3)}L ${String(d.slots||0).padStart(2)}S`;
  console.log(`  ${name}│ ${concise.padEnd(15)}│ ${balanced.padEnd(15)}│ ${detailed}`);
}

console.log('  ' + '─'.repeat(96));
// Totals
const totals = { c: { lines: 0, slots: 0 }, b: { lines: 0, slots: 0 }, d: { lines: 0, slots: 0 } };
for (const r of allResults) {
  totals.c.lines += r.concise?.lines || 0; totals.c.slots += r.concise?.slots || 0;
  totals.b.lines += r.balanced?.lines || 0; totals.b.slots += r.balanced?.slots || 0;
  totals.d.lines += r.detailed?.lines || 0; totals.d.slots += r.detailed?.slots || 0;
}
const totalC = `${String(totals.c.lines).padStart(3)}L ${String(totals.c.slots).padStart(2)}S`;
const totalB = `${String(totals.b.lines).padStart(3)}L ${String(totals.b.slots).padStart(2)}S`;
const totalD = `${String(totals.d.lines).padStart(3)}L ${String(totals.d.slots).padStart(2)}S`;
console.log(`  ${'TOTALS'.padEnd(48)}│ ${totalC.padEnd(15)}│ ${totalB.padEnd(15)}│ ${totalD}`);

console.log('\n  L=YAML lines, S=slots (leaf values)');
console.log('  Target ratios: Concise ~30%, Balanced ~70-80%, Detailed ~95%');
const ratio_b = (totals.b.slots / totals.d.slots * 100).toFixed(0);
const ratio_c = (totals.c.slots / totals.d.slots * 100).toFixed(0);
console.log(`  Actual ratios: Concise=${ratio_c}% of Detailed, Balanced=${ratio_b}% of Detailed`);
