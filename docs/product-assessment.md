# T3X Product Assessment

> Status: Active
> Assessment Date: 2026-02-10
> Scope: Full product assessment across 8 dimensions based on codebase review **and hands-on testing** (live API + WebUI).
> Related: `docs/product-strategy.md`, `docs/product-roadmap.md`, `docs/product-overview/`

---

## Overall Score: 6.4 / 10

> Revised from initial static-analysis score of 7.2 after hands-on testing uncovered critical runtime issues.

---

## Table of Contents

1. [Project Statistics](#1-project-statistics)
2. [Dimension Scores](#2-dimension-scores)
3. [Hands-On Test Results](#3-hands-on-test-results)
4. [Radar Overview](#4-radar-overview)
5. [Conclusions](#5-conclusions)

---

## 1. Project Statistics

| Metric | Value |
|--------|-------|
| TypeScript code | ~91K lines |
| Source files (TS/TSX) | 679 |
| Test files | 478 |
| E2E tests | 39 |
| Documentation files | 28 |
| Git commits | 565 |
| API endpoints | 65+ |
| Database tables | 18 (12 legacy + 6 V4) |
| Packages | 4 (`core`, `storage`, `api-client`, `runner`) |
| Apps | 5 (`web`, `api`, `runner`, `cli`, `agent-demo`) |

---

## 2. Dimension Scores

### 2.1 Vision & Positioning — 9 / 10

"Git for Meaning" is a clear, differentiated positioning. It addresses a real pain point in AI conversation knowledge management from a unique angle:

- **Deterministic core** (no LLM dependency) is a strong technical moat
- V4 architecture's "knowledge vs application separation" is a mature design insight
- Product strategy document benchmarks against GitHub/Figma/Notion/Dagster/Vercel/n8n, with clear combinatorial positioning logic
- One sentence can explain what the product is

**Deduction**: Target user groups are defined too broadly (AI teams + AI product builders + knowledge workers). Focus is not sharp enough. At open-source launch, users may face "it does everything but I don't know where to start" cognitive overload.

---

### 2.2 Architecture — 7.5 / 10 *(revised from 8.5)*

The three-layer architecture (Core → Storage → Product) has clean separation on paper, but hands-on testing reveals cracks:

| Strength | Details |
|----------|---------|
| Deterministic Core | Hash chains, diff, merge algorithms are 100% reproducible |
| V3→V4 evolution | Knowledge (Commit) and application (Leaf) separated; mature design |
| Multi-database adapters | PGLite / PostgreSQL / Supabase — three adapters |
| DAG structure | True Git-level commit graph (not a linear chain) |
| Monorepo standards | pnpm + Turborepo + Biome, clean build chain |

**Deductions**:
- **Dual database problem** (discovered in hands-on test): WebUI's DB Inspector connects to its own PGLite instance, completely separate from the API server's database. DB Inspector shows 0 rows across ALL tables while the API has real data. This is a fundamental data path inconsistency — two "single sources of truth" coexist.
- WebUI has two data paths: direct `@t3x/storage` access and API Server calls coexist; boundary is not fully clean
- 18 database tables carry historical baggage (commits_v2, commits_v3, drafts_v2 and other legacy tables still active)

---

### 2.3 Engineering Quality — 6.5 / 10 *(revised from 7.5)*

| Metric | Data | Assessment |
|--------|------|------------|
| Code size | ~91K lines TS, 679 files | Medium-large project |
| Test coverage | 478 test files + 39 E2E | Very solid; 300+ tests recently backfilled |
| API endpoints | ~44 route definitions, 65+ endpoints | Feature-complete |
| Commit history | 565 commits | Steady development pace |
| Documentation | 28 MD files | Comprehensive coverage |
| Code standards | Biome unified lint + format | Good consistency |
| Type safety | Full TypeScript, prefixed ID system | Excellent |

**Deductions**:
- **Missing npm dependency** (`react-joyride`): The entire WebUI returned a Build Error on every page. A `pnpm install` after fresh clone cannot produce a working site. This is a P0-level CI/QA gap — every visitor sees a white screen.
- **Diff API endpoint missing**: The documented `/api/v1/diff` endpoint returns 404. A core feature has no API surface.
- **API route documentation drift**: CLAUDE.md documents paths that don't match actual routes (e.g., `commits-v4` is project-scoped in reality but documented as flat). Developers following the docs will hit 404s.
- Zero authentication/authorization (anyone can call any API)
- Zero rate limiting
- PGLite has SIGKILL data corruption risk (known but unresolved)

---

### 2.4 Product Completeness — 5.5 / 10 *(revised from 6.5)*

The core triangle is ~85% built on paper, but hands-on testing reveals runtime gaps:

| Module | Completion | Key Gaps |
|--------|-----------|----------|
| Canvas workspace | 90% | Best page; renders knowledge graph well |
| Diff / Merge / Branch | 80% | Merge prepare works, but **diff API endpoint missing** |
| Source tracing | 100% | — |
| Leaf generation + validation | 90% | Template gallery UI |
| Pin / Context | 100% | — |
| Runner / Eval | 80% | Report as first-class asset |
| A/B comparison | 90% | Saved snapshots |
| **Home page** | **Broken** | **Renders empty despite API returning 4 projects** |
| **DB Inspector** | **Broken** | **Shows 0 rows in all tables (wrong database)** |
| Authentication | 0% | Entirely missing |
| Share links | 0% | Entirely missing |
| Template gallery | 0% | Entirely missing |
| Developer mode toggle | 0% | Entirely missing |
| Search | 0% | Entirely missing |
| Undo/Redo | 0% | Entirely missing |
| Mobile UI | 0% | Entirely missing |

Core API works well (CRUD, hash chains, merge prepare all verified), but the front-end has critical holes that break the first-use experience.

---

### 2.5 User Experience — 5.0 / 10 *(revised from 6.0)*

**What's done well**:
- Canvas visualization + ELK auto-layout (the best page in the product)
- Word-level diff highlighting (highly professional)
- Full-screen merge workspace, fully designed
- shadcn/ui + Framer Motion animations
- Dark/light mode toggle
- Loading skeletons + Toast notifications + empty states

**Problems discovered in hands-on testing**:
- **Onboarding modal blocks ALL pages**: WelcomeModal checks `t3x-onboarding-seen` in localStorage. For any new visitor (or cleared cache), a full-screen modal appears on every page with no obvious dismiss mechanism. Users cannot see the product at all.
- **Home page renders empty**: A new user who dismisses onboarding sees... nothing. Zero project cards despite data existing in the API. The first page of the product is broken.
- **No error boundaries**: When react-joyride was missing, every page showed a raw Next.js Build Error screen. No graceful degradation.
- ~50+ files directly expose Git terminology (Commit / Branch / Hash) — non-developer users cannot understand
- No developer mode toggle — Rule 1 ("80% of users should not see Git terms") is entirely unenforceable
- Execution mode is a placeholder shell ("Coming in v2.0")
- No search functionality — unusable as projects grow
- No Undo/Redo — accidental operations are irreversible

---

### 2.6 Documentation — 8.5 / 10

This is one of the project's highlights:

- 3 Product Overview documents (Product/Architecture/Engineering layers), ~3000 lines total, well-structured
- CLAUDE.md ~500 lines, AI-assisted development friendly
- Product strategy + roadmap documents at execution-ready level of detail
- API Reference + Specification documents
- Data flow diagrams and state diagrams complete

**Deductions**:
- Strategy/roadmap documents are in Chinese, Product Overview documents are in English — language inconsistency
- API endpoint documentation drifted from reality (routes documented in CLAUDE.md don't match actual API routes)
- Some specification documents may be outdated (needs verification)

---

### 2.7 Market Readiness — 4.5 / 10

**Clear gaps remain before open-source launch**:

| Missing Item | Impact |
|-------------|--------|
| Zero authentication | Cannot deploy to any multi-user environment |
| No share links | No distribution mechanism; growth engine is non-functional |
| No template gallery | New users have no starting point |
| Git terminology leaks | Non-technical users see "Commit" and "Hash" and leave |
| No search | Unusable as project scale grows |
| Execution mode placeholder | Promised but undelivered feature is negative signal |

The good news: the roadmap (Phase 0-3) has precisely defined every step with specific files and scope. An estimated 2-3 weeks of focused development can complete through Phase 1.

---

### 2.8 Extensibility — 7.5 / 10

| Dimension | Assessment |
|-----------|-----------|
| Plugin architecture | Extractors / Embedders are pluggable; Leaf types are extensible |
| API coverage | REST + OpenAPI + interactive docs; integration-friendly |
| CLI | Basic framework exists but commands are incomplete |
| Docker | Multi-profile orchestration (base / runner / n8n); deployment-friendly |
| Template engine | Rendering + variables + validation exist; Gallery missing |
| Ecosystem boundary | "Deterministic core + optional LLM layer" boundary is clean |

---

## 3. Hands-On Test Results

> All tests conducted 2026-02-10 against live instances: API (port 8000) + WebUI (port 3000).

### 3.1 WebUI Page-by-Page Evaluation

| # | Page | URL | Result | Details |
|---|------|-----|--------|---------|
| 1 | Home | `/` | **BUG** | API returns 4 projects, page renders empty. First impression is a blank page. |
| 2 | Canvas | `/project/proj_1da080be` | **Good** | Knowledge graph renders with nodes (conversations, commits). Most polished page. ELK layout works. |
| 3 | Insights | `/insights` | Working | Ledger cards showing commits. Dense but functional. |
| 4 | Deploy | `/deploy` | Working | 3 deploy agents listed. Functional but shows 3 identical "DD-03 Delete Me" agents — no cleanup mechanism. |
| 5 | A/B Compare | `/deploy/compare` | Working | Clean empty-state design. Layout is professional. |
| 6 | Agent Demo | `/agent-demo/chat` | Working | Clean chat interface. Functional. |
| 7 | Conversation | `/project/.../conversation/...` | Working | Turn bubbles render with markdown. Role labels and context panel visible. |
| 8 | DB Inspector | `/dev/db` | **BUG** | ALL tables show 0 rows. WebUI connects to its own PGLite instance, not the API server's database. |

**Blocking issues before first screenshot was possible**:
1. `react-joyride` missing from `package.json` → entire site shows Next.js Build Error on every page
2. After fixing build, WelcomeModal blocks ALL pages for new visitors (requires `t3x-onboarding-seen` in localStorage)

### 3.2 API End-to-End Test

| Test | Method | Result | Notes |
|------|--------|--------|-------|
| Create project | POST /api/v1/projects | **201 OK** | Returns `proj_` prefixed ID |
| Create conversation | POST /api/v1/projects/{id}/conversations | **201 OK** | Returns `conv_` prefixed ID |
| Add turns (×3) | POST /api/v1/conversations/{id}/turns | **201 OK** | Ring extraction automatic |
| Hash chain integrity | GET turns, verify parent_turn_hash | **Verified** | Each turn's parent_turn_hash matches previous turn's turn_hash |
| Commit determinism | POST commits-v4 | **Verified** | Hash is `sha256:` prefixed, deterministic |
| Create branch | POST branches | **201 OK** | Branch created from commit |
| List branches | GET branches | **200 OK** | Returns all branches |
| Fetch single commit | GET commits-v4/{hash} | **200 OK** | Full commit data with sentences |
| List turns with ring data | GET turns | **200 OK** | Extraction results embedded |
| **Merge prepare** | POST merge/prepare | **200 OK** | Correctly categorizes: identical / similarPairs / onlyInSource / onlyInTarget |
| **Diff endpoint** | GET /api/v1/diff | **404 NOT FOUND** | Documented but not implemented |

**API Summary**: Core CRUD is solid. Hash chains, deterministic commits, and merge preparation all work correctly. The diff endpoint is the only missing core feature.

### 3.3 Critical Bugs Found

| # | Severity | Bug | Impact |
|---|----------|-----|--------|
| 1 | **P0** | `react-joyride` missing from dependencies | Entire site broken — white screen on all pages |
| 2 | **P0** | Home page renders empty despite projects existing | First page a user sees is blank |
| 3 | **P1** | DB Inspector shows wrong database (0 rows everywhere) | Developer tool is non-functional |
| 4 | **P1** | Onboarding modal blocks all pages for new users | No way to see the product without code-level workaround |
| 5 | **P1** | Diff API endpoint returns 404 | Core feature has no API surface |
| 6 | **P2** | API route documentation doesn't match actual routes | Developers following CLAUDE.md hit 404s |

---

## 4. Radar Overview

```
              Vision  9.0
                /\
               /  \
  Extend 7.5  /    \  Arch 7.5
             /      \
            /  6.4   \
           /          \
  Market 4.5 ────────── Eng 6.5
           \          /
            \        /
          UX 5.0 ── Product 5.5
               \  /
             Docs 8.5
```

| Dimension | Static Score | Hands-On Score | Delta |
|-----------|-------------|----------------|-------|
| Vision & Positioning | 9.0 | 9.0 | — |
| Architecture | 8.5 | **7.5** | -1.0 |
| Documentation | 8.5 | 8.5 | — |
| Engineering Quality | 7.5 | **6.5** | -1.0 |
| Extensibility | 7.5 | 7.5 | — |
| Product Completeness | 6.5 | **5.5** | -1.0 |
| User Experience | 6.0 | **5.0** | -1.0 |
| Market Readiness | 4.5 | 4.5 | — |
| **Overall** | **7.2** | **6.4** | **-0.8** |

> The -0.8 delta reflects the gap between "code that looks correct" and "product that actually works." Dimensions relying on runtime behavior (Architecture, Engineering, Completeness, UX) all dropped. Dimensions based on design artifacts (Vision, Docs, Extensibility, Market) held steady.

---

## 5. Conclusions

**T3X is an architecturally ambitious project with a strong vision, but its runtime experience does not yet match the quality of its codebase.**

### Strengths
- **Vision is clear and differentiated**: "Git for Meaning" with deterministic core is a genuine technical moat
- **API layer is solid**: Core CRUD, hash chains, merge preparation — all verified working
- **Canvas page is polished**: Knowledge graph visualization is the product's showcase
- **Documentation is excellent**: Comprehensive, well-structured, development-friendly

### Critical Weaknesses
- **First-use experience is broken**: Missing dependency → build error → onboarding wall → empty home page. A new user sees 3 failures before seeing any content.
- **Dual database architecture leaks**: WebUI and API operate on different databases in dev mode, causing visible inconsistencies
- **Core feature gap**: Diff API endpoint is missing despite being documented

### Highest-ROI Fixes (ordered by impact)

| Priority | Fix | Estimated Effort | Score Impact |
|----------|-----|-----------------|--------------|
| 1 | Add `react-joyride` to dependencies, fix build | 5 minutes | +0.3 |
| 2 | Fix home page project rendering | 1-2 hours | +0.3 |
| 3 | Fix onboarding flow (dismiss, remember state properly) | 2-3 hours | +0.2 |
| 4 | Implement diff API endpoint | 1-2 days | +0.2 |
| 5 | Resolve dual database issue (single data path) | 2-3 days | +0.3 |
| 6 | Execute Phase 0 roadmap items | 2-3 weeks | +1.0 |

**One-line summary: The engine runs, but the car won't start — fix the ignition sequence (first-use experience) and this becomes a 7.5+ product overnight.**
